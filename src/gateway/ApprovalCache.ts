import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import stringify from 'fast-json-stable-stringify';

// Default TTL: 1 hour (in milliseconds)
const DEFAULT_APPROVAL_TTL_MS = 60 * 60 * 1000;

export interface ApprovalRequest {
  id: string;
  agentId: string;
  actionName: string;
  params: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
  expiresAt?: string;
}

export class ApprovalCache {
  private filePath: string;
  private cache: Map<string, ApprovalRequest> = new Map();
  private ttlMs: number;

  constructor(baseDir: string = './data', ttlMs: number = DEFAULT_APPROVAL_TTL_MS) {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.filePath = path.join(baseDir, 'approvals.json');
    this.ttlMs = ttlMs;

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '[]');
    }
    this.loadSync();
  }

  private loadSync(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      this.cache = new Map();
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('approval file is not an array');
      const items = parsed.filter(
        (item): item is ApprovalRequest =>
          !!item && typeof item.id === 'string' && typeof item.status === 'string',
      );
      this.cache = new Map(items.map((item) => [item.id, item]));
      if (items.length === 0 && raw.trim() !== '[]') this.saveSync();
    } catch (error) {
      // Fail closed: a corrupt cache becomes an empty cache, never an allow-all.
      console.error('Failed to load approvals; resetting cache:', error);
      this.cache = new Map();
      this.saveSync();
    }
  }

  private saveSync(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.cache.values()), null, 2));
  }

  /** One lock per read-modify-write; releasing between load and save loses updates. */
  private async withLock<T>(mutate: () => T | Promise<T>): Promise<T> {
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lockfile.lock(this.filePath, { retries: 3 });
      this.loadSync();
      const result = await mutate();
      this.saveSync();
      return result;
    } finally {
      if (release) await release();
    }
  }

  private getKey(agentId: string, actionName: string, params: Record<string, any>): string {
    return Buffer.from(`${agentId}:${actionName}:${stringify(params)}`).toString('base64');
  }

  private isExpired(item: ApprovalRequest): boolean {
    return !!item.expiresAt && new Date(item.expiresAt) < new Date();
  }

  async isApproved(
    agentId: string,
    actionName: string,
    params: Record<string, any>,
  ): Promise<boolean> {
    return this.withLock(() => {
      const key = this.getKey(agentId, actionName, params);
      const item = this.cache.get(key);
      if (!item) return false;
      if (this.isExpired(item)) {
        this.cache.delete(key);
        return false;
      }
      return item.status === 'APPROVED';
    });
  }

  async isRejected(
    agentId: string,
    actionName: string,
    params: Record<string, any>,
  ): Promise<boolean> {
    return this.withLock(() => {
      const key = this.getKey(agentId, actionName, params);
      const item = this.cache.get(key);
      if (!item) return false;
      if (this.isExpired(item)) {
        this.cache.delete(key);
        return false;
      }
      return item.status === 'REJECTED';
    });
  }

  async requestApproval(
    agentId: string,
    actionName: string,
    params: Record<string, any>,
  ): Promise<void> {
    await this.withLock(() => {
      const key = this.getKey(agentId, actionName, params);
      if (!this.cache.has(key)) {
        this.cache.set(key, {
          id: key,
          agentId,
          actionName,
          params,
          status: 'PENDING',
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  /** Only a pending request may be approved — no silent pre-approval. */
  async approve(
    agentId: string,
    actionName: string,
    params: Record<string, any>,
  ): Promise<boolean> {
    return this.withLock(() => {
      const key = this.getKey(agentId, actionName, params);
      const item = this.cache.get(key);
      if (!item || item.status !== 'PENDING') return false;
      item.status = 'APPROVED';
      item.expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
      return true;
    });
  }

  async getAll(): Promise<ApprovalRequest[]> {
    return this.withLock(() =>
      Array.from(this.cache.values()).filter(
        (item) => item.status === 'PENDING' || !this.isExpired(item),
      ),
    );
  }

  async updateStatus(id: string, status: 'APPROVED' | 'REJECTED'): Promise<boolean> {
    return this.withLock(() => {
      const item = this.cache.get(id);
      if (!item) return false;
      item.status = status;
      item.expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
      return true;
    });
  }

  async revoke(agentId: string, actionName: string, params: Record<string, any>): Promise<void> {
    await this.withLock(() => {
      this.cache.delete(this.getKey(agentId, actionName, params));
    });
  }

  async clearExpired(): Promise<void> {
    await this.withLock(() => {
      for (const [key, item] of this.cache.entries()) {
        if (this.isExpired(item)) this.cache.delete(key);
      }
    });
  }
}
