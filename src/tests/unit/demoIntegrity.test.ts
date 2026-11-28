import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runEval, EvalCase } from '../../eval/runner';
import { summarizeCategories } from '../../eval/summary';
import { generateRogueFixture } from '../../scenarios/rogue_agent';

describe('demo fixture integrity', () => {
  test('category summary counts only real passes', () => {
    const cases: EvalCase[] = [
      {
        id: 'a',
        category: 'safe',
        description: '',
        actionName: 'echo',
        parameters: {},
        expected: 'ALLOW',
      },
      {
        id: 'b',
        category: 'safe',
        description: '',
        actionName: 'echo',
        parameters: {},
        expected: 'ALLOW',
      },
      {
        id: 'c',
        category: 'unsafe',
        description: '',
        actionName: 'echo',
        parameters: {},
        expected: 'BLOCK',
      },
    ];
    expect(
      summarizeCategories(cases, { failures: [{ id: 'b', expected: 'ALLOW', actual: 'BLOCK' }] }),
    ).toEqual({
      safe: { passed: 1, total: 2 },
      unsafe: { passed: 1, total: 1 },
    });
  });

  test('rogue-agent scenario produces a verified signed chain', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-fixture-test-'));
    const output = path.join(dir, 'rogue-agent.json');
    try {
      await generateRogueFixture(output);
      const fixture = JSON.parse(fs.readFileSync(output, 'utf-8'));
      expect(fixture.chain.valid).toBe(true);
      expect(fixture.chain.errors).toEqual([]);
      expect(fixture.chain.entries).toBe(fixture.entries.length);
      expect(fixture.steps).toHaveLength(4);
      for (const step of fixture.steps) expect(step.actual).toBe(step.expected);
      expect(
        fixture.entries.every(
          (entry: { signature?: string; previousHash?: string }) =>
            entry.signature && entry.previousHash,
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('committed demo fixture matches a fresh eval run', async () => {
    const cases = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../eval/cases.json'), 'utf-8'),
    );
    const result = await runEval();
    const fixture = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../web/public/fixtures/demo.json'), 'utf-8'),
    );
    expect(fixture.eval.version).toBe(result.version);
    expect(fixture.eval.passed).toBe(result.passed);
    expect(fixture.eval.total).toBe(result.total);
    expect(fixture.eval.byCategory).toEqual(summarizeCategories(cases.cases, result));
    expect(fixture.chain.valid).toBe(true);
  });
});
