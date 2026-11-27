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

/** Counter view stored locally or in a shared backend. */
export interface BudgetSnapshot {
  attempts: number;
  executed: number;
  spend: number;
  windowStart: number;
}

/**
 * Optional shared backend for multi-process deployments. Implementations must
 * make compareAndSet atomic for a given principal (e.g. Redis WATCH/MULTI or a
 * database row version). Without one, budgets are process-local.
 */
export interface BudgetStore {
  read(principal: string): Promise<BudgetSnapshot | null>;
  compareAndSet(
    principal: string,
    expected: BudgetSnapshot | null,
    next: BudgetSnapshot,
  ): Promise<boolean>;
}

const DEFAULT_WINDOW_MS = 3_600_000;

/** Budget enforcement keyed by authenticated principal. */
export class BudgetTracker {
  private budgets = new Map<string, Budget>();
  private state = new Map<string, BudgetSnapshot>();
  private store?: BudgetStore;

  constructor(budgets: Record<string, Budget> = {}, store?: BudgetStore) {
    for (const [principal, budget] of Object.entries(budgets)) {
      this.budgets.set(principal, budget);
    }
    this.store = store;
  }

  configure(principal: string, budget: Budget): void {
    this.budgets.set(principal, budget);
  }

  reset(principal: string): void {
    this.state.delete(principal);
  }

  /**
   * Reads the current counter and the value a CAS must match. `expected` is null
   * when the store has no entry yet, so first-write CAS succeeds instead of
   * spinning forever against a freshly initialized local state.
   */
  private async load(
    principal: string,
    windowMs: number,
  ): Promise<{ state: BudgetSnapshot; expected: BudgetSnapshot | null }> {
    const stored = this.store
      ? await this.store.read(principal)
      : (this.state.get(principal) ?? null);
    const now = Date.now();
    if (!stored || now - stored.windowStart >= windowMs) {
      return {
        state: { attempts: 0, executed: 0, spend: 0, windowStart: now },
        expected: stored,
      };
    }
    return { state: { ...stored }, expected: stored };
  }

  private async commit(
    principal: string,
    expected: BudgetSnapshot | null,
    next: BudgetSnapshot,
  ): Promise<boolean> {
    if (this.store) return this.store.compareAndSet(principal, expected, next);
    // Even in-process, async interleaving can happen between load() and commit().
    // Honour the same compare-and-set contract as a shared store.
    const current = this.state.get(principal) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.state.set(principal, next);
    return true;
  }

  private remaining(budget: Budget, state: BudgetSnapshot): BudgetRemaining {
    return {
      calls: budget.maxCalls === undefined ? null : budget.maxCalls - state.executed,
      spend: budget.maxSpend === undefined ? null : budget.maxSpend - state.spend,
    };
  }

  /** Non-mutating preflight. Use before evaluation so blocked calls do not burn a call. */
  async check(principal: string): Promise<BudgetCheck> {
    const budget = this.budgets.get(principal);
    if (!budget) return { allowed: true };
    const { state } = await this.load(principal, budget.windowMs ?? DEFAULT_WINDOW_MS);
    if (
      (budget.maxCalls !== undefined && state.executed >= budget.maxCalls) ||
      (budget.maxSpend !== undefined && state.spend >= budget.maxSpend)
    ) {
      return {
        allowed: false,
        reasonCode: 'BUDGET_EXCEEDED',
        remaining: this.remaining(budget, state),
      };
    }
    return { allowed: true, remaining: this.remaining(budget, state) };
  }

  /** Records that a governable call arrived, whether or not it was allowed. */
  async noteAttempt(principal: string): Promise<void> {
    const budget = this.budgets.get(principal);
    if (!budget) return;
    const { state, expected } = await this.load(principal, budget.windowMs ?? DEFAULT_WINDOW_MS);
    await this.commit(principal, expected, { ...state, attempts: state.attempts + 1 });
  }

  /** Atomically reserves one execution. Call only just before the real side effect. */
  async consumeExecution(principal: string, amount?: number): Promise<BudgetCheck> {
    const budget = this.budgets.get(principal);
    if (!budget) return { allowed: true };
    const windowMs = budget.windowMs ?? DEFAULT_WINDOW_MS;
    const cost = amount ?? budget.costPerCall ?? 0;

    for (;;) {
      const { state, expected } = await this.load(principal, windowMs);
      if (
        (budget.maxCalls !== undefined && state.executed >= budget.maxCalls) ||
        (budget.maxSpend !== undefined && state.spend + cost > budget.maxSpend)
      ) {
        return {
          allowed: false,
          reasonCode: 'BUDGET_EXCEEDED',
          remaining: this.remaining(budget, state),
        };
      }
      const next: BudgetSnapshot = {
        ...state,
        executed: state.executed + 1,
        spend: state.spend + cost,
      };
      if (await this.commit(principal, expected, next)) {
        return { allowed: true, remaining: this.remaining(budget, next) };
      }
      // Another writer won the race; re-read and retry.
    }
  }

  /** Legacy alias. Counts an execution; new code should prefer check/noteAttempt/consumeExecution. */
  async consume(principal: string, amount?: number): Promise<BudgetCheck> {
    return this.consumeExecution(principal, amount);
  }

  /** Counter view for tests and dashboards. */
  async snapshotFor(principal: string): Promise<BudgetSnapshot | null> {
    const stored = this.store ? await this.store.read(principal) : this.state.get(principal);
    return stored ? { ...stored } : null;
  }
}
