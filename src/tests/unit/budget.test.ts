import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { BudgetSnapshot, BudgetStore, BudgetTracker } from '../../gateway/BudgetTracker';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';

const auditLogger = { log: async () => undefined } as unknown as AuditLogger;
const approvalCache = { isApproved: async () => false } as unknown as ApprovalCache;

function action(): Action {
  return {
    actionName: 'safe',
    parameters: {},
    agentId: 'budget-test',
    timestamp: new Date(),
  };
}

function gateway(tracker?: BudgetTracker) {
  return new ExecutionGateway(
    new PolicyEngine({ scopes: [{ actionName: 'safe', decision: 'ALLOW' }] }),
    { safe: async () => 'ok' },
    {
      auditLogger,
      approvalCache,
      defaultPrincipalId: 'budget-test',
      ...(tracker ? { budgetTracker: tracker } : {}),
    },
  );
}

describe('action budgets', () => {
  test('enforces max calls and reports remaining budget', async () => {
    const tracker = new BudgetTracker({ 'budget-test': { maxCalls: 1 } });
    const gw = gateway(tracker);

    const first = await gw.run(action());
    expect(first.success).toBe(true);
    expect(first.budgetRemaining).toEqual({ calls: 0, spend: null });

    const second = await gw.run(action());
    expect(second.decision).toBe('BLOCK');
    expect(second.reasonCode).toBe('BUDGET_EXCEEDED');
  });

  test('enforces spend caps', async () => {
    const tracker = new BudgetTracker({
      'budget-test': { maxSpend: 5, costPerCall: 3 },
    });
    const gw = gateway(tracker);

    expect((await gw.run(action())).success).toBe(true);
    const second = await gw.run(action());
    expect(second.reasonCode).toBe('BUDGET_EXCEEDED');
    expect(second.budgetRemaining).toEqual({ calls: null, spend: 2 });
  });

  test('reset clears the window', async () => {
    const tracker = new BudgetTracker({ 'budget-test': { maxCalls: 1 } });
    const gw = gateway(tracker);

    await gw.run(action());
    expect((await gw.run(action())).reasonCode).toBe('BUDGET_EXCEEDED');
    tracker.reset('budget-test');
    expect((await gw.run(action())).success).toBe(true);
  });

  test('no budget configured means unlimited', async () => {
    const gw = gateway();
    expect((await gw.run(action())).success).toBe(true);
    expect((await gw.run(action())).success).toBe(true);
  });

  test('policy-blocked calls are recorded as attempts but do not consume executions', async () => {
    const tracker = new BudgetTracker({ 'budget-test': { maxCalls: 1 } });
    const gw = new ExecutionGateway(
      new PolicyEngine({
        scopes: [
          { actionName: 'safe', decision: 'ALLOW' },
          { actionName: 'blocked', decision: 'BLOCK' },
        ],
      }),
      { safe: async () => 'ok' },
      { auditLogger, approvalCache, defaultPrincipalId: 'budget-test', budgetTracker: tracker },
    );
    const blocked = { ...action(), actionName: 'blocked' as const };

    expect((await gw.run(blocked)).decision).toBe('BLOCK');
    expect((await gw.run(blocked)).decision).toBe('BLOCK');
    expect((await gw.run(action())).success).toBe(true);

    const snapshot = await tracker.snapshotFor('budget-test');
    expect(snapshot?.attempts).toBe(3);
    expect(snapshot?.executed).toBe(1);
  });

  test('concurrent calls never exceed the execution cap', async () => {
    const tracker = new BudgetTracker({ 'budget-test': { maxCalls: 2 } });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => gateway(tracker).run(action())),
    );
    expect(results.filter((result) => result.success)).toHaveLength(2);
    expect(results.filter((result) => result.reasonCode === 'BUDGET_EXCEEDED')).toHaveLength(4);
    expect((await tracker.snapshotFor('budget-test'))?.executed).toBe(2);
  });

  test('a shared store makes the budget common to multiple trackers', async () => {
    const shared = new Map<string, BudgetSnapshot>();
    const store: BudgetStore = {
      read: async (principal) => shared.get(principal) ?? null,
      compareAndSet: async (principal, expected, next) => {
        const current = shared.get(principal) ?? null;
        if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
        shared.set(principal, next);
        return true;
      },
    };
    const first = new BudgetTracker({ 'budget-test': { maxCalls: 1 } }, store);
    const second = new BudgetTracker({ 'budget-test': { maxCalls: 1 } }, store);

    expect((await gateway(first).run(action())).success).toBe(true);
    expect((await gateway(second).run(action())).reasonCode).toBe('BUDGET_EXCEEDED');
  });
});
