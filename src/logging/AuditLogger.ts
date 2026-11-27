import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac } from 'crypto';
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

export class AuditLogger {
  private logPath: string;
  private headPath: string;
  private lastHash = GENESIS;
  private secret: string | null;
  private strictMode: boolean;
  private keyId: string;
  private keyRing: Map<string, string>;
  private allowedOutputKeys: Set<string>;

  constructor(
    baseDir: string = './logs',
    strictMode: boolean = process.env.PERMISCOPE_STRICT_LOGGING === 'true',
    options: AuditLoggerOptions = {},
  ) {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.logPath = options.logPath ?? path.join(baseDir, 'audit.log');
    this.headPath = `${this.logPath}.head`;
    this.strictMode = strictMode;
    this.keyId = options.keyId ?? process.env.PERMISCOPE_AUDIT_KEY_ID ?? 'default';
    this.keyRing = new Map(Object.entries(options.keyRing ?? envKeyRing()));
    this.allowedOutputKeys = new Set(options.allowedOutputKeys ?? []);
    this.secret =
      options.secret ?? this.keyRing.get(this.keyId) ?? process.env.PERMISCOPE_AUDIT_SECRET ?? null;

    if (!this.secret) {
      console.warn(
        '⚠️  PERMISCOPE_AUDIT_SECRET not set. Audit logs are not cryptographically signed. ' +
          'Set this environment variable in production for tamper detection.',
      );
    }

    if (!fs.existsSync(this.logPath)) fs.writeFileSync(this.logPath, '');
    this.lastHash = this.recoverHead();
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

  private signHead(sequence: number, hash: string): string | undefined {
    if (!this.secret) return undefined;
    return createHmac('sha256', this.secret).update(`${sequence}:${hash}`).digest('hex');
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

  async log(
    entry: Omit<AuditLogEntry, 'previousHash' | 'signature' | 'sequence' | 'keyId'>,
  ): Promise<void> {
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lockfile.lock(this.logPath, { retries: 3 });
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

      // Defence in depth: credentials never belong on the domain object, but if
      // one slips into a parameter or result, scrub it before it hits the log.
      const safeEntry = redactSensitive(entry);
      if (safeEntry.result !== undefined) {
        safeEntry.result = redactResult(safeEntry.result, this.allowedOutputKeys);
      }
      const full: AuditLogEntry = { ...safeEntry, sequence, previousHash: this.lastHash };
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

  verifyChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = this.readLines();

    if (!fs.existsSync(this.logPath)) return { valid: true, errors: [] };
    if (lines.length && !fs.existsSync(this.headPath)) {
      errors.push('Head record missing: tail truncation cannot be detected');
    }

    let expectedHash = GENESIS;
    let expectedSequence = 1;

    for (let i = 0; i < lines.length; i++) {
      let entry: AuditLogEntry;
      try {
        entry = JSON.parse(lines[i]) as AuditLogEntry;
      } catch (error) {
        errors.push(`Line ${i + 1}: parse error - ${error}`);
        continue;
      }

      // Legacy entries predate sequence numbers; the missing head record below
      // already reports that their integrity cannot be fully proven.
      if (entry.sequence !== undefined && entry.sequence !== expectedSequence) {
        errors.push(
          `Line ${i + 1}: sequence ${String(entry.sequence)} expected ${expectedSequence} (gap or truncation)`,
        );
      }
      if (entry.previousHash !== expectedHash) {
        errors.push(`Line ${i + 1}: hash chain broken`);
      }

      if (entry.signature) {
        const secret = this.secretFor(entry.keyId);
        if (!secret) {
          errors.push(`Line ${i + 1}: no signing key for keyId ${String(entry.keyId)}`);
        } else {
          const { signature, ...unsigned } = entry;
          const expected = createHmac('sha256', secret)
            .update(JSON.stringify(unsigned))
            .digest('hex');
          if (signature !== expected) errors.push(`Line ${i + 1}: invalid signature`);
        }
      }

      expectedHash = this.computeHash(lines[i]);
      expectedSequence += 1;
    }

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
        if (record.sequence !== lines.length) {
          errors.push(
            `Tail truncated: head says ${String(record.sequence)} entries, log has ${lines.length}`,
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

    return { valid: errors.length === 0, errors };
  }
}
