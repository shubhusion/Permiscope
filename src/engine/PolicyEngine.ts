import {
  Action,
  PermissionScope,
  Policy,
  PermissionDecision,
  DecisionExplanation,
} from '../core/types';
import * as path from 'path';
import * as fs from 'fs';
import safeRegex from 'safe-regex';
import { parseCommand } from './commandPolicy';

export class PolicyEngine {
  private policy: Policy;
  private patternCache = new Map<string, RegExp | null>();

  constructor(policy: Policy) {
    this.policy = policy;
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
        s.actionName === action.actionName ||
        (s.actionName.endsWith('*') && action.actionName.startsWith(s.actionName.slice(0, -1))),
    );
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
    // Fail closed: "no roots configured" must never mean "any path".
    if (!allowedPaths || allowedPaths.length === 0) return false;
    if (!inputPath) return false;

    const target = this.resolveForCheck(inputPath);
    if (!target) return false;

    return allowedPaths.some((allowed) => {
      // A configured root must exist. Widening a missing root to its nearest
      // existing ancestor would silently expand e.g. C:\tmp to C:\.
      const root = this.resolveRoot(allowed);
      if (!root) return false;

      const relative = path.relative(
        this.normalizeForComparison(root),
        this.normalizeForComparison(target),
      );
      return (
        relative === '' ||
        (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
      );
    });
  }

  private resolveRoot(input: string): string | null {
    try {
      return fs.realpathSync(path.resolve(input));
    } catch {
      return null;
    }
  }

  private normalizeForComparison(value: string): string {
    // Windows paths are case-insensitive; POSIX paths are not. Lowercasing on
    // POSIX would *widen* access by treating /TMP as /tmp.
    return process.platform === 'win32' ? value.toLowerCase() : value;
  }

  /**
   * Resolve traversal and symlinks before comparison. A write target often does
   * not exist yet, so resolve its nearest existing parent instead — otherwise a
   * symlinked parent could escape the allowed root unnoticed.
   */
  private resolveForCheck(input: string): string | null {
    try {
      let candidate = path.resolve(input);
      while (!fs.existsSync(candidate)) {
        const parent = path.dirname(candidate);
        if (parent === candidate) return null;
        candidate = parent;
      }
      return fs.realpathSync(candidate);
    } catch {
      return null;
    }
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
      const regex = this.getPattern(pattern);
      if (regex && regex.test(normalized)) return true;
    }
    return false;
  }

  private getPattern(pattern: string): RegExp | null {
    if (this.patternCache.has(pattern)) return this.patternCache.get(pattern) ?? null;

    // Compile once per policy instead of on every evaluation.
    if (!safeRegex(pattern)) {
      console.warn(`⚠️  Skipping unsafe regex pattern (potential ReDoS): ${pattern}`);
      this.patternCache.set(pattern, null);
      return null;
    }

    const regex = new RegExp(pattern, 'i');
    this.patternCache.set(pattern, regex);
    return regex;
  }
}
