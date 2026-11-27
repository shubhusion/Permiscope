import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditLogger } from '../../logging/AuditLogger';
import { signHs256Token } from '../../auth/verifiedPrincipal';

const SECRET_OUTPUT = 'DATABASE_PASSWORD=hunter2\nAPI_KEY=abcdef';
const JWT = signHs256Token({ sub: 'alice' }, 'key');

function entry(output: unknown, error?: unknown) {
  return {
    timestamp: new Date().toISOString(),
    agentId: 'e2e',
    action: {
      actionName: 'read_file',
      parameters: { path: '/tmp/.env' },
      agentId: 'e2e',
      timestamp: new Date(),
    },
    decision: 'ALLOW' as const,
    result: { success: true, output, error },
  };
}

describe('sensitive execution output', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-output-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('output and error are redacted by default', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k', keyId: 'v1' });
    await logger.log(entry(SECRET_OUTPUT, JWT));

    const line = fs.readFileSync(path.join(dir, 'audit.log'), 'utf-8');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain(JWT);
    expect(line).toContain('"output":"[redacted]"');
    expect(line).toContain('"error":"[redacted]"');
    expect(line).toContain('"success":true');
    expect(logger.verifyChain().valid).toBe(true);
  });

  test('an explicit allowlist keeps the field but still redacts credential-shaped values', async () => {
    const logger = new AuditLogger(dir, false, {
      secret: 'k',
      keyId: 'v1',
      allowedOutputKeys: ['output'],
    });
    await logger.log(entry({ message: 'hello', token: JWT }, 'plain error'));

    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'audit.log'), 'utf-8').trim());
    expect(parsed.result.output.message).toBe('hello');
    expect(parsed.result.output.token).toBe('[redacted]');
    expect(parsed.result.error).toBe('[redacted]');
  });
});
