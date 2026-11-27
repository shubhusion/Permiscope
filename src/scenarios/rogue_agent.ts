import * as fs from 'fs';
import * as path from 'path';
import { ExecutionGateway, GatewayResult } from '../gateway/ExecutionGateway';
import { PolicyEngine } from '../engine/PolicyEngine';
import { ApprovalCache } from '../gateway/ApprovalCache';
import { AuditLogger } from '../logging/AuditLogger';
import { Action, AuditLogEntry, PermissionDecision, Policy } from '../core/types';

const FIXED_TIME = '2026-11-27T00:00:00.000Z';
const OUTPUT = path.resolve(__dirname, '../../eval/fixtures/rogue-agent.json');

const policy: Policy = {
  scopes: [
    { actionName: 'read_config', decision: 'ALLOW' },
    { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['rm -rf'] },
    { actionName: 'delete_file', decision: 'REQUIRE_APPROVAL' },
    { actionName: 'shadow_action', decision: 'BLOCK' },
  ],
};

function makeAction(actionName: string, parameters: Record<string, any>, shadow = false): Action {
  return {
    actionName,
    parameters,
    agentId: 'rogue-agent',
    reason: 'Demonstration of governed execution',
    timestamp: new Date(FIXED_TIME),
    ...(shadow ? { shadowMode: true } : {}),
  } as Action;
}

/** Runs a fully stubbed rogue-agent scenario and writes a deterministic fixture. */
export async function generateRogueFixture(): Promise<void> {
  const entries: Array<AuditLogEntry & { sequence: number }> = [];
  const auditLogger = {
    log: async (entry: AuditLogEntry) => {
      entries.push({ ...entry, timestamp: FIXED_TIME, sequence: entries.length + 1 });
    },
    verifyChain: () => ({ valid: true, errors: [] }),
  } as unknown as AuditLogger;

  const approvalCache = {
    isApproved: async () => true,
    isRejected: async () => false,
    requestApproval: async () => undefined,
    approve: async () => true,
  } as unknown as ApprovalCache;

  const gateway = new ExecutionGateway(
    new PolicyEngine(policy),
    {
      read_config: async () => 'worker_processes 1;',
      run_command: async () => 'should never run',
      delete_file: async () => 'deleted',
      shadow_action: async () => 'should never run',
    },
    { auditLogger, approvalCache, defaultPrincipalId: 'rogue-agent' },
  );

  const steps: Array<{ name: string; action: Action; expected: PermissionDecision }> = [
    {
      name: 'read config',
      action: makeAction('read_config', { path: 'nginx.conf' }),
      expected: 'ALLOW',
    },
    {
      name: 'dangerous delete',
      action: makeAction('run_command', { command: 'rm -rf /' }),
      expected: 'BLOCK',
    },
    {
      name: 'approved delete',
      action: makeAction('delete_file', { path: '/etc/passwd' }),
      expected: 'ALLOW',
    },
    {
      name: 'shadow action',
      action: makeAction('shadow_action', {}, true),
      expected: 'SHADOW_BLOCK',
    },
  ];

  const results: GatewayResult[] = [];
  for (const step of steps) {
    const result = await gateway.run(step.action);
    if (result.decision !== step.expected) {
      throw new Error(`${step.name}: expected ${step.expected}, got ${result.decision}`);
    }
    results.push({ decision: result.decision, success: result.success });
  }

  const fixture = {
    version: '1.0.0',
    scenario: 'rogue-agent',
    generatedAt: FIXED_TIME,
    steps: steps.map((step, index) => ({
      name: step.name,
      actionName: step.action.actionName,
      parameters: step.action.parameters,
      expected: step.expected,
      actual: results[index].decision,
    })),
    entries,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT} (${entries.length} audit entries)`);
}

if (require.main === module) {
  generateRogueFixture().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
