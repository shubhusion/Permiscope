import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action, PermissionDecision, Policy } from '../../core/types';

function policyFor(allowedPaths?: string[]): Policy {
  return {
    scopes: [
      { actionName: 'read_file', decision: 'ALLOW', allowedPaths },
      { actionName: 'write_file', decision: 'ALLOW', allowedPaths },
    ],
  };
}

function fileAction(actionName: string, filePath: string): Action {
  return {
    actionName,
    parameters: { path: filePath },
    agentId: 'path-guardrail-test',
    timestamp: new Date(),
  };
}

describe('path guardrails', () => {
  let base: string;
  let allowedRoot: string;
  let outside: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-path-'));
    allowedRoot = path.join(base, 'allowed');
    outside = path.join(base, 'outside');
    fs.mkdirSync(allowedRoot);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(allowedRoot, 'ok.txt'), 'ok');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const decisionFor = async (
    engine: PolicyEngine,
    actionName: string,
    filePath: string,
  ): Promise<PermissionDecision> => engine.evaluate(fileAction(actionName, filePath));

  test('allows paths inside the configured root', async () => {
    const engine = new PolicyEngine(policyFor([allowedRoot]));
    await expect(decisionFor(engine, 'read_file', path.join(allowedRoot, 'ok.txt'))).resolves.toBe(
      'ALLOW',
    );
    await expect(
      decisionFor(engine, 'write_file', path.join(allowedRoot, 'new.txt')),
    ).resolves.toBe('ALLOW');
  });

  test('blocks traversal outside the root', async () => {
    const engine = new PolicyEngine(policyFor([allowedRoot]));
    const escaped = path.join(allowedRoot, '..', 'outside', 'secret.txt');
    await expect(decisionFor(engine, 'read_file', escaped)).resolves.toBe('BLOCK');
  });

  test('blocks a prefix-sibling directory', async () => {
    const sibling = `${allowedRoot}-evil`;
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'secret.txt'), 'secret');
    const engine = new PolicyEngine(policyFor([allowedRoot]));
    await expect(decisionFor(engine, 'read_file', path.join(sibling, 'secret.txt'))).resolves.toBe(
      'BLOCK',
    );
  });

  test.each([undefined, []])('fails closed when no roots are configured (%p)', async (roots) => {
    const engine = new PolicyEngine(policyFor(roots));
    await expect(decisionFor(engine, 'read_file', path.join(allowedRoot, 'ok.txt'))).resolves.toBe(
      'BLOCK',
    );
    await expect(
      decisionFor(engine, 'write_file', path.join(allowedRoot, 'new.txt')),
    ).resolves.toBe('BLOCK');
  });

  test('fails closed when a configured root does not exist', async () => {
    const engine = new PolicyEngine(policyFor([path.join(base, 'missing-root')]));
    await expect(
      decisionFor(engine, 'write_file', path.join(allowedRoot, 'new.txt')),
    ).resolves.toBe('BLOCK');
  });

  test('blocks symlink escape from the allowed root', async () => {
    const link = path.join(allowedRoot, 'escape');
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      // Symlink creation needs elevated privileges on some Windows setups.
      return;
    }
    const engine = new PolicyEngine(policyFor([allowedRoot]));
    await expect(decisionFor(engine, 'read_file', path.join(link, 'secret.txt'))).resolves.toBe(
      'BLOCK',
    );
  });

  test('does not lowercase paths on POSIX', async () => {
    if (process.platform === 'win32') return;
    const engine = new PolicyEngine(policyFor([allowedRoot]));
    const uppercased = allowedRoot.replace(/allowed$/, 'ALLOWED');
    await expect(decisionFor(engine, 'read_file', path.join(uppercased, 'ok.txt'))).resolves.toBe(
      'BLOCK',
    );
  });
});
