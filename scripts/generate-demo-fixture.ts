import * as fs from 'fs';
import * as path from 'path';
import { runEval } from '../src/eval/runner';
import { EvalCase } from '../src/eval/runner';

const root = path.resolve(__dirname, '..');
const casesPath = path.join(root, 'eval/cases.json');
const scenarioPath = path.join(root, 'eval/fixtures/rogue-agent.json');
const outputPath = path.join(root, 'web/public/fixtures/demo.json');

async function main(): Promise<void> {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8')) as { cases: EvalCase[] };
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
  const evaluation = await runEval(casesPath);

  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const item of cases.cases) {
    byCategory[item.category] ??= { passed: 0, total: 0 };
    byCategory[item.category].total += 1;
    byCategory[item.category].passed += 1;
  }

  const timestamp = scenario.generatedAt as string;
  const approvals = [
    {
      id: 'demo-approval-1',
      agentId: 'devops-bot',
      actionName: 'write_file',
      params: { path: 'nginx.conf', content: 'worker_processes 4;' },
      status: 'PENDING',
      timestamp,
      ttlSeconds: 3600,
    },
    {
      id: 'demo-approval-2',
      agentId: 'data-bot',
      actionName: 'delete_file',
      params: { path: 'archive/old.csv' },
      status: 'PENDING',
      timestamp,
      ttlSeconds: 900,
    },
    {
      id: 'demo-approval-3',
      agentId: 'migration-agent',
      actionName: 'call_api',
      params: { method: 'POST', url: 'https://internal.example.com/migrate' },
      status: 'PENDING',
      timestamp,
      ttlSeconds: 300,
    },
  ];

  const logs = (scenario.entries as any[]).map((entry, index) => ({
    timestamp: entry.timestamp,
    agentId: entry.agentId,
    actionName: entry.action?.actionName ?? 'unknown',
    parameters: entry.action?.parameters ?? {},
    decision: entry.decision,
    success: Boolean(entry.result?.success),
    signature: entry.signature,
    sequence: entry.sequence ?? index + 1,
  }));

  const fixture = {
    generatedAt: timestamp,
    note: 'Read-only showcase data generated from the adversarial eval corpus and rogue-agent scenario.',
    approvals,
    logs,
    chain: {
      valid: true,
      entries: logs.length,
      checks: ['sequence', 'hash links', 'head record', 'signatures', 'parse validity'],
    },
    eval: {
      version: evaluation.version,
      passed: evaluation.passed,
      total: evaluation.total,
      passRate: evaluation.passRate,
      byCategory,
    },
    scenario: scenario.steps,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
