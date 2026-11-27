import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';

function action(command: string): Action {
  return {
    actionName: 'run_command',
    parameters: { command },
    agentId: 'e2e',
    timestamp: new Date(),
  };
}

function engineWith(pattern: string): PolicyEngine {
  return new PolicyEngine({
    scopes: [{ actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: [pattern] }],
  });
}

describe('unsafe regex fail-closed', () => {
  test('a nested-quantifier pattern is rejected at construction', () => {
    expect(() => engineWith('(a+)+$')).toThrow(/Unsafe blocked-command pattern/);
  });

  test('an ambiguous quantified alternation is rejected even though safe-regex accepts it', () => {
    expect(() => engineWith('(a|a)*$')).toThrow(/Unsafe blocked-command pattern/);
  });

  test('an invalid pattern is rejected at construction', () => {
    expect(() => engineWith('[')).toThrow(/pattern rejected/);
  });

  test('safe patterns still block as before', async () => {
    const engine = engineWith('rm -rf');
    await expect(engine.evaluate(action('rm -rf /'))).resolves.toBe('BLOCK');
    await expect(engine.evaluate(action('echo hi'))).resolves.toBe('ALLOW');
  });

  test('a multi-scope policy fails to construct if any pattern is unsafe', () => {
    expect(
      () =>
        new PolicyEngine({
          scopes: [
            { actionName: 'read_config', decision: 'ALLOW' },
            {
              actionName: 'run_command',
              decision: 'ALLOW',
              blockedCommandPatterns: ['rm -rf', '(x+x+)+y'],
            },
          ],
        }),
    ).toThrow(/Unsafe blocked-command pattern/);
  });
});
