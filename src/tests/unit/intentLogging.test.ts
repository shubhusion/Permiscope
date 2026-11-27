import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditLogger } from '../../logging/AuditLogger';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { ExecutionGateway } from '../../gateway/ExecutionGateway';
import { PolicyEngine } from '../../engine/PolicyEngine';
import { Action } from '../../core/types';

function action(): Action {
  return {
    actionName: 'safe',
    parameters: {},
    agentId: 'spoofed',
    timestamp: new Date(),
  };
}

function gateway(logger: AuditLogger, execute = async () => 'ok'): ExecutionGateway {
  return new ExecutionGateway(
    new PolicyEngine({ scopes: [{ actionName: 'safe', decision: 'ALLOW' }] }),
    { safe: execute },
    {
      auditLogger: logger,
      approvalCache: new ApprovalCache(),
      defaultPrincipalId: 'audit-test',
    },
  );
}

describe('intent-before-execution logging', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-intent-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a strict-mode intent failure blocks the side effect', async () => {
    const logger = new AuditLogger(dir, true, { secret: 'k', keyId: 'v1' });
    const execute = jest.fn().mockResolvedValue('ok');
    jest.spyOn(logger, 'log').mockImplementation(async (entry) => {
      if (entry.phase === 'INTENT') throw new Error('disk full');
    });

    await expect(gateway(logger, execute).run(action())).rejects.toThrow('disk full');
    expect(execute).not.toHaveBeenCalled();
  });

  test('an executed action writes linked INTENT and RESULT records that verify', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k', keyId: 'v1' });
    const result = await gateway(logger).run(action());
    expect(result.success).toBe(true);

    const lines = fs
      .readFileSync(path.join(dir, 'audit.log'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.phase)).toEqual(['INTENT', 'RESULT']);
    expect(lines[0].intentHash).toBeDefined();
    expect(lines[1].intentHash).toBe(lines[0].intentHash);
    expect(lines[0].result).toEqual({ planned: true });
    expect(lines[1].result).toMatchObject({ success: true, output: '[redacted]' });
    expect(logger.verifyChain()).toEqual({ valid: true, errors: [] });
  });

  test('tampering with either phase is detected', async () => {
    const logger = new AuditLogger(dir, false, { secret: 'k', keyId: 'v1' });
    await gateway(logger).run(action());
    const logPath = path.join(dir, 'audit.log');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    const tampered = JSON.parse(lines[1]);
    tampered.result.success = false;
    fs.writeFileSync(logPath, [lines[0], JSON.stringify(tampered)].join('\n') + '\n');

    expect(logger.verifyChain().valid).toBe(false);
  });

  test('a result-write failure reports that the action already ran', async () => {
    const logger = new AuditLogger(dir, true, { secret: 'k', keyId: 'v1' });
    // Remove the log directory after the INTENT write but before the RESULT
    // write, so the real logger's strict-mode error path is exercised.
    const execute = jest.fn().mockImplementation(async () => {
      fs.rmSync(dir, { recursive: true, force: true });
      return 'ok';
    });

    await expect(gateway(logger, execute).run(action())).rejects.toThrow(
      'its result could not be recorded',
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
