import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PolicyEngine } from '../engine/PolicyEngine';
import { defaultPolicy } from '../defaults/defaultPolicy';
import { Action, PermissionDecision, Policy } from '../core/types';

export interface EvalCase {
  id: string;
  category: string;
  description: string;
  actionName: string;
  parameters: Record<string, any>;
  expected: PermissionDecision;
}

export interface EvalCorpus {
  version: string;
  description?: string;
  cases: EvalCase[];
}

export interface EvalResult {
  version: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  failures: Array<{ id: string; expected: PermissionDecision; actual: PermissionDecision }>;
}

export const DEFAULT_CORPUS = path.resolve(__dirname, '../../eval/cases.json');

export function loadCorpus(corpusPath: string = DEFAULT_CORPUS): EvalCorpus {
  const raw = JSON.parse(fs.readFileSync(corpusPath, 'utf-8')) as EvalCorpus;
  if (!raw.version || !Array.isArray(raw.cases)) {
    throw new Error('Invalid corpus: expected version and cases array');
  }
  return raw;
}

function interpolate(value: any, replacements: Record<string, string>): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (match, key) => replacements[key] ?? match);
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, replacements));
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) result[key] = interpolate(item, replacements);
    return result;
  }
  return value;
}

export async function runEval(
  corpusPath: string = DEFAULT_CORPUS,
  policy: Policy = defaultPolicy,
): Promise<EvalResult> {
  const corpus = loadCorpus(corpusPath);
  const engine = new PolicyEngine(policy);
  const replacements = {
    WORKSPACE: process.cwd(),
    TMP: os.tmpdir(),
    OUTSIDE: path.dirname(process.cwd()),
  };

  const result: EvalResult = {
    version: corpus.version,
    total: corpus.cases.length,
    passed: 0,
    failed: 0,
    passRate: 0,
    failures: [],
  };

  for (const testCase of corpus.cases) {
    const action: Action = {
      actionName: testCase.actionName,
      parameters: interpolate(testCase.parameters, replacements),
      agentId: 'eval-runner',
      timestamp: new Date(),
    };
    const actual = await engine.evaluate(action);
    if (actual === testCase.expected) {
      result.passed += 1;
    } else {
      result.failed += 1;
      result.failures.push({ id: testCase.id, expected: testCase.expected, actual });
    }
  }

  result.passRate = result.total ? (result.passed / result.total) * 100 : 0;
  return result;
}
