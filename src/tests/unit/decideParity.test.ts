import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { withRequestContext } from '../../core/requestContext';
import { verifiedPrincipalProvider, signHs256Token } from '../../auth/verifiedPrincipal';
import { Action } from '../../core/types';

const secret = 'parity-secret';

function token(roles: string[]): string {
  return signHs256Token({ sub: 'alice', roles }, secret);
}

function action(): Action {
  return {
    actionName: 'protected',
    parameters: {},
    agentId: 'spoofed',
    timestamp: new Date(),
  };
}

function gateway(budget?: { maxCalls: number }): ExecutionGateway {
  return new ExecutionGateway(
    new PolicyEngine({
      scopes: [{ actionName: 'protected', decision: 'ALLOW', roles: ['admin'] }],
    }),
    { protected: async () => 'ok' },
    {
      principalProvider: verifiedPrincipalProvider({ secret }),
      defaultPrincipalId: 'alice',
      auditLogger: { log: async () => undefined } as unknown as AuditLogger,
      approvalCache: { isApproved: async () => false } as unknown as ApprovalCache,
      ...(budget ? { budget } : {}),
    },
  );
}

async function withToken<T>(value: string, work: () => T): Promise<T> {
  return withRequestContext({ token: value }, work);
}

describe('decide/execute parity', () => {
  test('a verified admin gets ALLOW from both endpoints', async () => {
    const gw = gateway();
    const decision = await withToken(token(['admin']), () => gw.decide(action()));
    const result = await withToken(token(['admin']), () => gw.run(action()));
    expect(decision).toBe('ALLOW');
    expect(result.decision).toBe('ALLOW');
    expect(result.success).toBe(true);
  });

  test('a verified non-admin gets BLOCK from both endpoints', async () => {
    const gw = gateway();
    const decision = await withToken(token([]), () => gw.decide(action()));
    const result = await withToken(token([]), () => gw.run(action()));
    expect(decision).toBe('BLOCK');
    expect(result.decision).toBe('BLOCK');
    expect(result.success).toBe(false);
  });

  test('decide never executes the action', async () => {
    const execute = jest.fn().mockResolvedValue('ok');
    const gw = new ExecutionGateway(
      new PolicyEngine({
        scopes: [{ actionName: 'protected', decision: 'ALLOW', roles: ['admin'] }],
      }),
      { protected: execute },
      {
        principalProvider: verifiedPrincipalProvider({ secret }),
        auditLogger: { log: async () => undefined } as unknown as AuditLogger,
        approvalCache: { isApproved: async () => false } as unknown as ApprovalCache,
      },
    );
    await withToken(token(['admin']), () => gw.decide(action()));
    expect(execute).not.toHaveBeenCalled();
    await withToken(token(['admin']), () => gw.run(action()));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('budgets apply to decide calls', async () => {
    const gw = gateway({ maxCalls: 1 });
    const first = await withToken(token(['admin']), () => gw.decide(action()));
    const second = await withToken(token(['admin']), () => gw.decide(action()));
    expect(first).toBe('ALLOW');
    expect(second).toBe('BLOCK');
  });

  test('caller-supplied roles cannot override the verified principal', async () => {
    const gw = gateway();
    const spoofed: Action = { ...action(), roles: ['admin'], agentId: 'admin' };
    const decision = await withToken(token([]), () => gw.decide(spoofed));
    expect(decision).toBe('BLOCK');
  });
});
