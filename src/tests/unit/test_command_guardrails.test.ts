import { PolicyEngine } from '../../engine/PolicyEngine';
import { parseCommand } from '../../engine/commandPolicy';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { Action, Policy } from '../../core/types';

const policy: Policy = {
  scopes: [
    {
      actionName: 'run_command',
      decision: 'ALLOW',
      blockedCommandPatterns: ['rm -rf', 'sudo', 'shutdown'],
    },
  ],
};

function action(command: string): Action {
  return {
    actionName: 'run_command',
    parameters: { command },
    agentId: 'guardrail-test',
    timestamp: new Date(),
  };
}

describe('command guardrails', () => {
  const engine = new PolicyEngine(policy);

  test.each([
    '$(rm -rf /)',
    '`rm -rf /`',
    'rm  -rf  /',
    'sh -c "rm -rf /"',
    'echo hi && rm -rf /',
    'echo hi | rm -rf /',
    'echo hi # rm -rf /',
    'sudo echo hi',
  ])('blocks %s', async (command) => {
    await expect(engine.evaluate(action(command))).resolves.toBe('BLOCK');
  });

  test.each(['echo hello', 'echo "hello world"', 'git status'])('allows %s', async (command) => {
    await expect(engine.evaluate(action(command))).resolves.toBe('ALLOW');
  });

  test('parses quoted words without inventing shell tokens', () => {
    expect(parseCommand('echo "hello world"')).toEqual({ ok: true, argv: ['echo', 'hello world'] });
  });

  test('rejects operators instead of silently deleting them', () => {
    const parsed = parseCommand('$(rm -rf /)');
    expect(parsed.ok).toBe(false);
  });

  test('executes an allowed command as argv', async () => {
    const gateway = new ExecutionGateway(engine);
    const result = await gateway.run(action('echo hello'), true);
    expect(result.decision).toBe('ALLOW');
    expect(result.success).toBe(true);

    // Dry-run skips execution, so exercise the real argv executor separately.
    const executed = await new ExecutionGateway(engine).run(action('echo hello'));
    expect(executed.success).toBe(true);
    expect(String(executed.output).trim()).toBe('hello');
  });

  test('does not execute a blocked command', async () => {
    let executed = false;
    const gateway = new ExecutionGateway(engine, {
      run_command: async () => {
        executed = true;
        return 'should not run';
      },
    });
    const result = await gateway.run(action('$(rm -rf /)'));
    expect(result.decision).toBe('BLOCK');
    expect(result.success).toBe(false);
    expect(executed).toBe(false);
  });
});
