import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runEval } from '../../eval/runner';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action, Policy } from '../../core/types';

describe('adversarial eval corpus', () => {
  test('the committed corpus passes completely', async () => {
    const result = await runEval();
    expect(result.total).toBeGreaterThanOrEqual(30);
    expect(result.failed).toBe(0);
    expect(result.passRate).toBe(100);
  });

  test('failures are reported with expected and actual decisions', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-eval-'));
    const corpusPath = path.join(dir, 'cases.json');
    fs.writeFileSync(
      corpusPath,
      JSON.stringify({
        version: 'test',
        cases: [
          {
            id: 'x-1',
            category: 'test',
            description: 'deliberately wrong expectation',
            actionName: 'read_file',
            parameters: { path: '{{TMP}}/ok.txt' },
            expected: 'BLOCK',
          },
        ],
      }),
    );

    const result = await runEval(corpusPath);
    expect(result.failures).toEqual([{ id: 'x-1', expected: 'BLOCK', actual: 'ALLOW' }]);
    expect(result.passRate).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a false validator skips its scope instead of blocking', async () => {
    const policy: Policy = {
      scopes: [
        {
          actionName: 'read_file',
          decision: 'REQUIRE_APPROVAL',
          allowedPaths: [os.tmpdir()],
          validator: () => false,
        },
        { actionName: 'read_file', decision: 'ALLOW', allowedPaths: [os.tmpdir()] },
      ],
    };
    const action: Action = {
      actionName: 'read_file',
      parameters: { path: path.join(os.tmpdir(), 'notes.txt') },
      agentId: 'eval',
      timestamp: new Date(),
    };
    await expect(new PolicyEngine(policy).evaluate(action)).resolves.toBe('ALLOW');
  });

  test('the rogue-agent fixture is deterministic and internally consistent', () => {
    const fixturePath = path.resolve(__dirname, '../../../eval/fixtures/rogue-agent.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    expect(fixture.version).toBe('1.0.0');
    expect(fixture.entries).toHaveLength(4);
    expect(fixture.entries.map((entry: { sequence: number }) => entry.sequence)).toEqual([
      1, 2, 3, 4,
    ]);
    for (const step of fixture.steps) expect(step.actual).toBe(step.expected);
  });
});
