import { Server } from 'http';
import { AddressInfo } from 'net';

describe('fail-closed host defaults', () => {
  const previousToken = process.env.PERMISCOPE_DASHBOARD_TOKEN;
  const previousAnonymous = process.env.PERMISCOPE_DASHBOARD_ALLOW_ANONYMOUS;
  const previousSecret = process.env.PERMISCOPE_AUDIT_SECRET;

  afterAll(() => {
    if (previousToken === undefined) delete process.env.PERMISCOPE_DASHBOARD_TOKEN;
    else process.env.PERMISCOPE_DASHBOARD_TOKEN = previousToken;
    if (previousAnonymous === undefined) delete process.env.PERMISCOPE_DASHBOARD_ALLOW_ANONYMOUS;
    else process.env.PERMISCOPE_DASHBOARD_ALLOW_ANONYMOUS = previousAnonymous;
    if (previousSecret === undefined) delete process.env.PERMISCOPE_AUDIT_SECRET;
    else process.env.PERMISCOPE_AUDIT_SECRET = previousSecret;
  });

  test('dashboard rejects every API request when no token is configured', async () => {
    delete process.env.PERMISCOPE_DASHBOARD_TOKEN;
    delete process.env.PERMISCOPE_DASHBOARD_ALLOW_ANONYMOUS;
    process.env.PERMISCOPE_AUDIT_SECRET = 'host-test-key';

    const { app } = await import('../../dashboard/server');
    const server: Server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      for (const route of ['/api/logs', '/api/approvals', '/api/chain']) {
        const response = await fetch(`${baseUrl}${route}`);
        expect(response.status).toBe(401);
      }
      const response = await fetch(`${baseUrl}/api/logs`);
      expect((await response.json()).error).toMatch(/PERMISCOPE_DASHBOARD_TOKEN/);
    } finally {
      server.closeAllConnections?.();
      server.close();
    }
  });

  test('signature-requiring logger refuses to start without a secret', async () => {
    delete process.env.PERMISCOPE_AUDIT_SECRET;
    const { AuditLogger } = await import('../../logging/AuditLogger');
    const dir = process.env.TEMP ?? process.cwd();
    expect(
      () => new AuditLogger(dir, true, { requireSignature: true, logPath: `${dir}/missing.log` }),
    ).toThrow(/Audit signing secret required/);
  });
});
