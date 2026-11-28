import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action, AuditLogEntry, Policy } from '../../core/types';
import { AuditLogger } from '../../logging/AuditLogger';

const policy: Policy = {
  scopes: [{ actionName: 'sensitive', decision: 'REQUIRE_APPROVAL' }],
};

function action(): Action {
  return {
    actionName: 'sensitive',
    parameters: { file: 'config.json' },
    agentId: 'alice',
    timestamp: new Date(),
  };
}

describe('approval lifecycle', () => {
  let dir: string;
  let cache: ApprovalCache;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-approvals-'));
    cache = new ApprovalCache(dir, 60_000);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('pending requests expire and cannot be approved afterwards', async () => {
    await cache.requestApproval('alice', 'sensitive', { x: 1 });
    expect(await cache.getAll()).toHaveLength(1);

    const file = path.join(dir, 'approvals.json');
    const records = JSON.parse(fs.readFileSync(file, 'utf-8'));
    records[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(file, JSON.stringify(records, null, 2));

    expect(await cache.getAll()).toHaveLength(0);
    expect(await cache.approve('alice', 'sensitive', { x: 1 })).toBe(false);
  });

  test('approvals are single use', async () => {
    await cache.requestApproval('alice', 'sensitive', { x: 1 });
    expect(await cache.approve('alice', 'sensitive', { x: 1 })).toBe(true);
    expect(await cache.isApproved('alice', 'sensitive', { x: 1 })).toBe(true);
    expect(await cache.consumeApproval('alice', 'sensitive', { x: 1 })).toBe(true);
    expect(await cache.isApproved('alice', 'sensitive', { x: 1 })).toBe(false);
    expect(await cache.consumeApproval('alice', 'sensitive', { x: 1 })).toBe(false);
  });

  test('a governed action consumes its approval but a dry run does not', async () => {
    const auditLogger = {
      log: async (_entry: AuditLogEntry) => undefined,
      verifyChain: () => ({ valid: true, errors: [] }),
    } as unknown as AuditLogger;
    const gateway = new ExecutionGateway(
      new PolicyEngine(policy),
      {},
      {
        approvalCache: cache,
        auditLogger,
        defaultPrincipalId: 'alice',
        approver: async () => false,
      },
    );

    await cache.requestApproval('alice', 'sensitive', { file: 'config.json' });
    await cache.approve('alice', 'sensitive', { file: 'config.json' });

    const dryRun = await gateway.run(action(), true);
    expect(dryRun.decision).toBe('ALLOW');
    expect(await cache.isApproved('alice', 'sensitive', { file: 'config.json' })).toBe(true);

    const executed = await gateway.run(action());
    expect(executed.decision).toBe('ALLOW');
    expect(executed.reasonCode).toBe('APPROVAL_GRANTED');
    expect(await cache.isApproved('alice', 'sensitive', { file: 'config.json' })).toBe(false);
  });

  test('a stale pending request is replaced, not reused', async () => {
    await cache.requestApproval('alice', 'sensitive', { x: 1 });
    const file = path.join(dir, 'approvals.json');
    const records = JSON.parse(fs.readFileSync(file, 'utf-8'));
    records[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(file, JSON.stringify(records, null, 2));

    await cache.requestApproval('alice', 'sensitive', { x: 1 });
    const refreshed = (await cache.getAll())[0];
    expect(refreshed.status).toBe('PENDING');
    expect(new Date(refreshed.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });
});
