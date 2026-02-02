import { Action, PermissionScope, Policy, PermissionDecision } from '../core/types';
import * as path from 'path';

export class PolicyEngine {
  private policy: Policy;

  constructor(policy: Policy) {
    this.policy = policy;
  }

  async evaluate(action: Action): Promise<PermissionDecision> {
    const matchingScopes = this.findMatchingScopes(action);

    if (matchingScopes.length === 0) {
      // Default deny if no scope matches
      return 'BLOCK';
    }

    // Priority: BLOCK > REQUIRE_APPROVAL > ALLOW
    // If any scope says BLOCK (after guardrails), final is BLOCK.
    // If any scope says REQUIRE_APPROVAL, final is REQUIRE_APPROVAL.
    // Otherwise, ALLOW.
    let finalDecision: PermissionDecision = 'ALLOW';

    for (const scope of matchingScopes) {
      let scopeDecision = scope.decision;

      // Check guardrails for ALLOW and REQUIRE_APPROVAL scopes
      if (scopeDecision === 'ALLOW' || scopeDecision === 'REQUIRE_APPROVAL') {
        const passed = await this.checkGuardrails(action, scope);
        if (!passed) {
          scopeDecision = 'BLOCK';
        }
      }

      // Apply priority
      if (scopeDecision === 'BLOCK') {
        return 'BLOCK'; // Highest priority, return immediately
      } else if (scopeDecision === 'REQUIRE_APPROVAL') {
        finalDecision = 'REQUIRE_APPROVAL';
      }
      // ALLOW is the lowest priority, already set as default
    }

    return finalDecision;
  }

  private findMatchingScopes(action: Action): PermissionScope[] {
    // Return all matching scopes, not just the first
    return this.policy.scopes.filter((s) => s.actionName === action.actionName);
  }

  private async checkGuardrails(action: Action, scope: PermissionScope): Promise<boolean> {
    // 1. Path Restrictions (with normalization)
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

  private isValidPath(inputPath: string | undefined, allowedPaths: string[] | undefined): boolean {
    if (!allowedPaths) return true; // No restrictions
    if (!inputPath) return false;

    // Normalize and resolve the input path to prevent traversal attacks
    const resolvedInput = path.resolve(path.normalize(inputPath));

    return allowedPaths.some((allowed) => {
      const resolvedAllowed = path.resolve(path.normalize(allowed));
      // Ensure the resolved path starts with the allowed directory
      // Add path.sep to prevent /tmp matching /tmpevil
      return resolvedInput.startsWith(resolvedAllowed) ||
        resolvedInput.startsWith(resolvedAllowed + path.sep);
    });
  }

  private isBlockedCommand(
    command: string | undefined,
    blockedPatterns: string[] | undefined,
  ): boolean {
    if (!blockedPatterns) return false; // No restrictions
    if (!command) return true; // Block empty command if patterns exist? Safe bet.

    // Normalize command to prevent simple shell evasion (backslashes, varied quoting)
    const normalized = this.normalizeCommand(command);

    for (const pattern of blockedPatterns) {
      const regex = new RegExp(pattern);
      if (regex.test(normalized)) {
        return true;
      }
    }
    return false;
  }

  private normalizeCommand(cmd: string): string {
    return cmd
      .replace(/\\/g, '') // Strip backslashes used for escaping
      .replace(/['"]/g, '') // Strip quotes
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }
}
