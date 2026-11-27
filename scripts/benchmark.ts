import { performance } from 'perf_hooks';
import { PolicyEngine } from '../src/engine/PolicyEngine';
import { ExecutionGateway } from '../src/gateway/ExecutionGateway';
import { ApprovalCache } from '../src/gateway/ApprovalCache';
import { AuditLogger } from '../src/logging/AuditLogger';
import { Action } from '../src/core/types';

const engine = new PolicyEngine({
  scopes: [
    { actionName: 'read_file', decision: 'ALLOW', allowedPaths: [process.cwd()] },
    { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['rm -rf'] },
    { actionName: 'noop', decision: 'ALLOW' },
  ],
});

const auditLogger = { log: async () => undefined } as unknown as AuditLogger;
const approvalCache = { isApproved: async () => false } as unknown as ApprovalCache;
const gateway = new ExecutionGateway(engine, { read_file: async () => 'ok' }, {
  auditLogger,
  approvalCache,
  defaultPrincipalId: 'bench',
});

const readAction: Action = {
  actionName: 'read_file',
  parameters: { path: 'package.json' },
  agentId: 'bench',
  timestamp: new Date(),
};

function ms(work: () => void | Promise<void>): Promise<number> {
  const start = performance.now();
  return Promise.resolve(work()).then(() => performance.now() - start);
}

async function main(): Promise<void> {
  const policyMs = await ms(async () => {
    for (let i = 0; i < 2000; i++) await engine.evaluate(readAction);
  });
  const gatewayMs = await ms(async () => {
    for (let i = 0; i < 500; i++) await gateway.run(readAction);
  });

  console.log(`Policy evaluation: ${(2000 / policyMs * 1000).toFixed(0)} decisions/sec`);
  console.log(`Gateway run (stub executor): ${(500 / gatewayMs * 1000).toFixed(0)} actions/sec`);
  console.log(`Average gateway overhead: ${(gatewayMs / 500).toFixed(3)} ms/action`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
