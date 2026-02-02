import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac } from 'crypto';
import * as lockfile from 'proper-lockfile';
import { AuditLogEntry } from '../core/types';

// Environment variable for the audit secret (production use)
const AUDIT_SECRET = process.env.PERMISCOPE_AUDIT_SECRET;

// Strict mode: if enabled, throw on log write failures instead of silent catch
const STRICT_MODE = process.env.PERMISCOPE_STRICT_LOGGING === 'true';

export class AuditLogger {
  private logPath: string;
  private lastHash: string = '';
  private secret: string | null;
  private strictMode: boolean;

  constructor(baseDir: string = './logs', strictMode: boolean = STRICT_MODE) {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.logPath = path.join(baseDir, 'audit.log');
    this.secret = AUDIT_SECRET || null;
    this.strictMode = strictMode;

    if (!this.secret) {
      console.warn(
        '⚠️  PERMISCOPE_AUDIT_SECRET not set. Audit logs are not cryptographically signed. ' +
        'Set this environment variable in production for tamper detection.'
      );
    }

    // Initialize lastHash from existing file
    this.lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

    if (fs.existsSync(this.logPath)) {
      try {
        const content = fs.readFileSync(this.logPath, 'utf-8').trim();
        if (content) {
          const lines = content.split('\n');
          const lastLine = lines[lines.length - 1];
          // Recompute the hash of the last entry to continue the chain
          this.lastHash = this.computeHash(lastLine);
        }
      } catch (e) {
        console.error('Failed to recover audit chain:', e);
      }
    } else {
      // Ensure file exists for locking
      fs.writeFileSync(this.logPath, '');
    }
  }

  private computeHash(data: string): string {
    if (this.secret) {
      // Use HMAC-SHA256 for signed hashes (tamper-proof)
      return createHmac('sha256', this.secret).update(data).digest('hex');
    } else {
      // Fall back to plain SHA256 (development mode)
      return createHash('sha256').update(data).digest('hex');
    }
  }

  async log(entry: Omit<AuditLogEntry, 'previousHash' | 'signature'>) {
    let release: (() => Promise<void>) | null = null;

    try {
      // Acquire lock for atomic append
      release = await lockfile.lock(this.logPath, { retries: 3 });

      // Re-read last hash in case another process appended
      const content = fs.readFileSync(this.logPath, 'utf-8').trim();
      if (content) {
        const lines = content.split('\n');
        const lastLine = lines[lines.length - 1];
        this.lastHash = this.computeHash(lastLine);
      }

      const fullEntry: AuditLogEntry & { signature?: string } = {
        ...entry,
        previousHash: this.lastHash,
      };

      // Add signature if secret is available
      if (this.secret) {
        const entryString = JSON.stringify(fullEntry);
        fullEntry.signature = createHmac('sha256', this.secret)
          .update(entryString)
          .digest('hex');
      }

      const entryWithHashForNext = JSON.stringify(fullEntry);
      this.lastHash = this.computeHash(entryWithHashForNext);

      fs.appendFileSync(this.logPath, entryWithHashForNext + '\n');
    } catch (e) {
      console.error('Failed to write audit log:', e);
      // In strict mode, throw to ensure actions are not executed without logging
      if (this.strictMode) {
        throw new Error(`Audit log write failed: ${e}. Action execution blocked due to strict logging mode.`);
      }
    } finally {
      if (release) await release();
    }
  }


  // Verify the integrity of the audit log
  verifyChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!fs.existsSync(this.logPath)) {
      return { valid: true, errors: [] }; // No log yet is valid
    }

    const content = fs.readFileSync(this.logPath, 'utf-8').trim();
    if (!content) {
      return { valid: true, errors: [] };
    }

    const lines = content.split('\n');
    let expectedPreviousHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);

        // Verify chain link
        if (entry.previousHash !== expectedPreviousHash) {
          errors.push(`Line ${i + 1}: Hash chain broken. Expected ${expectedPreviousHash}, got ${entry.previousHash}`);
        }

        // Verify signature if present and secret is available
        if (this.secret && entry.signature) {
          const { signature, ...entryWithoutSig } = entry;
          const expectedSig = createHmac('sha256', this.secret)
            .update(JSON.stringify(entryWithoutSig))
            .digest('hex');
          if (signature !== expectedSig) {
            errors.push(`Line ${i + 1}: Invalid signature. Entry may have been tampered with.`);
          }
        }

        // Compute hash for next entry
        expectedPreviousHash = this.computeHash(lines[i]);
      } catch (e) {
        errors.push(`Line ${i + 1}: Parse error - ${e}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
