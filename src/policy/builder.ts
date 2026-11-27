import { PermissionScope, Policy, Postcondition } from '../core/types';

export class ScopeBuilder {
  private scope: PermissionScope;

  constructor(
    actionName: string,
    private parent: PolicyBuilder,
  ) {
    this.scope = { actionName, decision: 'BLOCK' };
  }

  allow(): this {
    this.scope.decision = 'ALLOW';
    return this;
  }

  block(): this {
    this.scope.decision = 'BLOCK';
    return this;
  }

  requireApproval(): this {
    this.scope.decision = 'REQUIRE_APPROVAL';
    return this;
  }

  whenPath(paths: string[]): this {
    this.scope.allowedPaths = [...paths];
    return this;
  }

  whenCommand(patterns: string[]): this {
    this.scope.blockedCommandPatterns = [...patterns];
    return this;
  }

  withRoles(roles: string[]): this {
    this.scope.roles = [...roles];
    return this;
  }

  /** Skip this scope when the predicate is false. */
  when(predicate: PermissionScope['when']): this {
    this.scope.when = predicate;
    return this;
  }

  /** Deny the action when the predicate is false. */
  guard(predicate: PermissionScope['guard']): this {
    this.scope.guard = predicate;
    return this;
  }

  /** Legacy applicability predicate; prefer `when` for new policies. */
  withValidator(validator: PermissionScope['validator']): this {
    this.scope.validator = validator;
    return this;
  }

  withPostconditions(postconditions: Postcondition[]): this {
    this.scope.postconditions = [...postconditions];
    return this;
  }

  done(): PolicyBuilder {
    return this.parent.add(this.scope);
  }
}

export class PolicyBuilder {
  private scopes: PermissionScope[] = [];

  scope(actionName: string): ScopeBuilder {
    return new ScopeBuilder(actionName, this);
  }

  add(scope: PermissionScope): this {
    this.scopes.push(scope);
    return this;
  }

  build(): Policy {
    return { scopes: this.scopes.map((scope) => ({ ...scope })) };
  }
}

/** Start a composable policy. The result is a plain Policy, so legacy code is unchanged. */
export function definePolicy(): PolicyBuilder {
  return new PolicyBuilder();
}
