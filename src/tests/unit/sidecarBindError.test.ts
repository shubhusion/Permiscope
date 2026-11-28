import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { startSidecar } from '../../sidecar/server';

process.env.PERMISCOPE_AUDIT_SECRET = 'bind-test-key';

describe('startSidecar bind errors', () => {
  let blocker: Server;

  afterEach(async () => {
    if (blocker?.listening) {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  test('a port conflict rejects instead of resolving a dead server', async () => {
    blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const port = (blocker.address() as AddressInfo).port;

    await expect(
      startSidecar({
        policy: { scopes: [{ actionName: 'echo', decision: 'ALLOW' }] },
        token: 'test-token',
        host: '127.0.0.1',
        port,
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
