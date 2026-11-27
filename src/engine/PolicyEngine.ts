import {
  Action,
  PermissionScope,
  Policy,
  PermissionDecision,
  DecisionExplanation,
} from '../core/types';
import safeRegex from 'safe-regex';
import { parseCommand } from './commandPolicy';
import { isPathWithin } from './pathGuard';

export class PolicyEngine {
  private policy: Policy;
  private patternCache = new Map<string, RegExp | null>();

  constructor(policy: Policy) {
    this.policy = policy;
    // Fail closed at construction time. A skipped block rule is worse than a
    // policy that refuses to start, because the author believes it is active.
    for (const scope of policy.scopes) {
      for (const pattern of scope.blockedCommandPatterns ?? []) {
        this.compilePattern(pattern);
      }
    }
  }

  async evaluate(action: Action): Promise<PermissionDecision> {
    return (await this.evaluateDetailed(action)).decision;
  }

  /** Same decision as evaluate(), plus why it was made and how to proceed. */
  async evaluateDetailed(action: Action): Promise<DecisionExplanation> {
    const matchingScopes = this.findMatchingScopes(action);

    if (matchingScopes.length === 0) {
      return {
        decision: 'BLOCK',
        reasonCode: 'NO_MATCHING_SCOPE',
        remediation: 'Add a policy scope for this action or use a custom executor.',
      };
    }

    let finalDecision: PermissionDecision = 'ALLOW';
    let applied = false;

    for (const scope of matchingScopes) {
      if (scope.when) {
        try {
          if (!(await scope.when(action))) continue;
        } catch (e) {
          console.error('Policy predicate error:', e);
          return {
            decision: 'BLOCK',
            reasonCode: 'WHEN_ERROR',
            matchedScope: scope.actionName,
            remediation: 'The scope predicate failed; fix the policy before retrying.',
          };
        }
      }

      let scopeDecision = scope.decision;
      let reasonCode: string | undefined;

      if (scopeDecision === 'ALLOW' || scopeDecision === 'REQUIRE_APPROVAL') {
        const guard = await this.checkGuardrails(action, scope);
        if (guard.outcome === 'block') {
          scopeDecision = 'BLOCK';
          reasonCode = guard.reasonCode;
        } else if (guard.outcome === 'skip') {
          continue;
        }
      }

      applied = true;
      if (scopeDecision === 'BLOCK') {
        return {
          decision: 'BLOCK',
          reasonCode: reasonCode ?? 'SCOPE_BLOCK',
          matchedScope: scope.actionName,
          remediation: 'Change the action parameters or update the policy scope.',
        };
      }
      if (scopeDecision === 'REQUIRE_APPROVAL') finalDecision = 'REQUIRE_APPROVAL';
    }

    if (!applied) {
      return {
        decision: 'BLOCK',
        reasonCode: 'NO_APPLICABLE_SCOPE',
        remediation: 'No matching scope accepted this action.',
      };
    }

    return {
      decision: finalDecision,
      reasonCode: finalDecision === 'REQUIRE_APPROVAL' ? 'APPROVAL_REQUIRED' : 'ALLOWED',
    };
  }

  private findMatchingScopes(action: Action): PermissionScope[] {
    // Exact matches plus suffix wildcards such as 'mcp:*'.
    return this.policy.scopes.filter(
      (s) =>
        (s.actionName === action.actionName ||
          (s.actionName.endsWith('*') &&
            action.actionName.startsWith(s.actionName.slice(0, -1)))) &&
        (!s.roles || (action.roles ?? []).some((role) => s.roles!.includes(role))),
    );
  }

  /** Scopes that apply to an action; used for post-execution checks. */
  scopesFor(action: Action): PermissionScope[] {
    return this.findMatchingScopes(action);
  }

  private async checkGuardrails(
    action: Action,
    scope: PermissionScope,
  ): Promise<{ outcome: 'pass' | 'block' | 'skip'; reasonCode?: string }> {
    if (action.actionName === 'read_file' || action.actionName === 'write_file') {
      if (!this.isValidPath(action.parameters.path, scope.allowedPaths)) {
        return { outcome: 'block', reasonCode: 'GUARDRAIL_PATH' };
      }
    }

    if (action.actionName === 'run_command') {
      if (this.isBlockedCommand(action.parameters.command, scope.blockedCommandPatterns)) {
        return { outcome: 'block', reasonCode: 'GUARDRAIL_COMMAND' };
      }
    }

    if (scope.guard) {
      try {
        if (!(await scope.guard(action))) return { outcome: 'block', reasonCode: 'GUARD_FAILED' };
      } catch (e) {
        console.error('Policy guard error:', e);
        return { outcome: 'block', reasonCode: 'GUARD_ERROR' };
      }
    }

    // Legacy validator keeps its original "false skips this scope" behavior.
    // New policies should use `when` for applicability and `guard` for denial.
    if (scope.validator) {
      try {
        if (!(await scope.validator(action))) return { outcome: 'skip' };
      } catch (e) {
        console.error('Policy validator error:', e);
        return { outcome: 'block', reasonCode: 'VALIDATOR_ERROR' };
      }
    }

    return { outcome: 'pass' };
  }

  private isValidPath(inputPath: string | undefined, allowedPaths: string[] | undefined): boolean {
    return isPathWithin(inputPath, allowedPaths);
  }

  private isBlockedCommand(
    command: string | undefined,
    blockedPatterns: string[] | undefined,
  ): boolean {
    if (!blockedPatterns) return false; // No restrictions
    if (!command) return true;

    // Parse before matching. A parse failure fails closed: we cannot authorize
    // a command whose structure we do not understand.
    const parsed = parseCommand(command);
    if (!parsed.ok) return true;

    const normalized = parsed.argv.join(' ');
    for (const pattern of blockedPatterns) {
      if (this.getPattern(pattern).test(normalized)) return true;
    }
    return false;
  }

  private compilePattern(pattern: string): RegExp {
    const cached = this.patternCache.get(pattern);
    if (cached) return cached;

    let safe = false;
    try {
      safe = safeRegex(pattern);
    } catch {
      safe = false;
    }
    // safe-regex is a heuristic: it accepts ambiguous alternations such as
    // (a|a)*. Reject quantified groups containing alternation as well.
    const ambiguousQuantifier = /\([^)]*\|[^)]*\)[*+{]/;
    if (!safe || ambiguousQuantifier.test(pattern)) {
      throw new Error(`Unsafe blocked-command pattern rejected (potential ReDoS): ${pattern}`);
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      throw new Error(`Invalid blocked-command pattern: ${pattern}`);
    }
    this.patternCache.set(pattern, regex);
    return regex;
  }

  private getPattern(pattern: string): RegExp {
    return this.compilePattern(pattern);
  }
}
