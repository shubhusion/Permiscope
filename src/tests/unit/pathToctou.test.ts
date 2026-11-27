import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';

describe('path TOCTOU', () => {
  let root: string;
  let allowedDir: string;
  let outsideDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-toctou-'));
    allowedDir = path.join(root, 'allowed');
    outsideDir = path.join(root, 'outside');
    fs.mkdirSync(allowedDir);
    fs.mkdirSync(outsideDir);
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'original');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function gateway(guard?: () => boolean): ExecutionGateway {
    return new ExecutionGateway(
      new PolicyEngine({
        scopes: [
          {
            actionName: 'write_file',
            decision: 'ALLOW',
            allowedPaths: [allowedDir],
            ...(guard ? { guard } : {}),
          },
        ],
      }),
      {},
      {
        auditLogger: { log: async () => undefined } as unknown as AuditLogger,
        approvalCache: { isApproved: async () => false } as unknown as ApprovalCache,
        defaultPrincipalId: 'e2e',
      },
    );
  }

  function action(target: string) {
    return {
      actionName: 'write_file' as const,
      parameters: { path: target, content: 'PWNED' },
      agentId: 'e2e',
      timestamp: new Date(),
    };
  }

  test('a symlink swapped in after evaluation cannot redirect the write', async () => {
    const linkPath = path.join(allowedDir, 'linked');
    const target = path.join(linkPath, 'secret.txt');
    // `guard` runs after the policy-time path check but before execution, so
    // this reproduces a swap between evaluation and open().
    const guard = () => {
      fs.symlinkSync(outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      return true;
    };

    const result = await gateway(guard).run(action(target));

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('GUARDRAIL_PATH');
    expect(fs.readFileSync(path.join(outsideDir, 'secret.txt'), 'utf-8')).toBe('original');
  });

  test('a regular write inside the root still succeeds', async () => {
    const target = path.join(allowedDir, 'report.txt');
    const result = await gateway().run(action(target));

    expect(result.decision).toBe('ALLOW');
    expect(result.success).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('PWNED');
  });

  test('a symlink redirecting the target is refused', async () => {
    const linkPath = path.join(allowedDir, 'file-link');
    let target: string;
    if (process.platform === 'win32') {
      // File symlinks need elevated privileges on Windows; junctions do not.
      fs.symlinkSync(outsideDir, linkPath, 'junction');
      target = path.join(linkPath, 'secret.txt');
    } else {
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), linkPath, 'file');
      target = linkPath;
    }
    const result = await gateway().run(action(target));

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('GUARDRAIL_PATH');
    expect(fs.readFileSync(path.join(outsideDir, 'secret.txt'), 'utf-8')).toBe('original');
  });
});
