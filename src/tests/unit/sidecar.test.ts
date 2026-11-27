import { Server } from 'http';
import { AddressInfo } from 'net';
import { createSidecar } from '../../sidecar/server';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Policy } from '../../core/types';

const policy: Policy = {
  scopes: [
    { actionName: 'echo', decision: 'ALLOW' },
    {
      actionName: 'run_command',
      decision: 'ALLOW',
      blockedCommandPatterns: ['rm -rf'],
    },
  ],
};

const stubLogger = {
  log: jest.fn().mockResolvedValue(undefined),
  verifyChain: jest.fn(),
} as unknown as AuditLogger;

const stubCache = {
  isApproved: async () => false,
  isRejected: async () => false,
  requestApproval: async () => undefined,
  approve: async () => false,
} as unknown as ApprovalCache;

describe('HTTP sidecar', () => {
  let server: Server;
  let baseUrl: string;
  let invoked: string[];

  beforeEach(async () => {
    invoked = [];
    const { app } = createSidecar({
      policy,
      token: 'test-token',
      port: 0,
      customExecutors: {
        echo: async (params) => {
          invoked.push(params.text);
          return `echo:${params.text}`;
        },
      },
      gatewayOptions: { auditLogger: stubLogger, approvalCache: stubCache },
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    server.closeAllConnections?.();
    server.close();
  });

  const post = (path: string, body: unknown, token?: string) =>
    fetch(baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  test('health is public', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  test('requires a bearer token', async () => {
    const response = await post('/v1/decide', { actionName: 'echo' });
    expect(response.status).toBe(401);
  });

  test('decides without executing', async () => {
    const response = await post(
      '/v1/decide',
      { actionName: 'echo', parameters: { text: 'hi' } },
      'test-token',
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ decision: 'ALLOW' });
    expect(invoked).toEqual([]);
  });

  test('blocks dangerous commands', async () => {
    const response = await post(
      '/v1/decide',
      { actionName: 'run_command', parameters: { command: 'rm -rf /' } },
      'test-token',
    );
    await expect(response.json()).resolves.toEqual({ decision: 'BLOCK' });
  });

  test('executes an allowed action', async () => {
    const response = await post(
      '/v1/execute',
      { actionName: 'echo', parameters: { text: 'hi' } },
      'test-token',
    );
    expect(await response.json()).toMatchObject({
      decision: 'ALLOW',
      success: true,
      output: 'echo:hi',
    });
    expect(invoked).toEqual(['hi']);
  });

  test('rejects invalid bodies', async () => {
    const response = await post('/v1/decide', { parameters: {} }, 'test-token');
    expect(response.status).toBe(400);
  });

  test('rejects oversized bodies', async () => {
    const { app } = createSidecar({
      policy,
      token: 'test-token',
      maxBodyBytes: 128,
      gatewayOptions: { auditLogger: stubLogger, approvalCache: stubCache },
    });
    const small = app.listen(0);
    await new Promise<void>((resolve) => small.once('listening', resolve));
    const url = `http://127.0.0.1:${(small.address() as AddressInfo).port}`;
    const response = await fetch(`${url}/v1/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ actionName: 'echo', parameters: { text: 'x'.repeat(1000) } }),
    });
    expect(response.status).toBe(413);
    small.closeAllConnections?.();
    small.close();
  });

  test('refuses a non-loopback bind by default', () => {
    expect(() => createSidecar({ policy, token: 'test-token', host: '0.0.0.0' })).toThrow(
      /non-loopback/,
    );
  });
});
