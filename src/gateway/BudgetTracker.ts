export interface Budget {
  maxCalls?: number;
  maxSpend?: number;
  costPerCall?: number;
  windowMs?: number;
}

export interface BudgetRemaining {
  calls: number | null;
  spend: number | null;
}

export interface BudgetCheck {
  allowed: boolean;
  reasonCode?: 'BUDGET_EXCEEDED';
  remaining?: BudgetRemaining;
}

interface BudgetState {
  count: number;
  spend: number;
  windowStart: number;
}

/** In-process, single-machine budget enforcement keyed by authenticated principal. */
export class BudgetTracker {
  private budgets = new Map<string, Budget>();
  private state = new Map<string, BudgetState>();

  constructor(budgets: Record<string, Budget> = {}) {
    for (const [principal, budget] of Object.entries(budgets)) {
      this.budgets.set(principal, budget);
    }
  }

  configure(principal: string, budget: Budget): void {
    this.budgets.set(principal, budget);
  }

  reset(principal: string): void {
    this.state.delete(principal);
  }

  async consume(principal: string, amount?: number): Promise<BudgetCheck> {
    const budget = this.budgets.get(principal);
    if (!budget) return { allowed: true };

    const now = Date.now();
    const windowMs = budget.windowMs ?? 3_600_000;
    let state = this.state.get(principal);
    if (!state || now - state.windowStart >= windowMs) {
      state = { count: 0, spend: 0, windowStart: now };
      this.state.set(principal, state);
    }

    const cost = amount ?? budget.costPerCall ?? 0;
    if (budget.maxCalls !== undefined && state.count >= budget.maxCalls) {
      return { allowed: false, reasonCode: 'BUDGET_EXCEEDED' };
    }
    if (budget.maxSpend !== undefined && state.spend + cost > budget.maxSpend) {
      return { allowed: false, reasonCode: 'BUDGET_EXCEEDED' };
    }

    state.count += 1;
    state.spend += cost;
    return {
      allowed: true,
      remaining: {
        calls: budget.maxCalls === undefined ? null : budget.maxCalls - state.count,
        spend: budget.maxSpend === undefined ? null : budget.maxSpend - state.spend,
      },
    };
  }
}
