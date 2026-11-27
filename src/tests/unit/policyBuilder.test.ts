import * as os from 'os';
import * as path from 'path';
import { definePolicy } from '../../policy/builder';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action, Policy } from '../../core/types';

describe('policy builder', () => {
  test('produces the same shape as a hand-written policy', () => {
    const tmp = os.tmpdir();
    const validator = (a: Action) => a.parameters.ok === true;
    const handWritten: Policy = {
      scopes: [
        { actionName: 'read_file', decision: 'ALLOW', allowedPaths: [tmp] },
        {
          actionName: 'run_command',
          decision: 'BLOCK',
          blockedCommandPatterns: ['rm -rf'],
        },
        {
          actionName: 'sensitive',
          decision: 'REQUIRE_APPROVAL',
          roles: ['admin'],
          validator,
        },
      ],
    };

    const built: Policy = definePolicy()
      .scope('read_file')
      .allow()
      .whenPath([tmp])
      .done()
      .scope('run_command')
      .block()
      .whenCommand(['rm -rf'])
      .done()
      .scope('sensitive')
      .requireApproval()
      .withRoles(['admin'])
      .withValidator(validator)
      .done()
      .build();

    expect(built).toEqual(handWritten);
  });

  test('wildcards and postconditions carry through to evaluation', async () => {
    const policy = definePolicy()
      .scope('mcp:*')
      .requireApproval()
      .withRoles(['agent'])
      .withPostconditions([{ description: 'output exists', check: (_a, output) => !!output }])
      .done()
      .build();

    const engine = new PolicyEngine(policy);
    const allowed: Action = {
      actionName: 'mcp:echo',
      parameters: {},
      agentId: 'builder-test',
      timestamp: new Date(),
      roles: ['agent'],
    };
    await expect(engine.evaluate(allowed)).resolves.toBe('REQUIRE_APPROVAL');
    await expect(engine.evaluate({ ...allowed, roles: [] })).resolves.toBe('BLOCK');
    expect(policy.scopes[0].postconditions).toHaveLength(1);
  });

  test('builder output is immutable from the builder after build', () => {
    const builder = definePolicy().scope('safe').allow().done();
    const first = builder.build();
    builder.add({ actionName: 'extra', decision: 'ALLOW' });
    expect(first.scopes).toHaveLength(1);
    expect(builder.build().scopes).toHaveLength(2);
  });

  test('validator can be composed with path guardrails', async () => {
    const tmp = os.tmpdir();
    const policy = definePolicy()
      .scope('read_file')
      .allow()
      .whenPath([tmp])
      .withValidator((a: Action) => a.parameters.name === 'ok.txt')
      .done()
      .build();

    const engine = new PolicyEngine(policy);
    const base: Action = {
      actionName: 'read_file',
      parameters: { path: path.join(tmp, 'ok.txt'), name: 'ok.txt' },
      agentId: 'builder-test',
      timestamp: new Date(),
    };
    await expect(engine.evaluate(base)).resolves.toBe('ALLOW');
    await expect(
      engine.evaluate({ ...base, parameters: { ...base.parameters, name: 'bad' } }),
    ).resolves.toBe('BLOCK');
  });
});
