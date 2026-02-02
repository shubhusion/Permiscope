import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';

// Default TTL: 1 hour (in milliseconds)
const DEFAULT_APPROVAL_TTL_MS = 60 * 60 * 1000;

export interface ApprovalRequest {
  id: string;
  agentId: string;
  actionName: string;
  params: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
  expiresAt?: string; // ISO timestamp for expiration
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

    // Ensure the file exists for locking
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '[]');
    }

    this.loadSync();
  }

  private loadSync() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const items: ApprovalRequest[] = JSON.parse(data);
      this.cache = new Map(items.map((i) => [i.id, i]));
    } catch (e) {
      console.error('Failed to load approvals:', e);
      this.cache = new Map();
    }
  }

  private async loadWithLock() {
    let release: (() => Promise<void>) | null = null;
    try {
      release = await lockfile.lock(this.filePath, { retries: 3 });
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const items: ApprovalRequest[] = JSON.parse(data);
      this.cache = new Map(items.map((i) => [i.id, i]));
    } catch (e) {
      console.error('Failed to load approvals:', e);
    } finally {
      if (release) await release();
    }
  }

  private async saveWithLock() {
    let release: (() => Promise<void>) | null = null;
    try {
      release = await lockfile.lock(this.filePath, { retries: 3 });
      const items = Array.from(this.cache.values());
      fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
    } catch (e) {
      console.error('Failed to save approvals:', e);
    } finally {
      if (release) await release();
    }
  }

  // Synchronous version for polling (non-blocking check)
  private load() {
    this.loadSync();
  }

  private save() {
    const items = Array.from(this.cache.values());
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }

  private getKey(agentId: string, actionName: string, params: Record<string, any>): string {
    return Buffer.from(`${agentId}:${actionName}:${JSON.stringify(params)}`).toString('base64');
  }

  private isExpired(item: ApprovalRequest): boolean {
    if (!item.expiresAt) return false;
    return new Date(item.expiresAt) < new Date();
  }

  isApproved(agentId: string, actionName: string, params: Record<string, any>): boolean {
    this.load(); // Reload to see updates from Dashboard
    const key = this.getKey(agentId, actionName, params);
    const item = this.cache.get(key);

    if (!item) return false;
    if (item.status !== 'APPROVED') return false;

    // Check TTL expiration
    if (this.isExpired(item)) {
      // Clean up expired approval
      this.cache.delete(key);
      this.save();
      return false;
    }

    return true;
  }

  isRejected(agentId: string, actionName: string, params: Record<string, any>): boolean {
    this.load();
    const key = this.getKey(agentId, actionName, params);
    const item = this.cache.get(key);
    return item?.status === 'REJECTED';
  }

  requestApproval(agentId: string, actionName: string, params: Record<string, any>) {
    this.load();
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
      this.save();
    }
  }

  approve(agentId: string, actionName: string, params: Record<string, any>) {
    this.load();
    const key = this.getKey(agentId, actionName, params);
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();

    const item = this.cache.get(key);
    if (item) {
      item.status = 'APPROVED';
      item.expiresAt = expiresAt;
      this.save();
    } else {
      this.cache.set(key, {
        id: key,
        agentId,
        actionName,
        params,
        status: 'APPROVED',
        timestamp: new Date().toISOString(),
        expiresAt,
      });
      this.save();
    }
  }

  // Methods for Dashboard
  getAll(): ApprovalRequest[] {
    this.load();
    // Filter out expired approvals for display
    const all = Array.from(this.cache.values());
    return all.filter(item => !this.isExpired(item) || item.status === 'PENDING');
  }

  updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    this.load();
    const item = this.cache.get(id);
    if (item) {
      item.status = status;
      if (status === 'APPROVED') {
        item.expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
      }
      this.save();
    }
  }

  // Revoke an approval (useful for policy updates)
  revoke(agentId: string, actionName: string, params: Record<string, any>) {
    this.load();
    const key = this.getKey(agentId, actionName, params);
    this.cache.delete(key);
    this.save();
  }

  // Clear all expired approvals
  clearExpired() {
    this.load();
    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
      }
    }
    this.save();
  }
}
