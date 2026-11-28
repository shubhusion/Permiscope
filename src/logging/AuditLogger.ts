import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac } from 'crypto';
import { StringDecoder } from 'string_decoder';
import * as lockfile from 'proper-lockfile';
import { AuditLogEntry } from '../core/types';

const GENESIS = '0'.repeat(64);

const SENSITIVE_KEY = /(token|secret|password|passwd|authorization|api[-_]?key|credential|bearer)/i;
const SECRET_VALUE = /^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+)$/i;

export function redactSensitive(value: any, seen = new WeakSet<object>()): any {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' && SECRET_VALUE.test(value) ? '[redacted]' : value;
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));
  // Preserve Date/Buffer and other non-plain objects; JSON.stringify handles them.
  if (value instanceof Date) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactSensitive(item, seen);
  }
  return result;
}

export interface AuditLoggerOptions {
  secret?: string;
  keyId?: string;
  keyRing?: Record<string, string>;
  logPath?: string;
  /** Result fields whose values may be logged. Defaults to none: output and error are redacted. */
  allowedOutputKeys?: string[];
  /**
   * Fail closed when no signing secret is available. Host servers enable this;
   * the library default stays permissive for local development (ADR-0020).
   */
  requireSignature?: boolean;
  /** Opt-in segmented storage (see ADR-0017). Legacy single file remains the default. */
  segmented?: boolean;
  /** Directory for segments; defaults to <baseDir>/audit. */
  logDir?: string;
  maxSegmentEntries?: number;
  maxSegmentBytes?: number;
}

export interface SegmentHead {
  firstSequence: number;
  lastSequence: number;
  firstHash: string;
  lastHash: string;
  keyId?: string;
  signature?: string;
}

export interface AuditManifest {
  version: 1;
  activeSegment: number;
  lastSequence: number;
  lastHash: string;
  keyId?: string;
  signature?: string;
}

/** Logs only metadata about an execution unless the host opts into specific result fields. */
function redactResult(result: any, allowed: Set<string>): any {
  if (result === null || typeof result !== 'object') return result;
  if (Array.isArray(result)) return result.map((item) => redactResult(item, allowed));
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(result)) {
    if (
      key === 'success' ||
      key === 'dryRun' ||
      key === 'sideEffects' ||
      key === 'replayed' ||
      key === 'compensated' ||
      key === 'planned'
    ) {
      out[key] = value;
    } else if (allowed.has(key)) {
      out[key] = redactSensitive(value);
    } else {
      out[key] = '[redacted]';
    }
  }
  return out;
}

function envKeyRing(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(process.env.PERMISCOPE_AUDIT_KEY_RING || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Atomic replace via a sibling temp file; a crash cannot leave a half-written record. */
export function writeAtomic(filePath: string, value: unknown): void {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, filePath);
}

export function segmentPaths(directory: string, number: number): { log: string; head: string } {
  const name = `segment-${String(number).padStart(6, '0')}`;
  return { log: path.join(directory, `${name}.log`), head: path.join(directory, `${name}.head`) };
}

export class AuditLogger {
  private logPath: string;
  private headPath: string;
  private lastHash = GENESIS;
  private secret: string | null;
  private strictMode: boolean;
  private keyId: string;
  private keyRing: Map<string, string>;
  private allowedOutputKeys: Set<string>;
  private requireSignature: boolean;
  private segmented: boolean;
  private segmentDir: string;
  private manifestPath: string;
  private maxSegmentEntries: number;
  private maxSegmentBytes: number;

  constructor(
    baseDir: string = './logs',
    strictMode: boolean = process.env.PERMISCOPE_STRICT_LOGGING === 'true',
    options: AuditLoggerOptions = {},
  ) {
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    this.logPath = options.logPath ?? path.join(baseDir, 'audit.log');
    this.headPath = `${this.logPath}.head`;
    this.strictMode = strictMode;
    this.keyId = options.keyId ?? process.env.PERMISCOPE_AUDIT_KEY_ID ?? 'default';
    this.keyRing = new Map(Object.entries(options.keyRing ?? envKeyRing()));
    this.allowedOutputKeys = new Set(options.allowedOutputKeys ?? []);
    this.secret =
      options.secret ?? this.keyRing.get(this.keyId) ?? process.env.PERMISCOPE_AUDIT_SECRET ?? null;
    this.requireSignature = options.requireSignature ?? false;
    if (this.requireSignature && !this.secret) {
      throw new Error(
        'Audit signing secret required: set PERMISCOPE_AUDIT_SECRET (or PERMISCOPE_ALLOW_UNSIGNED_AUDIT=true for local development)',
      );
    }
    this.segmented = options.segmented ?? false;
    this.segmentDir = options.logDir ?? path.join(baseDir, 'audit');
    this.manifestPath = path.join(this.segmentDir, 'manifest.json');
    this.maxSegmentEntries = options.maxSegmentEntries ?? 1000;
    this.maxSegmentBytes = options.maxSegmentBytes ?? 5 * 1024 * 1024;

    if (!this.secret) {
      console.warn(
        '⚠️  PERMISCOPE_AUDIT_SECRET not set. Audit logs are not cryptographically signed. ' +
          'Set this environment variable in production for tamper detection.',
      );
    }

    if (this.segmented) {
      if (!fs.existsSync(this.segmentDir)) fs.mkdirSync(this.segmentDir, { recursive: true });
      if (!fs.existsSync(this.manifestPath)) {
        writeAtomic(this.manifestPath, this.newManifest(1, 0, GENESIS));
      }
      this.lastHash = this.readManifest().lastHash;
    } else {
      if (!fs.existsSync(this.logPath)) fs.writeFileSync(this.logPath, '');
      this.lastHash = this.recoverHead();
    }
  }

  private computeHash(data: string): string {
    // The chain uses plain SHA-256 so rotating the HMAC key does not invalidate
    // previously written links. Authenticity comes from the per-entry signature.
    return createHash('sha256').update(data).digest('hex');
  }

  private secretFor(keyId?: string): string | null {
    const id = keyId ?? 'default';
    if (this.keyRing.has(id)) return this.keyRing.get(id) ?? null;
    if (id === this.keyId) return this.secret;
    return null;
  }

  private sign(entry: AuditLogEntry): string {
    const secret = this.secretFor(this.keyId);
    if (!secret) throw new Error('Cannot sign an audit entry without a secret');
    const unsigned: AuditLogEntry = { ...entry };
    delete unsigned.signature;
    return createHmac('sha256', secret).update(JSON.stringify(unsigned)).digest('hex');
  }

  private signRecord(record: Record<string, unknown>): string | undefined {
    const secret = this.secretFor(this.keyId);
    if (!secret) return undefined;
    const unsigned = { ...record } as Record<string, unknown>;
    delete unsigned.signature;
    return createHmac('sha256', secret).update(JSON.stringify(unsigned)).digest('hex');
  }

  private signHead(sequence: number, hash: string): string | undefined {
    if (!this.secret) return undefined;
    return createHmac('sha256', this.secret).update(`${sequence}:${hash}`).digest('hex');
  }

  private newManifest(
    activeSegment: number,
    lastSequence: number,
    lastHash: string,
  ): AuditManifest {
    const manifest: AuditManifest = {
      version: 1,
      activeSegment,
      lastSequence,
      lastHash,
      keyId: this.secret ? this.keyId : undefined,
    };
    const signature = this.signRecord(manifest as unknown as Record<string, unknown>);
    if (signature) manifest.signature = signature;
    return manifest;
  }

  private readManifest(): AuditManifest {
    return JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8')) as AuditManifest;
  }

  private readLines(): string[] {
    try {
      return fs
        .readFileSync(this.logPath, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() !== '');
    } catch {
      return [];
    }
  }

  private recoverHead(): string {
    try {
      const head: unknown = JSON.parse(fs.readFileSync(this.headPath, 'utf-8'));
      if (
        head &&
        typeof head === 'object' &&
        typeof (head as { hash?: unknown }).hash === 'string'
      ) {
        return (head as { hash: string }).hash;
      }
    } catch {
      // Legacy log without a head record; fall back to hashing the last line.
    }
    const lines = this.readLines();
    return lines.length ? this.computeHash(lines[lines.length - 1]) : GENESIS;
  }

  private safeEntry(
    entry: Omit<AuditLogEntry, 'previousHash' | 'signature' | 'sequence' | 'keyId'>,
  ): any {
    // Defence in depth: credentials never belong on the domain object, but if
    // one slips into a parameter or result, scrub it before it hits the log.
    const safe = redactSensitive(entry);
    if (safe.result !== undefined) safe.result = redactResult(safe.result, this.allowedOutputKeys);
    return safe;
  }

  async log(
    entry: Omit<AuditLogEntry, 'previousHash' | 'signature' | 'sequence' | 'keyId'>,
  ): Promise<void> {
    const safe = this.safeEntry(entry);
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lockfile.lock(this.segmented ? this.manifestPath : this.logPath, {
        retries: 5,
      });
      if (this.segmented) await this.logSegmented(safe);
      else await this.logLegacy(safe);
    } catch (error) {
      console.error('Failed to write audit log:', error);
      if (this.strictMode) {
        const suffix =
          (entry as { phase?: string }).phase === 'INTENT'
            ? 'Action blocked by strict logging mode.'
            : 'The action ran, but its result could not be recorded.';
        throw new Error(`Audit log write failed: ${error}. ${suffix}`);
      }
    } finally {
      if (release) await release();
    }
  }

  private async logLegacy(safe: any): Promise<void> {
    const lines = this.readLines();
    this.lastHash = lines.length ? this.computeHash(lines[lines.length - 1]) : GENESIS;

    let sequence = lines.length + 1;
    if (lines.length) {
      try {
        const last: AuditLogEntry = JSON.parse(lines[lines.length - 1]);
        if (typeof last.sequence === 'number') sequence = last.sequence + 1;
      } catch {
        // An unparsable last line cannot provide a sequence; use line count.
      }
    }

    const full: AuditLogEntry = { ...safe, sequence, previousHash: this.lastHash };
    if (this.secret) {
      full.keyId = this.keyId;
      full.signature = this.sign(full);
    }

    const line = JSON.stringify(full);
    this.lastHash = this.computeHash(line);
    fs.appendFileSync(this.logPath, line + '\n');
    // Written under the same lock as the append: the head detects tail truncation.
    fs.writeFileSync(
      this.headPath,
      JSON.stringify({
        sequence,
        hash: this.lastHash,
        keyId: this.secret ? this.keyId : undefined,
        signature: this.signHead(sequence, this.lastHash),
      }),
    );
  }

  private async logSegmented(safe: any): Promise<void> {
    const manifest = this.readManifest();
    let number = manifest.activeSegment;
    let paths = segmentPaths(this.segmentDir, number);
    let head = fs.existsSync(paths.head)
      ? (JSON.parse(fs.readFileSync(paths.head, 'utf-8')) as SegmentHead)
      : undefined;
    const count = head ? head.lastSequence - head.firstSequence + 1 : 0;
    const size = fs.existsSync(paths.log) ? fs.statSync(paths.log).size : 0;

    if (
      fs.existsSync(paths.log) &&
      (count >= this.maxSegmentEntries || size >= this.maxSegmentBytes)
    ) {
      number += 1;
      paths = segmentPaths(this.segmentDir, number);
      const first: SegmentHead = {
        firstSequence: manifest.lastSequence + 1,
        lastSequence: manifest.lastSequence,
        firstHash: manifest.lastHash,
        lastHash: manifest.lastHash,
        keyId: this.secret ? this.keyId : undefined,
      };
      this.applyRecordSignature(first as unknown as Record<string, unknown>);
      writeAtomic(paths.head, first);
      head = first;
    }

    const sequence = manifest.lastSequence + 1;
    const full: AuditLogEntry = { ...safe, sequence, previousHash: manifest.lastHash };
    if (this.secret) {
      full.keyId = this.keyId;
      full.signature = this.sign(full);
    }
    const line = JSON.stringify(full);
    fs.appendFileSync(paths.log, line + '\n');
    this.lastHash = this.computeHash(line);

    if (!head) {
      head = {
        firstSequence: sequence,
        lastSequence: sequence - 1,
        firstHash: manifest.lastHash,
        lastHash: manifest.lastHash,
        keyId: this.secret ? this.keyId : undefined,
      };
    }
    const updatedHead: SegmentHead = {
      ...head,
      lastSequence: sequence,
      lastHash: this.lastHash,
      keyId: this.secret ? this.keyId : undefined,
    };
    this.applyRecordSignature(updatedHead as unknown as Record<string, unknown>);
    writeAtomic(paths.head, updatedHead);

    const updatedManifest = this.newManifest(number, sequence, this.lastHash);
    writeAtomic(this.manifestPath, updatedManifest);
  }

  private applyRecordSignature(record: Record<string, unknown>): void {
    const signature = this.signRecord(record);
    if (signature) record.signature = signature;
    else delete record.signature;
  }

  /** Streams a log file in bounded chunks; multi-byte characters survive chunk borders. */
  private forEachLine(filePath: string, visit: (line: string) => void): number {
    const descriptor = fs.openSync(filePath, 'r');
    const decoder = new StringDecoder('utf8');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let remainder = '';
    let count = 0;

    try {
      let bytes: number;
      while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
        remainder += decoder.write(buffer.subarray(0, bytes));
        let newline: number;
        while ((newline = remainder.indexOf('\n')) !== -1) {
          const line = remainder.slice(0, newline);
          remainder = remainder.slice(newline + 1);
          if (line.trim() !== '') {
            count += 1;
            visit(line);
          }
        }
      }
      remainder += decoder.end();
      if (remainder.trim() !== '') {
        count += 1;
        visit(remainder);
      }
    } finally {
      fs.closeSync(descriptor);
    }
    return count;
  }

  private verifyEntry(
    line: string,
    lineNumber: number,
    expectedHash: string,
    expectedSequence: number,
    errors: string[],
  ): { hash: string; sequence: number } {
    const hash = this.computeHash(line);
    const sequence = expectedSequence + 1;
    let entry: AuditLogEntry;
    try {
      entry = JSON.parse(line) as AuditLogEntry;
    } catch (error) {
      errors.push(`Line ${lineNumber}: parse error - ${error}`);
      return { hash, sequence };
    }

    // Legacy entries predate sequence numbers; the head check below already
    // reports that their integrity cannot be fully proven.
    if (entry.sequence !== undefined && entry.sequence !== expectedSequence) {
      errors.push(
        `Line ${lineNumber}: sequence ${String(entry.sequence)} expected ${expectedSequence} (gap or truncation)`,
      );
    }
    if (entry.previousHash !== expectedHash) errors.push(`Line ${lineNumber}: hash chain broken`);

    if (entry.signature) {
      this.verifySignature(entry, lineNumber, errors);
    }

    return { hash, sequence };
  }

  private verifySignature(
    record: { keyId?: string; signature?: string },
    label: string | number,
    errors: string[],
  ): void {
    const secret = this.secretFor(record.keyId);
    if (!secret) {
      errors.push(`${label}: no signing key for keyId ${String(record.keyId)}`);
      return;
    }
    const { signature, ...unsigned } = record as Record<string, unknown> & { signature?: string };
    const expected = createHmac('sha256', secret).update(JSON.stringify(unsigned)).digest('hex');
    if (signature !== expected) errors.push(`${label}: invalid signature`);
  }

  private verifyRecord(
    record: Record<string, unknown> | null,
    label: string,
    errors: string[],
  ): void {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`${label}: unreadable record`);
      return;
    }
    if (typeof record.signature === 'string') {
      this.verifySignature(record as { keyId?: string; signature?: string }, label, errors);
    } else if (this.secret) {
      errors.push(`${label}: unsigned record`);
    }
  }

  private verifyHead(lineCount: number, expectedHash: string, errors: string[]): void {
    if (fs.existsSync(this.headPath)) {
      try {
        const head: unknown = JSON.parse(fs.readFileSync(this.headPath, 'utf-8'));
        if (!head || typeof head !== 'object') throw new Error('malformed head record');
        const record = head as {
          sequence?: unknown;
          hash?: unknown;
          keyId?: unknown;
          signature?: unknown;
        };
        if (record.sequence !== lineCount) {
          errors.push(
            `Tail truncated: head says ${String(record.sequence)} entries, log has ${lineCount}`,
          );
        }
        if (record.hash !== expectedHash) errors.push('Head hash does not match the log');
        if (typeof record.signature === 'string') {
          const key = this.secretFor(typeof record.keyId === 'string' ? record.keyId : undefined);
          if (!key) {
            errors.push('Head signature cannot be verified: unknown keyId');
          } else {
            const expected = createHmac('sha256', key)
              .update(`${String(record.sequence)}:${String(record.hash)}`)
              .digest('hex');
            if (record.signature !== expected) errors.push('Head signature is invalid');
          }
        } else if (this.secret) {
          errors.push('Head record is unsigned');
        }
      } catch (error) {
        errors.push(`Head record unreadable: ${error}`);
      }
    }
  }

  private verifySegmented(errors: string[]): void {
    if (!fs.existsSync(this.manifestPath)) {
      errors.push('Segment manifest missing');
      return;
    }
    let manifest: AuditManifest;
    try {
      manifest = this.readManifest();
    } catch (error) {
      errors.push(`Segment manifest unreadable: ${error}`);
      return;
    }
    this.verifyRecord(manifest as unknown as Record<string, unknown>, 'Segment manifest', errors);

    let expectedHash = GENESIS;
    let expectedSequence = 1;
    for (let number = 1; number <= manifest.activeSegment; number += 1) {
      const paths = segmentPaths(this.segmentDir, number);
      if (!fs.existsSync(paths.log) || !fs.existsSync(paths.head)) {
        errors.push(`Segment ${number} missing`);
        return;
      }
      let head: SegmentHead;
      try {
        head = JSON.parse(fs.readFileSync(paths.head, 'utf-8')) as SegmentHead;
      } catch (error) {
        errors.push(`Segment ${number} head unreadable: ${error}`);
        return;
      }
      this.verifyRecord(
        head as unknown as Record<string, unknown>,
        `Segment ${number} head`,
        errors,
      );
      if (head.firstHash !== expectedHash) {
        errors.push(`Segment ${number}: firstHash does not anchor the previous segment`);
      }
      if (head.firstSequence !== expectedSequence) {
        errors.push(
          `Segment ${number}: firstSequence ${String(head.firstSequence)} expected ${expectedSequence}`,
        );
      }

      let lastHash = GENESIS;
      this.forEachLine(paths.log, (line) => {
        const verified = this.verifyEntry(
          line,
          expectedSequence,
          expectedHash,
          expectedSequence,
          errors,
        );
        expectedHash = verified.hash;
        expectedSequence = verified.sequence;
        lastHash = verified.hash;
      });
      if (head.lastHash !== lastHash) {
        errors.push(`Segment ${number}: head hash does not match its entries`);
      }
    }

    if (manifest.lastHash !== expectedHash) errors.push('Manifest hash does not match the log');
    if (manifest.lastSequence !== expectedSequence - 1) {
      errors.push('Manifest sequence does not match the log');
    }
  }

  verifyChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.segmented) {
      this.verifySegmented(errors);
      return { valid: errors.length === 0, errors };
    }
    if (!fs.existsSync(this.logPath)) return { valid: true, errors: [] };

    let expectedHash = GENESIS;
    let expectedSequence = 1;
    const entryErrors: string[] = [];
    let lineNumber = 0;
    const lineCount = this.forEachLine(this.logPath, (line) => {
      lineNumber += 1;
      const verified = this.verifyEntry(
        line,
        lineNumber,
        expectedHash,
        expectedSequence,
        entryErrors,
      );
      expectedHash = verified.hash;
      expectedSequence = verified.sequence;
    });

    if (lineCount && !fs.existsSync(this.headPath)) {
      errors.push('Head record missing: tail truncation cannot be detected');
    }
    errors.push(...entryErrors);
    if (fs.existsSync(this.headPath)) this.verifyHead(lineCount, expectedHash, errors);
    return { valid: errors.length === 0, errors };
  }

  /** Parsed entries for both layouts; used by the dashboard API. */
  readEntries(): AuditLogEntry[] {
    const entries: AuditLogEntry[] = [];
    const collect = (filePath: string): void => {
      this.forEachLine(filePath, (line) => {
        try {
          entries.push(JSON.parse(line) as AuditLogEntry);
        } catch {
          // Invalid lines are reported by verifyChain; skip them here.
        }
      });
    };
    if (this.segmented) {
      if (!fs.existsSync(this.manifestPath)) return entries;
      const active = this.readManifest().activeSegment;
      for (let number = 1; number <= active; number += 1) {
        const paths = segmentPaths(this.segmentDir, number);
        if (fs.existsSync(paths.log)) collect(paths.log);
      }
    } else if (fs.existsSync(this.logPath)) {
      collect(this.logPath);
    }
    return entries;
  }
}
