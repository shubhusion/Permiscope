import { EvalCase, EvalResult } from './runner';

/**
 * Per-category results derived from real eval outcomes. A case is counted as
 * passed only when it is absent from `failures`; never assume the corpus passes.
 */
export function summarizeCategories(
  cases: EvalCase[],
  result: Pick<EvalResult, 'failures'>,
): Record<string, { passed: number; total: number }> {
  const failed = new Set(result.failures.map((failure) => failure.id));
  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const item of cases) {
    const bucket = (byCategory[item.category] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (!failed.has(item.id)) bucket.passed += 1;
  }
  return byCategory;
}
