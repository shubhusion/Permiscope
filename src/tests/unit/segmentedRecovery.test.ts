import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHmac } from 'crypto';
import { AuditLogger } from '../../logging/AuditLogger';
import { migrateLegacyAudit } from '../../logging/migrateAudit';
import { resolveVerifyTarget } from '../../cli/index';

function entry(text: string) {
  return {
    timestamp: '2026-11-28T00:00:00.000Z',
    agentId: 'audit-test',
    action: {
      actionName: 'echo',
      parameters: { text },
      agentId: 'audit-test',
      timestamp: new Date('2026-11-28T00:00:00.000Z'),
    },
    decision: 'ALLOW' as const,
    result: { success: true },
  };
}

describe('segmented audit recovery and CLI verification', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-audit-fixes-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('recovers a manifest left behind by a crash between head and manifest writes', async () => {
    const logDir = path.join(dir, 'audit');
    const options = { secret: 'k', keyId: 'v1', segmented: true, logDir };
    const logger = new AuditLogger(dir, false, options);
    await logger.log(entry('one'));
    await logger.log(entry('two'));

    const head = JSON.parse(fs.readFileSync(path.join(logDir, 'segment-000001.head'), 'utf-8'));
    const stale = {
      version: 1,
      activeSegment: 1,
      lastSequence: 1,
      lastHash: head.lastHash,
      keyId: 'v1',
    };
    const signature = createHmac('sha256', 'k').update(JSON.stringify(stale)).digest('hex');
    fs.writeFileSync(path.join(logDir, 'manifest.json'), JSON.stringify({ ...stale, signature }));

    const recovered = new AuditLogger(dir, false, options);
    expect(recovered.verifyChain().valid).toBe(true);
  });

  test('migration signs with a key supplied only through the environment key ring', async () => {
    const logPath = path.join(dir, 'audit.log');
    const legacy = new AuditLogger(dir, false, {
      logPath,
      secret: 'ring-key',
      keyId: 'v1',
    });
    await legacy.log(entry('migrated'));

    const previousSecret = process.env.PERMISCOPE_AUDIT_SECRET;
    const previousKeyId = process.env.PERMISCOPE_AUDIT_KEY_ID;
    const previousRing = process.env.PERMISCOPE_AUDIT_KEY_RING;
    try {
      delete process.env.PERMISCOPE_AUDIT_SECRET;
      process.env.PERMISCOPE_AUDIT_KEY_ID = 'v1';
      process.env.PERMISCOPE_AUDIT_KEY_RING = JSON.stringify({ v1: 'ring-key' });

      const target = path.join(dir, 'audit');
      const result = migrateLegacyAudit(logPath, target);
      expect(result.entries).toBe(1);
      const verifier = new AuditLogger(dir, false, { segmented: true, logDir: target });
      expect(verifier.verifyChain().valid).toBe(true);
    } finally {
      if (previousSecret === undefined) delete process.env.PERMISCOPE_AUDIT_SECRET;
      else process.env.PERMISCOPE_AUDIT_SECRET = previousSecret;
      if (previousKeyId === undefined) delete process.env.PERMISCOPE_AUDIT_KEY_ID;
      else process.env.PERMISCOPE_AUDIT_KEY_ID = previousKeyId;
      if (previousRing === undefined) delete process.env.PERMISCOPE_AUDIT_KEY_RING;
      else process.env.PERMISCOPE_AUDIT_KEY_RING = previousRing;
    }
  });

  test('refuses to overwrite a partial migration target', async () => {
    const logPath = path.join(dir, 'audit.log');
    const legacy = new AuditLogger(dir, false, { logPath, secret: 'k', keyId: 'v1' });
    await legacy.log(entry('one'));

    const target = path.join(dir, 'audit');
    fs.mkdirSync(target);
    const partial = path.join(target, 'segment-000001.log');
    fs.writeFileSync(partial, 'partial');

    expect(() => migrateLegacyAudit(logPath, target)).toThrow(/incomplete|already exists/);
    expect(fs.readFileSync(partial, 'utf-8')).toBe('partial');
  });

  test('verify resolution is read-only and rejects flags and missing paths', () => {
    expect(() => resolveVerifyTarget('--help')).toThrow(/Usage/);
    const missing = path.join(dir, 'missing.log');
    expect(() => resolveVerifyTarget(missing)).toThrow(/not found/);
    expect(fs.existsSync(missing)).toBe(false);

    const existing = path.join(dir, 'audit.log');
    fs.writeFileSync(existing, '');
    expect(resolveVerifyTarget(existing).loggerOptions.segmented).toBe(false);
  });
});
