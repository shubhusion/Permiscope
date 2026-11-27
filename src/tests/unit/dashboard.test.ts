import { Server } from 'http';
import { AddressInfo } from 'net';

process.env.PERMISCOPE_DASHBOARD_TOKEN = 'dashboard-test-token';

describe('dashboard API authentication', () => {
  let server: Server;
  let baseUrl: string;
  const headers = { Authorization: 'Bearer dashboard-test-token' };

  beforeAll(async () => {
    const { app } = await import('../../dashboard/server');
    const { AuditLogger } = await import('../../logging/AuditLogger');
    const logger = new AuditLogger('./logs', false, { secret: 'test-key', keyId: 'v1' });
    await logger.log({
      timestamp: new Date().toISOString(),
      agentId: 'dashboard-test',
      action: {
        actionName: 'read_file',
        parameters: { path: '/tmp/secret.txt' },
        agentId: 'dashboard-test',
        timestamp: new Date(),
      },
      decision: 'ALLOW',
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections?.();
    server.close();
  });

  test('rejects unauthenticated reads', async () => {
    for (const path of ['/api/logs', '/api/approvals', '/api/chain']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(401);
    }
  });

  test('redacts parameter values by default', async () => {
    const response = await fetch(`${baseUrl}/api/logs`, { headers });
    expect(response.status).toBe(200);
    const logs = await response.json();
    const entry = logs.find((item: any) => item.agentId === 'dashboard-test');
    expect(entry.action.parameters.path).toBe('[redacted]');
  });

  test('allows raw parameter values with an explicit flag', async () => {
    const response = await fetch(`${baseUrl}/api/logs?raw=1`, { headers });
    const logs = await response.json();
    const entry = logs.find((item: any) => item.agentId === 'dashboard-test');
    expect(entry.action.parameters.path).toBe('/tmp/secret.txt');
  });
});
