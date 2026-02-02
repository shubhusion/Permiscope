import { PolicyEngine } from '../../engine/PolicyEngine';

describe('PolicyEngine & Guardrails', () => {
  const policy = {
    scopes: [
      { actionName: 'safe_action', decision: 'ALLOW' as const },
      { actionName: 'blocked_action', decision: 'BLOCK' as const },
      { actionName: 'approval_action', decision: 'REQUIRE_APPROVAL' as const },
      {
        actionName: 'write_file',
        decision: 'ALLOW' as const,
        allowedPaths: ['/tmp/', 'C:\\Safe'],
      },
      {
        actionName: 'run_command',
        decision: 'ALLOW' as const,
        blockedCommandPatterns: ['rm -rf', 'sudo'],
      },
      {
        actionName: 'dynamic_action',
        decision: 'ALLOW' as const,
        validator: async (action: any) => {
          return action.parameters.magic === 42;
        },
      },
    ],
  };
  const engine = new PolicyEngine(policy);
  const agentId = 'test-agent';
  const timestamp = new Date();

  test('Basic ALLOW', async () => {
    const decision = await engine.evaluate({
      actionName: 'safe_action',
      parameters: {},
      agentId,
      timestamp,
    });
    expect(decision).toBe('ALLOW');
  });

  test('Basic BLOCK', async () => {
    const decision = await engine.evaluate({
      actionName: 'blocked_action',
      parameters: {},
      agentId,
      timestamp,
    });
    expect(decision).toBe('BLOCK');
  });

  test('Basic REQUIRE_APPROVAL', async () => {
    const decision = await engine.evaluate({
      actionName: 'approval_action',
      parameters: {},
      agentId,
      timestamp,
    });
    expect(decision).toBe('REQUIRE_APPROVAL');
  });

  test('Default Deny for unknown action', async () => {
    const decision = await engine.evaluate({
      actionName: 'unknown_action',
      parameters: {},
      agentId,
      timestamp,
    });
    expect(decision).toBe('BLOCK');
  });

  test('Path in /tmp allowed', async () => {
    const decision = await engine.evaluate({
      actionName: 'write_file',
      parameters: { path: '/tmp/test.txt' },
      agentId,
      timestamp,
    });
    expect(decision).toBe('ALLOW');
  });

  test('Path in /etc blocked', async () => {
    const decision = await engine.evaluate({
      actionName: 'write_file',
      parameters: { path: '/etc/passwd' },
      agentId,
      timestamp,
    });
    expect(decision).toBe('BLOCK');
  });

  test('Safe command allowed', async () => {
    const decision = await engine.evaluate({
      actionName: 'run_command',
      parameters: { command: 'echo hello' },
      agentId,
      timestamp,
    });
    expect(decision).toBe('ALLOW');
  });

  test('Dangerous command blocked', async () => {
    const decision = await engine.evaluate({
      actionName: 'run_command',
      parameters: { command: 'rm -rf /' },
      agentId,
      timestamp,
    });
    expect(decision).toBe('BLOCK');
  });

  test('Dynamic rule passed (magic=42)', async () => {
    const decision = await engine.evaluate({
      actionName: 'dynamic_action',
      parameters: { magic: 42 },
      agentId,
      timestamp,
    });
    expect(decision).toBe('ALLOW');
  });

  test('Dynamic rule failed (magic=0)', async () => {
    const decision = await engine.evaluate({
      actionName: 'dynamic_action',
      parameters: { magic: 0 },
      agentId,
      timestamp,
    });
    expect(decision).toBe('BLOCK');
  });
});
