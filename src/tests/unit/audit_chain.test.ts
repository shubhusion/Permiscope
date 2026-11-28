import * as fs from 'fs';
import { createHash } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { AuditLogger } from '../../logging/AuditLogger';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';

function entry(): Omit<Parameters<AuditLogger['log']>[0], never> {
  return {
    timestamp: new Date().toISOString(),
    agentId: 'audit-test',
    action: { actionName: 'safe', parameters: {}, agentId: 'audit-test', timestamp: new Date() },
    decision: 'ALLOW',
  };
}

function action(): Action {
  return {
    actionName: 'safe',
    parameters: {},
    agentId: 'audit-test',
    timestamp: new Date(),
  };
}

describe('audit chain', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-audit-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('verifies a large log with streamed reads', () => {
    const logger = new AuditLogger(dir, false);
    const lines: string[] = [];
    let hash = '0'.repeat(64);

    for (let sequence = 1; sequence <= 3000; sequence += 1) {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        agentId: 'large-log',
        action: {
          actionName: 'safe',
          parameters: {},
          agentId: 'large-log',
          timestamp: new Date(),
        },
        decision: 'ALLOW',
        sequence,
        previousHash: hash,
      });
      lines.push(line);
      hash = createHash('sha256').update(line).digest('hex');
    }

    const logPath = path.join(dir, 'audit.log');
    fs.writeFileSync(logPath, lines.join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'audit.log.head'), JSON.stringify({ sequence: 3000, hash }));

    expect(logger.verifyChain()).toEqual({ valid: true, errors: [] });
  });

  test('a signed chain with sequence numbers verifies', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1' });
    await logger.log(entry());
    await logger.log(entry());
    await logger.log(entry());

    expect(logger.verifyChain()).toEqual({ valid: true, errors: [] });
  });

  test('tampering with a line breaks verification', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1' });
    await logger.log(entry());
    await logger.log(entry());

    const logPath = path.join(dir, 'audit.log');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    const parsed = JSON.parse(lines[0]);
    parsed.decision = 'BLOCK';
    lines[0] = JSON.stringify(parsed);
    fs.writeFileSync(logPath, lines.join('\n') + '\n');

    expect(logger.verifyChain().valid).toBe(false);
  });

  test('truncating the tail is detected by the head record', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1' });
    await logger.log(entry());
    await logger.log(entry());
    await logger.log(entry());

    const logPath = path.join(dir, 'audit.log');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    fs.writeFileSync(logPath, lines.slice(0, 2).join('\n') + '\n');

    const result = logger.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Tail truncated'))).toBe(true);
  });

  test('key rotation keeps old entries verifiable', async () => {
    const keyRing = { v1: 'k1', v2: 'k2' };
    const first = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1', keyRing });
    await first.log(entry());
    await first.log(entry());

    const rotated = new AuditLogger(dir, false, { secret: 'k2', keyId: 'v2', keyRing });
    expect(rotated.verifyChain().valid).toBe(true);
    await rotated.log(entry());
    expect(rotated.verifyChain().valid).toBe(true);
  });

  test('an unknown keyId makes verification fail closed', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1' });
    await logger.log(entry());

    const withoutKey = new AuditLogger(dir, false, { secret: 'k2', keyId: 'v2' });
    expect(withoutKey.verifyChain().valid).toBe(false);
  });

  test('strict logging failure propagates and blocks the action', async () => {
    const logger = new AuditLogger(dir, true, { secret: 'k1', keyId: 'v1' });
    jest.spyOn(logger, 'log').mockRejectedValue(new Error('disk full'));
    const gateway = new ExecutionGateway(
      new PolicyEngine({ scopes: [{ actionName: 'safe', decision: 'ALLOW' }] }),
      { safe: async () => 'ok' },
      {
        auditLogger: logger,
        approvalCache: new ApprovalCache(dir),
        defaultPrincipalId: 'audit-test',
      },
    );

    await expect(gateway.run(action())).rejects.toThrow('disk full');
  });

  test('the head record is signed and tampering with it breaks verification', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1' });
    await logger.log(entry());

    const headPath = path.join(dir, 'audit.log.head');
    const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
    expect(head.signature).toBeDefined();
    expect(head.keyId).toBe('v1');

    head.hash = '0'.repeat(64);
    fs.writeFileSync(headPath, JSON.stringify(head));
    const result = logger.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Head'))).toBe(true);
  });

  test('a rotated key still verifies the old head signature', async () => {
    const keyRing = { v1: 'k1', v2: 'k2' };
    const first = new AuditLogger(dir, false, { secret: 'k1', keyId: 'v1', keyRing });
    await first.log(entry());

    const rotated = new AuditLogger(dir, false, { secret: 'k2', keyId: 'v2', keyRing });
    expect(rotated.verifyChain().valid).toBe(true);
  });
});
