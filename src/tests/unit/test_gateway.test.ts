import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';

describe('ExecutionGateway', () => {
  const policy = {
    scopes: [
      { actionName: 'safe_action', decision: 'ALLOW' as const },
      { actionName: 'blocked_action', decision: 'BLOCK' as const },
      { actionName: 'shadow_action', decision: 'BLOCK' as const },
    ],
  };
  const engine = new PolicyEngine(policy);
  const gateway = new ExecutionGateway(engine);
  const agentId = 'test-gateway';
  const timestamp = new Date();

  test('Dry Run ALLOW', async () => {
    const result = await gateway.run(
      { actionName: 'safe_action', parameters: {}, agentId, timestamp },
      true,
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.success).toBe(true);
  });

  test('Dry Run BLOCK', async () => {
    const result = await gateway.run(
      { actionName: 'blocked_action', parameters: {}, agentId, timestamp },
      true,
    );
    expect(result.decision).toBe('BLOCK');
    expect(result.success).toBe(false);
  });

  test('Shadow Mode Blocked Action', async () => {
    const result = await gateway.run({
      actionName: 'shadow_action',
      parameters: {},
      agentId,
      timestamp,
      shadowMode: true,
    } as any);

    expect(result.success).toBe(true);
    expect(result.decision).toBe('SHADOW_BLOCK');
    expect(result.output).toBe('[SHADOW] Action appeared successful.');
  });
});
