import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PermiscopeAdapter, withPermiscope } from '../../adapters/PermiscopeAdapter';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Policy } from '../../core/types';

const policy: Policy = {
  scopes: [
    { actionName: 'custom', decision: 'ALLOW' },
    { actionName: 'explode', decision: 'ALLOW' },
  ],
};

describe('adapter configuration branches', () => {
  let dir: string;
  let auditLogger: AuditLogger;
  let approvalCache: ApprovalCache;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-adapter-'));
    auditLogger = { log: async () => undefined } as unknown as AuditLogger;
    approvalCache = { isApproved: async () => false } as unknown as ApprovalCache;
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('configured custom executors are used by act()', async () => {
    const adapter = new PermiscopeAdapter({
      policy,
      defaultAgentId: 'config-test',
      customExecutors: { custom: async () => 'from-config' },
      auditLogger,
      approvalCache,
    });
    await expect(adapter.act('custom', {})).resolves.toBe('from-config');
    expect(adapter.getPolicyEngine()).toBeDefined();
  });

  test('withPermiscope builds a governed function', async () => {
    const governed = withPermiscope('custom', async () => 'from-helper', {
      policy,
      auditLogger,
      approvalCache,
    });
    await expect(governed({})).resolves.toBe('from-helper');
  });

  test('executor errors are surfaced with a reason code', async () => {
    const adapter = new PermiscopeAdapter({
      policy,
      defaultAgentId: 'config-test',
      customExecutors: {
        explode: async () => {
          throw new Error('boom');
        },
      },
      auditLogger,
      approvalCache,
    });
    await expect(adapter.act('explode', {})).rejects.toThrow('ALLOWED');
  });
});
