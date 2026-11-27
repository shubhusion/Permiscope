import { Server } from 'http';
import { AddressInfo } from 'net';

process.env.PERMISCOPE_DASHBOARD_PORT = '3210';
process.env.PERMISCOPE_DASHBOARD_TOKEN = 'cors-token';

describe('dashboard CORS', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = await import('../../dashboard/server');
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections?.();
    server.close();
  });

  const preflight = (origin: string) =>
    fetch(`${baseUrl}/api/logs`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    });

  test('allows the configured dashboard port', async () => {
    const response = await preflight('http://localhost:3210');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3210');
  });

  test('does not allow the hardcoded default port', async () => {
    const response = await preflight('http://localhost:3000');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
