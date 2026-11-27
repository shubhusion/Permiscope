import * as os from 'os';
import * as path from 'path';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { isPathWithin } from '../../engine/pathGuard';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Action, PermissionScope, Postcondition } from '../../core/types';

const auditLogger = { log: async () => undefined } as unknown as AuditLogger;
const approvalCache = { isApproved: async () => false } as unknown as ApprovalCache;

function action(parameters: Record<string, any> = {}): Action {
  return {
    actionName: 'safe',
    parameters,
    agentId: 'postcondition-test',
    timestamp: new Date(),
  };
}

function gateway(scope: PermissionScope) {
  return new ExecutionGateway(
    new PolicyEngine({ scopes: [scope] }),
    { safe: async () => 'ok' },
    { auditLogger, approvalCache, defaultPrincipalId: 'postcondition-test' },
  );
}

describe('post-conditions', () => {
  test('passing post-condition preserves success', async () => {
    const postcondition: Postcondition = {
      description: 'output must be ok',
      check: (_action, output) => output === 'ok',
    };
    const result = await gateway({
      actionName: 'safe',
      decision: 'ALLOW',
      postconditions: [postcondition],
    }).run(action());

    expect(result.success).toBe(true);
    expect(result.output).toBe('ok');
  });

  test('failing post-condition marks the result unsuccessful with a reason', async () => {
    const result = await gateway({
      actionName: 'safe',
      decision: 'ALLOW',
      postconditions: [{ description: 'must fail', check: () => false }],
    }).run(action());

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('POSTCONDITION_FAILED');
    expect(result.error).toContain('must fail');
  });

  test('a throwing post-condition fails closed', async () => {
    const result = await gateway({
      actionName: 'safe',
      decision: 'ALLOW',
      postconditions: [
        {
          check: () => {
            throw new Error('boom');
          },
        },
      ],
    }).run(action());

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('POSTCONDITION_FAILED');
  });

  test('path post-condition can verify the target stayed inside the root', async () => {
    const tmp = os.tmpdir();
    const postcondition: Postcondition = {
      description: 'path stays under temp',
      check: (a) => isPathWithin(a.parameters.path, [tmp]),
    };
    const gw = gateway({
      actionName: 'safe',
      decision: 'ALLOW',
      allowedPaths: [tmp],
      postconditions: [postcondition],
    });

    expect((await gw.run(action({ path: path.join(tmp, 'out.txt') }))).success).toBe(true);
    const escaped = await gw.run(action({ path: path.join(path.dirname(process.cwd()), 'x.txt') }));
    expect(escaped.success).toBe(false);
    expect(escaped.reasonCode).toBe('POSTCONDITION_FAILED');
  });
});
