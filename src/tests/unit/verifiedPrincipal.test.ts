import { verifiedPrincipalProvider, signHs256Token } from '../../auth/verifiedPrincipal';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Action } from '../../core/types';
import { withRequestContext } from '../../core/requestContext';

const secret = 'test-signing-secret';
const providerOptions = { secret, issuer: 'issuer', audience: 'permiscope' };

function token(overrides: Record<string, any> = {}): string {
  return signHs256Token(
    {
      sub: 'alice',
      roles: ['admin'],
      iss: 'issuer',
      aud: 'permiscope',
      exp: Math.floor(Date.now() / 1000) + 600,
      ...overrides,
    },
    secret,
  );
}

function action(roles?: string[]): Action {
  return {
    actionName: 'safe',
    parameters: {},
    agentId: 'spoofed',
    timestamp: new Date(),
    roles,
  };
}

/** Credentials travel in request context, never on the Action. */
function verify(t: string, roles?: string[]) {
  return withRequestContext({ token: t }, () =>
    verifiedPrincipalProvider(providerOptions)(action(roles)),
  );
}

describe('verified principals', () => {
  test('accepts a valid token and extracts id/roles', async () => {
    await expect(verify(token())).resolves.toEqual({ id: 'alice', roles: ['admin'] });
  });

  test('rejects invalid signature, expiry, issuer and audience', async () => {
    await expect(verify(token().slice(0, -2) + 'xx')).rejects.toThrow();
    await expect(verify(token({ exp: Math.floor(Date.now() / 1000) - 100 }))).rejects.toThrow(
      'Token expired',
    );
    await expect(verify(token({ iss: 'other' }))).rejects.toThrow('issuer mismatch');
    await expect(verify(token({ aud: 'other' }))).rejects.toThrow('audience mismatch');
  });

  test('role-gated scopes require the verified role', async () => {
    const engine = new PolicyEngine({
      scopes: [{ actionName: 'safe', decision: 'ALLOW', roles: ['admin'] }],
    });
    await expect(engine.evaluate(action(['admin']))).resolves.toBe('ALLOW');
    await expect(engine.evaluate(action([]))).resolves.toBe('BLOCK');
  });

  test('gateway uses the verified principal instead of caller-supplied identity', async () => {
    const gateway = new ExecutionGateway(
      new PolicyEngine({ scopes: [{ actionName: 'safe', decision: 'ALLOW', roles: ['admin'] }] }),
      { safe: async () => 'ok' },
      {
        principalProvider: verifiedPrincipalProvider(providerOptions),
        auditLogger: { log: async () => undefined } as unknown as AuditLogger,
        approvalCache: { isApproved: async () => false } as unknown as ApprovalCache,
      },
    );
    const result = await withRequestContext({ token: token() }, () => gateway.run(action()));
    expect(result.success).toBe(true);
  });
});
