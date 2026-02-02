import { Action, PermissionScope, Policy, PermissionDecision } from '../core/types';

export class PolicyEngine {
  private policy: Policy;

  constructor(policy: Policy) {
    this.policy = policy;
  }

  async evaluate(action: Action): Promise<PermissionDecision> {
    const scope = this.findMatchingScope(action);

    if (!scope) {
      // Default deny if no scope matches
      return 'BLOCK';
    }

    // Check specific guardrails
    if (scope.decision === 'ALLOW') {
      const passed = await this.checkGuardrails(action, scope);
      if (!passed) {
        return 'BLOCK';
      }
    }

    return scope.decision;
  }

  private findMatchingScope(action: Action): PermissionScope | undefined {
    // Find specific scope for action, default to wildcard if we had one (not for now)
    return this.policy.scopes.find((s) => s.actionName === action.actionName);
  }

  private async checkGuardrails(action: Action, scope: PermissionScope): Promise<boolean> {
    // 1. Path Restrictions
    if (action.actionName === 'read_file' || action.actionName === 'write_file') {
      if (!this.isValidPath(action.parameters.path, scope.allowedPaths)) {
        return false;
      }
    }

    // 2. Command Restrictions
    if (action.actionName === 'run_command') {
      if (this.isBlockedCommand(action.parameters.command, scope.blockedCommandPatterns)) {
        return false;
      }
    }

    // 3. Dynamic Validator (Policy-as-Code)
    if (scope.validator) {
      try {
        const isValid = await scope.validator(action);
        if (!isValid) return false;
      } catch (e) {
        console.error('Policy validator error:', e);
        return false; // Fail safe
      }
    }

    return true;
  }

  private isValidPath(path: string | undefined, allowedPaths: string[] | undefined): boolean {
    if (!allowedPaths) return true; // No restrictions
    if (!path) return false;
    return allowedPaths.some((allowed) => path.startsWith(allowed));
  }

  private isBlockedCommand(
    command: string | undefined,
    blockedPatterns: string[] | undefined,
  ): boolean {
    if (!blockedPatterns) return false; // No restrictions
    if (!command) return true; // Block empty command if patterns exist? Safe bet.
    for (const pattern of blockedPatterns) {
      const regex = new RegExp(pattern);
      if (regex.test(command)) {
        return true;
      }
    }
    return false;
  }
}
