import * as fs from 'fs';
import * as path from 'path';

export interface ApprovalRequest {
  id: string;
  agentId: string;
  actionName: string;
  params: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
}

export class ApprovalCache {
  private filePath: string;
  private cache: Map<string, ApprovalRequest> = new Map();

  constructor(baseDir: string = './data') {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.filePath = path.join(baseDir, 'approvals.json');
    this.load();
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const items: ApprovalRequest[] = JSON.parse(data);
        this.cache = new Map(items.map((i) => [i.id, i]));
      } catch (e) {
        console.error('Failed to load approvals:', e);
      }
    }
  }

  private save() {
    const items = Array.from(this.cache.values());
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }

  // Generate a stable ID for the action intent
  private getKey(agentId: string, actionName: string, params: Record<string, any>): string {
    return Buffer.from(`${agentId}:${actionName}:${JSON.stringify(params)}`).toString('base64');
  }

  isApproved(agentId: string, actionName: string, params: Record<string, any>): boolean {
    this.load(); // Reload to see updates from Dashboard
    const key = this.getKey(agentId, actionName, params);
    const item = this.cache.get(key);
    return item?.status === 'APPROVED';
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
    const item = this.cache.get(key);
    if (item) {
      item.status = 'APPROVED';
      this.save();
    } else {
      // Create as approved immediately
      this.cache.set(key, {
        id: key,
        agentId,
        actionName,
        params,
        status: 'APPROVED',
        timestamp: new Date().toISOString(),
      });
      this.save();
    }
  }

  // Methods for Dashboard
  getAll(): ApprovalRequest[] {
    this.load();
    return Array.from(this.cache.values());
  }

  updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    this.load();
    const item = this.cache.get(id);
    if (item) {
      item.status = status;
      this.save();
    }
  }
}
