import { PermiscopeAdapter } from '../../adapters/PermiscopeAdapter';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Policy } from '../../core/types';

const policy: Policy = {
  scopes: [
    { actionName: 'allowed_op', decision: 'ALLOW' },
    { actionName: 'blocked_op', decision: 'BLOCK' },
    { actionName: 'approval_op', decision: 'REQUIRE_APPROVAL' },
  ],
};

describe('PermiscopeAdapter.wrap', () => {
  let auditLog: jest.SpyInstance;

  beforeEach(() => {
    auditLog = jest.spyOn(AuditLogger.prototype, 'log').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('executes once and writes paired audit entries for an allowed action', async () => {
    const calls: string[] = [];
    const adapter = new PermiscopeAdapter({ policy, defaultAgentId: 'wrap-test' });
    const safe = adapter.wrap('allowed_op', async (params) => {
      calls.push(params.value);
      return `done:${params.value}`;
    });

    await expect(safe({ value: 'x' })).resolves.toBe('done:x');
    expect(calls).toEqual(['x']);
    expect(auditLog).toHaveBeenCalledTimes(2);
    expect(auditLog.mock.calls.map(([entry]) => entry.phase)).toEqual(['INTENT', 'RESULT']);
  });

  test('does not execute a blocked action', async () => {
    let executed = false;
    const adapter = new PermiscopeAdapter({ policy, defaultAgentId: 'wrap-test' });
    const safe = adapter.wrap('blocked_op', async () => {
      executed = true;
      return 'never';
    });

    await expect(safe({})).rejects.toThrow('Permiscope Blocked Action');
    expect(executed).toBe(false);
    expect(auditLog).toHaveBeenCalledTimes(2);
    expect(auditLog.mock.calls.map(([entry]) => entry.phase)).toEqual(['INTENT', 'RESULT']);
  });

  test('uses a cached approval and still executes only once', async () => {
    jest.spyOn(ApprovalCache.prototype, 'isApproved').mockResolvedValue(true);
    let calls = 0;
    const adapter = new PermiscopeAdapter({ policy, defaultAgentId: 'wrap-test' });
    const safe = adapter.wrap('approval_op', async () => {
      calls += 1;
      return 'approved';
    });

    await expect(safe({})).resolves.toBe('approved');
    expect(calls).toBe(1);
    expect(auditLog).toHaveBeenCalledTimes(2);
    expect(auditLog.mock.calls.map(([entry]) => entry.phase)).toEqual(['INTENT', 'RESULT']);
  });

  test('preserves shadow mode for a blocked action', async () => {
    let executed = false;
    const adapter = new PermiscopeAdapter({
      policy,
      defaultAgentId: 'wrap-test',
      shadowMode: true,
    });
    const safe = adapter.wrap('blocked_op', async () => {
      executed = true;
      return 'never';
    });

    await expect(safe({})).resolves.toBe('[SHADOW] Action appeared successful.');
    expect(executed).toBe(false);
    expect(auditLog).toHaveBeenCalledTimes(2);
    expect(auditLog.mock.calls.map(([entry]) => entry.phase)).toEqual(['INTENT', 'RESULT']);
  });
});
