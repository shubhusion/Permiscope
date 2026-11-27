import { parseCommand } from '../../engine/commandPolicy';
import { isPathWithin } from '../../engine/pathGuard';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';

/** Deterministic PRNG so the "fuzzing" is reproducible in CI. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('deterministic fuzz checks', () => {
  test('command tokenizer never throws and never returns unsafe argv', () => {
    const random = seeded(42);
    const alphabet = ['a', 'b', ' ', '$', '(', ')', '`', '|', '&', ';', '/', '\\', "'", '"', '\t'];
    for (let i = 0; i < 500; i++) {
      const length = Math.floor(random() * 20);
      let command = '';
      for (let j = 0; j < length; j++) command += alphabet[Math.floor(random() * alphabet.length)];

      const parsed = parseCommand(command);
      if (parsed.ok) {
        for (const token of parsed.argv) {
          expect(typeof token).toBe('string');
          expect(token.includes('$')).toBe(false);
          expect(token.includes('`')).toBe(false);
        }
      } else {
        expect(parsed.reason.length).toBeGreaterThan(0);
      }
    }
  });

  test('path containment is total and fails closed for missing roots', () => {
    const random = seeded(7);
    const segments = ['a', '..', '.', 'tmp', 'evil'];
    for (let i = 0; i < 300; i++) {
      const parts: string[] = [];
      for (let j = 0; j < 5; j++) parts.push(segments[Math.floor(random() * segments.length)]);
      const candidate = parts.join('/');
      expect(typeof isPathWithin(candidate, ['/definitely/missing/root'])).toBe('boolean');
      expect(isPathWithin(candidate, [])).toBe(false);
      expect(isPathWithin(undefined, ['/tmp'])).toBe(false);
    }
  });

  test('policy evaluation stays total for random action names and parameters', async () => {
    const random = seeded(11);
    const engine = new PolicyEngine({
      scopes: [
        { actionName: 'safe', decision: 'ALLOW' },
        { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['rm -rf'] },
      ],
    });
    const names = ['safe', 'run_command', 'unknown', 'mcp:*'];
    for (let i = 0; i < 300; i++) {
      const action: Action = {
        actionName: names[Math.floor(random() * names.length)],
        parameters: { command: random() > 0.5 ? 'echo hi' : 'rm -rf /' },
        agentId: 'fuzz',
        timestamp: new Date(),
      };
      const decision = await engine.evaluate(action);
      expect(['ALLOW', 'BLOCK', 'REQUIRE_APPROVAL', 'SHADOW_BLOCK']).toContain(decision);
    }
  });
});
