import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { BudgetTracker } from '../../gateway/BudgetTracker';
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
    expect(second.budgetRemaining).toBeUndefined();
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
});
