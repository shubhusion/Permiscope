import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';

function makeAction(agentId: string): Action {
  return {
    actionName: 'sensitive',
    parameters: { x: 1 },
    agentId,
    timestamp: new Date(),
  };
}

describe('approval boundary', () => {
  let base: string;
  let cache: ApprovalCache;
  let logger: AuditLogger;
  let engine: PolicyEngine;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-approval-'));
    cache = new ApprovalCache(base, 60);
    logger = new AuditLogger(base);
    engine = new PolicyEngine({
      scopes: [{ actionName: 'sensitive', decision: 'REQUIRE_APPROVAL' }],
    });
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    jest.spyOn(AuditLogger.prototype, 'log').mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalIsTTY === undefined) {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    }
    jest.restoreAllMocks();
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('a caller-supplied identity cannot reuse another principal approval', async () => {
    await cache.requestApproval('alice', 'sensitive', { x: 1 });
    await cache.approve('alice', 'sensitive', { x: 1 });

    const gateway = new ExecutionGateway(
      engine,
      {},
      {
        approvalCache: cache,
        auditLogger: logger,
        defaultPrincipalId: 'alice',
        principalProvider: () => ({ id: 'bob' }),
        approver: async () => false,
        approvalTimeoutMs: 100,
      },
    );

    const result = await gateway.run(makeAction('alice'));
    expect(result.decision).toBe('BLOCK');
  });

  test('rejections expire after the TTL', async () => {
    await cache.requestApproval('alice', 'sensitive', { x: 1 });
    const [request] = await cache.getAll();
    await cache.updateStatus(request.id, 'REJECTED');

    expect(await cache.isRejected('alice', 'sensitive', { x: 1 })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(await cache.isRejected('alice', 'sensitive', { x: 1 })).toBe(false);
  });

  test('approve() cannot create a pre-approval', async () => {
    expect(await cache.approve('alice', 'sensitive', { x: 1 })).toBe(false);
    expect(await cache.isApproved('alice', 'sensitive', { x: 1 })).toBe(false);
  });

  test('non-interactive approval fails closed at the timeout', async () => {
    const gateway = new ExecutionGateway(
      engine,
      {},
      {
        approvalCache: cache,
        auditLogger: logger,
        defaultPrincipalId: 'alice',
        approvalTimeoutMs: 80,
        approvalPollIntervalMs: 20,
      },
    );

    const start = Date.now();
    const result = await gateway.run(makeAction('alice'));
    expect(result.decision).toBe('BLOCK');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('close() cancels an in-flight approval wait', async () => {
    const gateway = new ExecutionGateway(
      engine,
      {},
      {
        approvalCache: cache,
        auditLogger: logger,
        defaultPrincipalId: 'alice',
        approvalTimeoutMs: 5000,
        approvalPollIntervalMs: 20,
      },
    );

    const run = gateway.run(makeAction('alice'));
    setTimeout(() => gateway.close(), 20);
    await expect(run).resolves.toMatchObject({ decision: 'BLOCK' });
  });

  test('concurrent requests are all preserved', async () => {
    await Promise.all([
      cache.requestApproval('alice', 'sensitive', { x: 1 }),
      cache.requestApproval('bob', 'sensitive', { x: 1 }),
    ]);
    expect(await cache.getAll()).toHaveLength(2);
  });
});
