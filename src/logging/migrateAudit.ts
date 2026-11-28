import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac } from 'crypto';
import { AuditLogger, AuditManifest, SegmentHead, segmentPaths, writeAtomic } from './AuditLogger';

const GENESIS = '0'.repeat(64);

export interface MigrationOptions {
  secret?: string;
  keyId?: string;
  keyRing?: Record<string, string>;
}

export interface MigrationResult {
  entries: number;
  segmentDir: string;
}

/** Verifies a legacy single-file log and writes it as the first segment. */
export function migrateLegacyAudit(
  logPath: string,
  segmentDir: string,
  options: MigrationOptions = {},
): MigrationResult {
  const source = path.resolve(logPath);
  const target = path.resolve(segmentDir);
  if (!fs.existsSync(source)) throw new Error(`Audit log not found: ${source}`);
  if (fs.existsSync(path.join(target, 'manifest.json'))) {
    throw new Error(`Segmented audit log already exists: ${target}`);
  }

  const verifier = new AuditLogger(path.dirname(source), false, { logPath: source, ...options });
  const verification = verifier.verifyChain();
  if (!verification.valid) {
    throw new Error(`Legacy audit chain is invalid: ${verification.errors.join('; ')}`);
  }

  const lines = fs
    .readFileSync(source, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  let hash = GENESIS;
  for (const line of lines) hash = createHash('sha256').update(line).digest('hex');

  const keyId = options.keyId ?? process.env.PERMISCOPE_AUDIT_KEY_ID ?? 'default';
  const secret =
    options.secret ?? options.keyRing?.[keyId] ?? process.env.PERMISCOPE_AUDIT_SECRET ?? null;
  const sign = (record: Record<string, unknown>): string | undefined => {
    if (!secret) return undefined;
    const unsigned = { ...record };
    delete unsigned.signature;
    return createHmac('sha256', secret).update(JSON.stringify(unsigned)).digest('hex');
  };

  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  const paths = segmentPaths(target, 1);
  fs.writeFileSync(paths.log, lines.join('\n') + '\n');

  const head: SegmentHead = {
    firstSequence: 1,
    lastSequence: lines.length,
    firstHash: GENESIS,
    lastHash: hash,
    keyId: secret ? keyId : undefined,
  };
  const headSignature = sign(head as unknown as Record<string, unknown>);
  if (headSignature) head.signature = headSignature;
  writeAtomic(paths.head, head);

  const manifest: AuditManifest = {
    version: 1,
    activeSegment: 1,
    lastSequence: lines.length,
    lastHash: hash,
    keyId: secret ? keyId : undefined,
  };
  const manifestSignature = sign(manifest as unknown as Record<string, unknown>);
  if (manifestSignature) manifest.signature = manifestSignature;
  writeAtomic(path.join(target, 'manifest.json'), manifest);

  return { entries: lines.length, segmentDir: target };
}
