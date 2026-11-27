import { AddressInfo } from 'net';
import { Server } from 'http';
import { setTimeout as delay } from 'timers/promises';
import { IdempotencyCache } from '../../gateway/IdempotencyCache';
import { createSidecar } from '../../sidecar/server';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { GatewayResult } from '../../gateway/ExecutionGateway';

const result = (): GatewayResult => ({
  decision: 'ALLOW',
  success: true,
  sideEffects: 'committed',
});

describe('idempotency cache', () => {
  test('replays a cached result with a replay marker', async () => {
    const cache = new IdempotencyCache();
    await cache.set('principal', 'key-1', result());
    const replayed = await cache.get('principal', 'key-1');
    expect(replayed?.replayed).toBe(true);
    expect(replayed?.success).toBe(true);
    expect(await cache.get('principal', 'other')).toBeUndefined();
  });

  test('evicts the oldest entry when full', async () => {
    const cache = new IdempotencyCache(2);
    await cache.set('p', 'a', result());
    await cache.set('p', 'b', result());
    await cache.set('p', 'c', result());
    expect(cache.size).toBe(2);
    expect(await cache.get('p', 'a')).toBeUndefined();
    expect(await cache.get('p', 'c')).toBeDefined();
  });

  test('expires entries after the TTL', async () => {
    const cache = new IdempotencyCache(10, 20);
    await cache.set('p', 'a', result());
    await delay(30);
    expect(cache.size).toBe(0);
    expect(await cache.get('p', 'a')).toBeUndefined();
  });

  test('concurrent duplicates share one computation', async () => {
    const cache = new IdempotencyCache();
    let calls = 0;
    const compute = async () => {
      calls += 1;
      await delay(10);
      return result();
    };
    const [first, second] = await Promise.all([
      cache.getOrCompute('p', 'same', compute),
      cache.getOrCompute('p', 'same', compute),
    ]);
    expect(calls).toBe(1);
    expect(first.replayed).toBeUndefined();
    expect(second.replayed).toBeUndefined();
    expect((await cache.getOrCompute('p', 'same', compute)).replayed).toBe(true);
    expect(calls).toBe(1);
  });
});

describe('sidecar idempotency', () => {
  let server: Server;
  let baseUrl: string;
  let execute: jest.Mock;

  beforeEach(async () => {
    execute = jest.fn().mockResolvedValue('done');
    const { app } = createSidecar({
      policy: { scopes: [{ actionName: 'echo', decision: 'ALLOW' }] },
      token: 'test-token',
      customExecutors: { echo: execute },
      gatewayOptions: {
        auditLogger: { log: async () => undefined } as unknown as AuditLogger,
        approvalCache: { isApproved: async () => false } as unknown as ApprovalCache,
      },
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    server.closeAllConnections?.();
    server.close();
  });

  const post = (key?: string) =>
    fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: JSON.stringify({ actionName: 'echo', parameters: { text: 'hi' } }),
    });

  test('retries with the same key replay the first result', async () => {
    const first = await (await post('stable-key')).json();
    const second = await (await post('stable-key')).json();
    expect(first.replayed).toBeUndefined();
    expect(second.replayed).toBe(true);
    expect(second.output).toBe('done');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('a different key executes again', async () => {
    await post('key-a');
    await post('key-b');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test('requests without a key always execute', async () => {
    await post();
    await post();
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
