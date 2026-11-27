import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Action, Policy } from '../../core/types';

function action(actionName: string, parameters: Record<string, any>): Action {
  return { actionName, parameters, agentId: 'reason-test', timestamp: new Date() };
}

describe('structured denial reasons', () => {
  const tmp = os.tmpdir();

  test('unknown action reports NO_MATCHING_SCOPE', async () => {
    const engine = new PolicyEngine({ scopes: [] });
    const result = await engine.evaluateDetailed(action('unknown', {}));
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('NO_MATCHING_SCOPE');
    expect(result.remediation).toBeTruthy();
  });

  test('path guardrail reports GUARDRAIL_PATH', async () => {
    const policy: Policy = {
      scopes: [{ actionName: 'read_file', decision: 'ALLOW', allowedPaths: [tmp] }],
    };
    const result = await new PolicyEngine(policy).evaluateDetailed(
      action('read_file', { path: path.join(path.dirname(process.cwd()), 'secret.txt') }),
    );
    expect(result.reasonCode).toBe('GUARDRAIL_PATH');
  });

  test('command guardrail reports GUARDRAIL_COMMAND', async () => {
    const policy: Policy = {
      scopes: [
        { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['rm -rf'] },
      ],
    };
    const result = await new PolicyEngine(policy).evaluateDetailed(
      action('run_command', { command: 'rm -rf /' }),
    );
    expect(result.reasonCode).toBe('GUARDRAIL_COMMAND');
  });

  test('a skipped validator reports NO_APPLICABLE_SCOPE', async () => {
    const policy: Policy = {
      scopes: [
        {
          actionName: 'read_file',
          decision: 'REQUIRE_APPROVAL',
          allowedPaths: [tmp],
          validator: () => false,
        },
      ],
    };
    const result = await new PolicyEngine(policy).evaluateDetailed(
      action('read_file', { path: path.join(tmp, 'notes.txt') }),
    );
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('NO_APPLICABLE_SCOPE');
  });

  test('approval-required actions carry APPROVAL_REQUIRED', async () => {
    const policy: Policy = {
      scopes: [{ actionName: 'sensitive', decision: 'REQUIRE_APPROVAL' }],
    };
    const result = await new PolicyEngine(policy).evaluateDetailed(action('sensitive', {}));
    expect(result.reasonCode).toBe('APPROVAL_REQUIRED');
  });

  test('the gateway exposes the reason code on its result', async () => {
    const policy: Policy = {
      scopes: [
        { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['rm -rf'] },
      ],
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-reason-'));
    const gateway = new ExecutionGateway(
      new PolicyEngine(policy),
      {},
      {
        auditLogger: { log: async () => undefined } as unknown as AuditLogger,
        approvalCache: { isApproved: async () => false } as unknown as ApprovalCache,
        defaultPrincipalId: 'reason-test',
      },
    );
    const result = await gateway.run(action('run_command', { command: 'rm -rf /' }));
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('GUARDRAIL_COMMAND');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
