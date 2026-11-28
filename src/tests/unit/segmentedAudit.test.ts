import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditLogger } from '../../logging/AuditLogger';
import { migrateLegacyAudit } from '../../logging/migrateAudit';

function entry(index: number) {
  return {
    timestamp: new Date().toISOString(),
    agentId: 'segment-test',
    action: {
      actionName: 'safe',
      parameters: { index },
      agentId: 'segment-test',
      timestamp: new Date(),
    },
    decision: 'ALLOW' as const,
    result: { success: true, output: `value-${index}` },
  };
}

describe('segmented audit log', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-segments-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('rotates entries into segments and verifies the chain', async () => {
    const logger = new AuditLogger(dir, false, {
      secret: 'k',
      keyId: 'v1',
      segmented: true,
      maxSegmentEntries: 2,
    });
    for (let i = 1; i <= 5; i += 1) await logger.log(entry(i));

    const segmentDir = path.join(dir, 'audit');
    expect(fs.existsSync(path.join(segmentDir, 'segment-000001.log'))).toBe(true);
    expect(fs.existsSync(path.join(segmentDir, 'segment-000002.log'))).toBe(true);
    expect(fs.existsSync(path.join(segmentDir, 'segment-000003.log'))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(segmentDir, 'manifest.json'), 'utf-8'));
    expect(manifest.activeSegment).toBe(3);
    expect(manifest.lastSequence).toBe(5);
    expect(logger.verifyChain()).toEqual({ valid: true, errors: [] });
    expect(logger.readEntries()).toHaveLength(5);
  });

  test('detects tampering inside a segment', async () => {
    const logger = new AuditLogger(dir, false, {
      secret: 'k',
      keyId: 'v1',
      segmented: true,
      maxSegmentEntries: 2,
    });
    for (let i = 1; i <= 3; i += 1) await logger.log(entry(i));

    const segmentPath = path.join(dir, 'audit', 'segment-000002.log');
    const lines = fs.readFileSync(segmentPath, 'utf-8').trim().split('\n');
    const tampered = JSON.parse(lines[0]);
    tampered.result.success = false;
    fs.writeFileSync(segmentPath, [JSON.stringify(tampered), lines[1]].join('\n') + '\n');

    expect(logger.verifyChain().valid).toBe(false);
  });

  test('detects a tampered manifest', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k', keyId: 'v1', segmented: true });
    await logger.log(entry(1));

    const manifestPath = path.join(dir, 'audit', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.lastSequence = 99;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    expect(logger.verifyChain().valid).toBe(false);
  });

  test('migrates a legacy log without altering the source', async () => {
    const legacy = new AuditLogger(dir, false, { secret: 'k', keyId: 'v1' });
    for (let i = 1; i <= 3; i += 1) await legacy.log(entry(i));
    const source = path.join(dir, 'audit.log');

    const result = migrateLegacyAudit(source, path.join(dir, 'audit'), {
      secret: 'k',
      keyId: 'v1',
    });
    expect(result.entries).toBe(3);

    const segmented = new AuditLogger(dir, false, {
      secret: 'k',
      keyId: 'v1',
      segmented: true,
    });
    expect(segmented.verifyChain()).toEqual({ valid: true, errors: [] });
    expect(segmented.readEntries().map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(fs.existsSync(source)).toBe(true);

    const sourceBefore = fs.readFileSync(source, 'utf-8');
    legacy.log(entry(4));
    expect(fs.readFileSync(source, 'utf-8').startsWith(sourceBefore)).toBe(true);
  });
});
