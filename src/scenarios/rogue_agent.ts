import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExecutionGateway, GatewayResult } from '../gateway/ExecutionGateway';
import { PolicyEngine } from '../engine/PolicyEngine';
import { ApprovalCache } from '../gateway/ApprovalCache';
import { AuditLogger } from '../logging/AuditLogger';
import { Action, AuditLogEntry, PermissionDecision, Policy } from '../core/types';

const FIXED_TIME = '2026-11-27T00:00:00.000Z';
const DEMO_SECRET = 'permiscope-demo-fixture-secret';
const OUTPUT = path.resolve(__dirname, '../../eval/fixtures/rogue-agent.json');

const policy: Policy = {
  scopes: [
    { actionName: 'read_config', decision: 'ALLOW' },
    { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['rm -rf'] },
    { actionName: 'delete_file', decision: 'REQUIRE_APPROVAL' },
    { actionName: 'shadow_action', decision: 'BLOCK' },
  ],
};

function makeAction(actionName: string, parameters: Record<string, any>): Action {
  return {
    actionName,
    parameters,
    agentId: 'rogue-agent',
    reason: 'Demonstration of governed execution',
    timestamp: new Date(FIXED_TIME),
  };
}

/**
 * Runs a fully stubbed rogue-agent scenario through the real gateway and audit
 * logger, then writes a deterministic fixture with a verified signed chain.
 */
export async function generateRogueFixture(outputPath: string = OUTPUT): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-rogue-'));
  try {
    const auditLogger = new AuditLogger(tempDir, true, { secret: DEMO_SECRET });
    const approvalCache = {
      isApproved: async () => true,
      isRejected: async () => false,
      requestApproval: async () => undefined,
      approve: async () => true,
      consumeApproval: async () => true,
    } as unknown as ApprovalCache;

    // Shadow mode is a host setting, not an action flag. Use two gateways that
    // share one audit logger so the fixture can show a hard block and a shadow
    // block in the same verified chain.
    const createGateway = (shadowMode: boolean): ExecutionGateway =>
      new ExecutionGateway(
        new PolicyEngine(policy),
        {
          read_config: async () => 'worker_processes 1;',
          run_command: async () => 'should never run',
          delete_file: async () => 'deleted',
          shadow_action: async () => 'should never run',
        },
        {
          auditLogger,
          approvalCache,
          defaultPrincipalId: 'rogue-agent',
          shadowMode,
          clock: () => new Date(FIXED_TIME),
        },
      );
    const normalGateway = createGateway(false);
    const shadowGateway = createGateway(true);

    const steps: Array<{
      name: string;
      action: Action;
      expected: PermissionDecision;
      gateway: ExecutionGateway;
    }> = [
      {
        name: 'read config',
        action: makeAction('read_config', { path: 'nginx.conf' }),
        expected: 'ALLOW',
        gateway: normalGateway,
      },
      {
        name: 'dangerous delete',
        action: makeAction('run_command', { command: 'rm -rf /' }),
        expected: 'BLOCK',
        gateway: normalGateway,
      },
      {
        name: 'approved delete',
        action: makeAction('delete_file', { path: '/etc/passwd' }),
        expected: 'ALLOW',
        gateway: normalGateway,
      },
      {
        name: 'shadow action',
        action: makeAction('shadow_action', {}),
        expected: 'SHADOW_BLOCK',
        gateway: shadowGateway,
      },
    ];

    const results: GatewayResult[] = [];
    for (const step of steps) {
      const result = await step.gateway.run(step.action);
      if (result.decision !== step.expected) {
        throw new Error(`${step.name}: expected ${step.expected}, got ${result.decision}`);
      }
      results.push({ decision: result.decision, success: result.success });
    }

    const chain = auditLogger.verifyChain();
    if (!chain.valid) {
      throw new Error(`Rogue-agent audit chain failed verification: ${chain.errors.join('; ')}`);
    }

    const raw = fs.readFileSync(path.join(tempDir, 'audit.log'), 'utf-8');
    const entries = raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as AuditLogEntry);

    const fixture = {
      version: '1.1.0',
      scenario: 'rogue-agent',
      generatedAt: FIXED_TIME,
      chain: { valid: chain.valid, errors: chain.errors, entries: entries.length },
      steps: steps.map((step, index) => ({
        name: step.name,
        actionName: step.action.actionName,
        parameters: step.action.parameters,
        expected: step.expected,
        actual: results[index].decision,
      })),
      entries,
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2) + '\n');
    console.log(`Wrote ${outputPath} (${entries.length} verified audit entries)`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  generateRogueFixture().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
