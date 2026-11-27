import { spawn, execSync, ChildProcess } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import { McpGovernor } from '../src/adapters/McpGovernor';
import { ExecutionGateway } from '../src/gateway/ExecutionGateway';
import { PolicyEngine } from '../src/engine/PolicyEngine';
import { ApprovalCache } from '../src/gateway/ApprovalCache';
import { AuditLogger } from '../src/logging/AuditLogger';
import { verifiedPrincipalProvider, signHs256Token } from '../src/auth/verifiedPrincipal';
import { withRequestContext } from '../src/core/requestContext';
import { Policy } from '../src/core/types';

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dashboardUrl = 'http://127.0.0.1:3100';
const sidecarUrl = 'http://127.0.0.1:8788';
const token = 'e2e-token';

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`E2E FAILED: ${message}`);
  console.log(`  ok - ${message}`);
}

function start(command: string, args: string[], env: Record<string, string>): ChildProcess {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(`[e2e] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[e2e] ${chunk}`));
  return child;
}

async function waitFor(url: string, label: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await delay(200);
  }
  throw new Error(`E2E FAILED: ${label} did not become ready`);
}

const stubAudit = { log: async () => undefined } as unknown as AuditLogger;
const stubCache = {
  isApproved: async () => false,
  isRejected: async () => false,
  requestApproval: async () => undefined,
  approve: async () => true,
} as unknown as ApprovalCache;

function gateway(policy: Policy, options: Record<string, any> = {}): ExecutionGateway {
  return new ExecutionGateway(new PolicyEngine(policy), { noop: async () => 'ok' }, {
    auditLogger: stubAudit,
    approvalCache: stubCache,
    defaultPrincipalId: 'e2e',
    ...options,
  });
}

async function main(): Promise<void> {
  const children: ChildProcess[] = [];
  try {
    console.log('Starting dashboard and sidecar processes...');
    children.push(
      start('node', ['-r', 'ts-node/register', 'src/dashboard/server.ts'], {
        PERMISCOPE_DASHBOARD_TOKEN: token,
        PERMISCOPE_DASHBOARD_PORT: '3100',
      }),
    );
    children.push(
      start('node', ['-r', 'ts-node/register', 'src/cli/index.ts', 'serve'], {
        PERMISCOPE_SIDECAR_TOKEN: token,
        PERMISCOPE_SIDECAR_PORT: '8788',
      }),
    );
    await waitFor(`${dashboardUrl}/`, 'dashboard');
    await waitFor(`${sidecarUrl}/health`, 'sidecar');

    console.log('Dashboard API:');
    const unauth = await fetch(`${dashboardUrl}/api/logs`);
    check(unauth.status === 401, 'unauthenticated log read is rejected');
    const authHeaders = { Authorization: `Bearer ${token}` };
    const logs = await fetch(`${dashboardUrl}/api/logs`, { headers: authHeaders });
    check(logs.status === 200, 'authenticated log read succeeds');

    console.log('Sidecar decide/execute:');
    const post = (body: unknown) =>
      fetch(`${sidecarUrl}/v1/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
    const allowed = await post({ actionName: 'run_command', parameters: { command: 'echo e2e' } });
    const allowedBody = await allowed.json();
    check(allowedBody.decision === 'ALLOW' && allowedBody.success === true, 'allowed command executes');
    const blocked = await post({ actionName: 'run_command', parameters: { command: 'rm -rf /' } });
    const blockedBody = await blocked.json();
    check(blockedBody.decision === 'BLOCK', 'dangerous command is blocked');

    console.log('Log redaction:');
    const redacted = await (await fetch(`${dashboardUrl}/api/logs`, { headers: authHeaders })).json();
    const entry = redacted.find((item: any) => item.action?.parameters?.command !== undefined);
    check(entry?.action?.parameters?.command === '[redacted]', 'log parameters are redacted by default');
    const raw = await (
      await fetch(`${dashboardUrl}/api/logs?raw=1`, { headers: authHeaders })
    ).json();
    check(raw.some((item: any) => item.action?.parameters?.command === 'echo e2e'), 'raw=1 reveals original parameters');

    console.log('Python SDK:');
    const python = spawn('python', ['python/example_agent.py'], {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: path.join(root, 'python'),
        PERMISCOPE_SIDECAR_URL: sidecarUrl,
        PERMISCOPE_SIDECAR_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let pythonOut = '';
    let pythonErr = '';
    python.stdout?.on('data', (chunk) => (pythonOut += chunk.toString()));
    python.stderr?.on('data', (chunk) => (pythonErr += chunk.toString()));
    const pythonCode = await new Promise<number>((resolve) =>
      python.on('close', (code) => resolve(code ?? 1)),
    );
    check(
      pythonCode === 0 &&
        pythonOut.includes('policy decision:') &&
        pythonOut.includes('governed execution:'),
      `Python client talks to live sidecar (code=${pythonCode}, out=${pythonOut}, err=${pythonErr})`,
    );

    console.log('MCP governor:');
    const mcp = new McpGovernor({
      client: { callTool: async () => 'ok' },
      policy: { scopes: [{ actionName: 'mcp:echo', decision: 'ALLOW' }] },
      gatewayOptions: { auditLogger: stubAudit, approvalCache: stubCache },
    });
    const mcpResult = await mcp.callTool('echo', { text: 'hi' });
    check(mcpResult.isError === false && mcpResult.decision === 'ALLOW', 'MCP tool call is governed');

    console.log('Budgets:');
    const budgeted = gateway({ scopes: [{ actionName: 'noop', decision: 'ALLOW' }] }, {
      budget: { maxCalls: 1 },
    });
    await budgeted.run({ actionName: 'noop', parameters: {}, agentId: 'e2e', timestamp: new Date() });
    const budgetResult = await budgeted.run({ actionName: 'noop', parameters: {}, agentId: 'e2e', timestamp: new Date() });
    check(budgetResult.reasonCode === 'BUDGET_EXCEEDED', 'second call exceeds budget');

    console.log('Post-conditions:');
    const postchecked = gateway(
      {
        scopes: [
          {
            actionName: 'noop',
            decision: 'ALLOW',
            postconditions: [{ description: 'must fail', check: () => false }],
          },
        ],
      },
    );
    const postResult = await postchecked.run({ actionName: 'noop', parameters: {}, agentId: 'e2e', timestamp: new Date() });
    check(postResult.reasonCode === 'POSTCONDITION_FAILED', 'post-condition failure is reported');

    console.log('JWT principals:');
    const secret = 'e2e-jwt-secret';
    const jwt = signHs256Token({ sub: 'alice', roles: ['admin'] }, secret);
    const principal = await withRequestContext({ token: jwt }, () =>
      verifiedPrincipalProvider({ secret })({
        actionName: 'noop',
        parameters: {},
        agentId: 'spoofed',
        timestamp: new Date(),
      }),
    );
    check(principal.id === 'alice' && !!principal.roles?.includes('admin'), 'JWT principal verified');

    console.log('Package and audit:');
    execSync(`${npm} run check:package`, { cwd: root, stdio: 'ignore' });
    check(true, 'CJS and ESM entry points load');
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-e2e-audit-'));
    const auditLogger = new AuditLogger(auditDir, false, { secret: 'e2e-key', keyId: 'v1' });
    await auditLogger.log({
      timestamp: new Date().toISOString(),
      agentId: 'e2e',
      action: {
        actionName: 'noop',
        parameters: {},
        agentId: 'e2e',
        timestamp: new Date(),
      },
      decision: 'ALLOW',
    });
    const logPath = path.join(auditDir, 'audit.log');
    execSync(
      `"${process.execPath}" -r ts-node/register src/cli/index.ts verify "${logPath}"`,
      {
        cwd: root,
        stdio: 'ignore',
        env: {
          ...process.env,
          PERMISCOPE_AUDIT_KEY_RING: JSON.stringify({ v1: 'e2e-key' }),
        },
      },
    );
    check(true, 'signed audit chain verifies via CLI');
    fs.rmSync(auditDir, { recursive: true, force: true });

    console.log('E2E PASSED');
  } finally {
    for (const child of children) child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
