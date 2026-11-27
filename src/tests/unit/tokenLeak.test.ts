import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createSidecar } from '../../sidecar/server';
import { AuditLogger } from '../../logging/AuditLogger';
import { signHs256Token } from '../../auth/verifiedPrincipal';

const SECRET = 'super-secret-sidecar-token';

describe('credentials never enter the audit log', () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-token-leak-'));
    logPath = path.join(dir, 'audit.log');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a live sidecar request does not write its bearer token to the log', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'key', keyId: 'v1' });
    const { app } = createSidecar({
      policy: { scopes: [{ actionName: 'echo', decision: 'ALLOW' }] },
      token: SECRET,
      customExecutors: { echo: async () => 'ok' },
      gatewayOptions: { auditLogger: logger },
    });

    const server: Server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/execute`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ actionName: 'echo', parameters: { text: 'hi' } }),
      });
      expect(response.status).toBe(200);
    } finally {
      server.closeAllConnections?.();
      server.close();
    }

    const contents = fs.readFileSync(logPath, 'utf-8');
    expect(contents).toContain('"actionName":"echo"');
    expect(contents).not.toContain(SECRET);
    expect(logger.verifyChain().valid).toBe(true);
  });

  test('credential-shaped fields and JWT values are redacted recursively', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'key', keyId: 'v1' });
    const jwt = signHs256Token({ sub: 'alice' }, 'signing-key');
    await logger.log({
      timestamp: new Date().toISOString(),
      agentId: 'e2e',
      action: {
        actionName: 'echo',
        parameters: { token: jwt, nested: { Authorization: `Bearer ${jwt}` } },
        agentId: 'e2e',
        timestamp: new Date(),
      },
      decision: 'ALLOW',
      result: { success: true, output: { accessToken: jwt } },
    });

    const contents = fs.readFileSync(logPath, 'utf-8');
    expect(contents).not.toContain(jwt);
    expect(contents).not.toContain('Bearer ');
    expect(contents).toContain('[redacted]');
    expect(logger.verifyChain().valid).toBe(true);
  });
});
