import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { BudgetSnapshot, BudgetStore } from './BudgetTracker';

const FIELDS = ['attempts', 'executed', 'spend', 'windowStart'] as const;

function isSnapshot(value: unknown): value is BudgetSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return FIELDS.every(
    (field) =>
      typeof record[field] === 'number' &&
      Number.isFinite(record[field]) &&
      (record[field] as number) >= 0,
  );
}

/**
 * Shared, cross-process budget store backed by a locked JSON file. Every read
 * reloads from disk; compareAndSet holds the lock across the read-modify-write
 * so two processes cannot both win the same reservation.
 */
export class FileBudgetStore implements BudgetStore {
  private readonly filePath: string;
  private snapshots: Record<string, BudgetSnapshot> = {};

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    const directory = path.dirname(this.filePath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    this.load();
  }

  private load(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.snapshots = {};
        this.save();
        return;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Corrupt budget store: ${this.filePath}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Corrupt budget store: ${this.filePath}`);
    }

    const next: Record<string, BudgetSnapshot> = {};
    for (const [principal, value] of Object.entries(parsed)) {
      if (!isSnapshot(value)) throw new Error(`Corrupt budget store: ${this.filePath}`);
      next[principal] = { ...value };
    }
    this.snapshots = next;
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.snapshots, null, 2));
  }

  private async withLock<T>(mutate: () => T, persist = false): Promise<T> {
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lockfile.lock(this.filePath, {
        retries: { retries: 20, factor: 1, minTimeout: 10, maxTimeout: 100 },
      });
      this.load();
      const result = mutate();
      if (persist) this.save();
      return result;
    } finally {
      if (release) await release();
    }
  }

  async read(principal: string): Promise<BudgetSnapshot | null> {
    return this.withLock(() => {
      const snapshot = this.snapshots[principal];
      return snapshot ? { ...snapshot } : null;
    });
  }

  async compareAndSet(
    principal: string,
    expected: BudgetSnapshot | null,
    next: BudgetSnapshot,
  ): Promise<boolean> {
    return this.withLock(() => {
      const current = this.snapshots[principal] ?? null;
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      this.snapshots[principal] = { ...next };
      return true;
    }, true);
  }
}
