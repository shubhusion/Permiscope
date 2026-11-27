export interface ApprovalView {
  id: string;
  agentId: string;
  actionName: string;
  params: Record<string, unknown>;
  status: string;
  timestamp: string;
  expiresAt?: string;
  ttlSeconds?: number;
}

export interface LogView {
  timestamp: string;
  agentId: string;
  actionName: string;
  parameters: Record<string, unknown>;
  decision: string;
  success: boolean;
  signature?: string;
  sequence?: number;
}

export interface ChainView {
  valid: boolean;
  entries: number;
  checks: string[];
  errors?: string[];
}

export interface CategoryResult {
  passed: number;
  total: number;
}

export interface EvalView {
  version: string;
  passed: number;
  total: number;
  passRate: number;
  byCategory: Record<string, CategoryResult>;
}

export interface ScenarioStep {
  name: string;
  actionName: string;
  parameters: Record<string, unknown>;
  expected: string;
  actual: string;
}

export interface DashboardData {
  demo: boolean;
  approvals: ApprovalView[];
  logs: LogView[];
  chain: ChainView;
  eval: EvalView;
  scenario: ScenarioStep[];
  error?: string;
}

export interface DashboardDataSource {
  load(): Promise<DashboardData>;
  setToken(token: string): void;
  decide(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void>;
}

const fixtureUrl = `${import.meta.env.BASE_URL}fixtures/demo.json`;

async function loadStaticSummary(): Promise<Pick<DashboardData, 'chain' | 'eval' | 'scenario'>> {
  const response = await fetch(fixtureUrl);
  if (!response.ok) throw new Error(`Fixture unavailable (${response.status})`);
  const fixture = await response.json();
  return {
    chain: fixture.chain,
    eval: fixture.eval,
    scenario: fixture.scenario,
  };
}

export class FixtureDataSource implements DashboardDataSource {
  async load(): Promise<DashboardData> {
    const response = await fetch(fixtureUrl);
    if (!response.ok) throw new Error(`Demo fixture unavailable (${response.status})`);
    const fixture = await response.json();
    return {
      demo: true,
      approvals: fixture.approvals,
      logs: fixture.logs,
      chain: fixture.chain,
      eval: fixture.eval,
      scenario: fixture.scenario,
    };
  }

  setToken(): void {
    // Read-only demo: no token is used.
  }

  async decide(): Promise<void> {
    throw new Error('Approvals are disabled in the read-only demo');
  }
}

export class HttpDataSource implements DashboardDataSource {
  private token = '';
  private apiBase = import.meta.env.VITE_API_BASE ?? '/api';

  setToken(token: string): void {
    this.token = token.trim();
  }

  private async api<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json() as Promise<T>;
  }

  async load(): Promise<DashboardData> {
    const summary = await loadStaticSummary();
    const [approvals, rawLogs, chain] = await Promise.all([
      this.api<ApprovalView[]>('/approvals'),
      this.api<any[]>('/logs'),
      this.api<ChainView>('/chain'),
    ]);
    return {
      demo: false,
      approvals,
      logs: rawLogs.map((entry) => ({
        timestamp: entry.timestamp,
        agentId: entry.agentId,
        actionName: entry.action?.actionName ?? 'unknown',
        parameters: entry.action?.parameters ?? {},
        decision: entry.decision,
        success: Boolean(entry.result?.success),
        signature: entry.signature,
        sequence: entry.sequence,
      })),
      ...summary,
    };
  }

  async decide(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    if (!this.token) throw new Error('Enter a dashboard token before deciding');
    const response = await fetch(`${this.apiBase}/approvals/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error(`Decision failed (${response.status})`);
  }
}
