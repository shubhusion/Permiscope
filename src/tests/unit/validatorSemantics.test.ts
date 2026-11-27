import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';
import { definePolicy } from '../../policy/builder';

function action(): Action {
  return {
    actionName: 'safe',
    parameters: { path: '/tmp/file' },
    agentId: 'e2e',
    timestamp: new Date(),
  };
}

describe('when/guard predicate semantics', () => {
  test('guard false denies even when a later ALLOW scope matches', async () => {
    const engine = new PolicyEngine({
      scopes: [
        { actionName: 'safe', decision: 'ALLOW', guard: () => false },
        { actionName: 'safe', decision: 'ALLOW' },
      ],
    });
    const result = await engine.evaluateDetailed(action());
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('GUARD_FAILED');
  });

  test('guard true lets the scope allow', async () => {
    const engine = new PolicyEngine({
      scopes: [{ actionName: 'safe', decision: 'ALLOW', guard: () => true }],
    });
    await expect(engine.evaluate(action())).resolves.toBe('ALLOW');
  });

  test('when false skips the scope so a later scope can apply', async () => {
    const engine = new PolicyEngine({
      scopes: [
        { actionName: 'safe', decision: 'REQUIRE_APPROVAL', when: () => false },
        { actionName: 'safe', decision: 'ALLOW' },
      ],
    });
    await expect(engine.evaluate(action())).resolves.toBe('ALLOW');
  });

  test('when false with no fallback scope denies', async () => {
    const engine = new PolicyEngine({
      scopes: [{ actionName: 'safe', decision: 'ALLOW', when: () => false }],
    });
    const result = await engine.evaluateDetailed(action());
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('NO_APPLICABLE_SCOPE');
  });

  test('a throwing guard fails closed', async () => {
    const engine = new PolicyEngine({
      scopes: [
        {
          actionName: 'safe',
          decision: 'ALLOW',
          guard: () => {
            throw new Error('guard broke');
          },
        },
      ],
    });
    const result = await engine.evaluateDetailed(action());
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('GUARD_ERROR');
  });

  test('a throwing when predicate fails closed', async () => {
    const engine = new PolicyEngine({
      scopes: [
        {
          actionName: 'safe',
          decision: 'ALLOW',
          when: () => {
            throw new Error('when broke');
          },
        },
      ],
    });
    const result = await engine.evaluateDetailed(action());
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('WHEN_ERROR');
  });

  test('the typed policy builder exposes when and guard', async () => {
    const policy = definePolicy()
      .scope('safe')
      .allow()
      .when(() => true)
      .guard(() => false)
      .done()
      .build();
    const engine = new PolicyEngine(policy);
    const result = await engine.evaluateDetailed(action());
    expect(result.reasonCode).toBe('GUARD_FAILED');
  });

  test('legacy validator false still skips its scope', async () => {
    const engine = new PolicyEngine({
      scopes: [
        { actionName: 'safe', decision: 'REQUIRE_APPROVAL', validator: () => false },
        { actionName: 'safe', decision: 'ALLOW' },
      ],
    });
    // If the legacy validator were treated as a deny, this would be BLOCK.
    await expect(engine.evaluate(action())).resolves.toBe('ALLOW');
  });
});
