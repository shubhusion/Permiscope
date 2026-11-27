# Policy Engine

The PolicyEngine evaluates actions against defined policies and returns a decision.

## Overview

```typescript
const engine = new PolicyEngine(policy);
const decision = await engine.evaluate(action);
// Returns: 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL'
```

## Rule Evaluation Order

1. **Find matching scopes** — All scopes with matching `actionName`
2. **Check guardrails** — For each scope, validate path/command/validator
3. **Apply priority** — `BLOCK > REQUIRE_APPROVAL > ALLOW`
4. **Return decision**

```
Multiple scopes match → Most restrictive wins
No scopes match → BLOCK (default deny)
```

## Priority Rules

| Scenario | Result |
|----------|--------|
| Any scope → BLOCK | `BLOCK` |
| Any scope → REQUIRE_APPROVAL, none BLOCK | `REQUIRE_APPROVAL` |
| All scopes → ALLOW | `ALLOW` |
| No scopes match | `BLOCK` |

## Guardrails

### Path Restrictions

```typescript
{
  actionName: 'write_file',
  decision: 'ALLOW',
  allowedPaths: ['/tmp', './logs']
}
```

- Roots are mandatory: an `ALLOW` or `REQUIRE_APPROVAL` scope with no `allowedPaths`
  fails closed. The default policy grants reads only under the workspace and temp dir.
- Both the target and each root are resolved with `fs.realpathSync`; for a write to a
  new file, the nearest existing parent is resolved. Symlink escapes are therefore
  rejected.
- Traversal (`../`) and prefix-sibling directories (`/tmp` vs `/tmp-evil`) are rejected
  via `path.relative` containment, not string prefixes.
- Comparison is case-insensitive **only on Windows**; lowercasing on POSIX would widen
  access on a case-sensitive filesystem.
- Residual risk: resolving and writing are separate operations, so an attacker who can
  replace a path between the check and the write (TOCTOU) can still escape. Use
  OS-level isolation for adversarial environments.

### Command Patterns

```typescript
{
  actionName: 'run_command',
  decision: 'ALLOW',
  blockedCommandPatterns: ['rm -rf', 'sudo', 'shutdown']
}
```

- Patterns are **regex strings**, compiled once per policy and matched
  case-insensitively against the parsed argument list joined with spaces.
- Commands are **parsed with `shell-quote`**, not mutated:
  - Shell operators (`&&`, `|`, `>`, `$(`, comments) cause a **BLOCK** — they are
    rejected rather than stripped.
  - Nested shells (`sh -c`, `cmd /c`, PowerShell `-Command`) cause a **BLOCK**.
  - Quoted words become single arguments; repeated whitespace is collapsed naturally.
- Parsing failures fail closed: a command we cannot understand is blocked.
- Allowed commands are executed via `spawn()` with an **argv array and no shell**, with
  a timeout and output limit. `shell-quote` quoting is POSIX-only; on Windows the
  gateway uses argv directly and emulates the `echo` builtin.
- **ReDoS protection**: unsafe or invalid regex patterns are rejected when the
  `PolicyEngine` is constructed, so a block rule can never silently be skipped.

### Dynamic predicates: `when` and `guard`

```typescript
{
  actionName: 'read_file',
  decision: 'REQUIRE_APPROVAL',
  when: (action) => String(action.parameters.path || '').includes('.env'),
  guard: (action) => !String(action.parameters.path || '').includes('secrets'),
}
```

- `when` determines **applicability**: `false` skips the scope so later scopes can match.
- `guard` is a **hard deny**: `false` blocks the action even if another scope allows it.
- A throw in either predicate blocks (fail-closed, reason `WHEN_ERROR`/`GUARD_ERROR`).
- Both support `async` functions.

`validator` is the legacy applicability predicate. It keeps its historical "false skips
this scope" behavior for compatibility, but it is easy to misuse as a deny check. New
policies should use `when` for applicability and `guard` for denial — see
[migration.md](./migration.md).

## Example: Multi-Scope Policy

```typescript
const policy = {
  scopes: [
    // Sensitive files require approval
    {
      actionName: 'read_file',
      decision: 'REQUIRE_APPROVAL',
      validator: (a) => a.parameters.path?.includes('.env')
    },
    // General read allowed
    {
      actionName: 'read_file',
      decision: 'ALLOW'
    },
    // Block dangerous commands
    {
      actionName: 'run_command',
      decision: 'ALLOW',
      blockedCommandPatterns: ['rm -rf', 'format']
    }
  ]
};
```

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Regex matches substring | Use `\b` word boundaries |
| Order doesn't matter | Priority is by decision type, not position |
| Validator returns string | Must return boolean |
| Path without trailing slash | Both `/tmp` and `/tmp/` work |

## Decision reasons

`evaluate()` still returns the bare decision for backwards compatibility. Use
`evaluateDetailed()` when the agent needs to know why it was denied:

```typescript
const result = await engine.evaluateDetailed(action);
// { decision: 'BLOCK', reasonCode: 'GUARDRAIL_PATH', matchedScope: 'read_file', remediation: '...' }
```

Reason codes: `ALLOWED`, `APPROVAL_REQUIRED`, `NO_MATCHING_SCOPE`,
`NO_APPLICABLE_SCOPE`, `GUARDRAIL_PATH`, `GUARDRAIL_COMMAND`, `VALIDATOR_ERROR`,
`SCOPE_BLOCK`, `APPROVAL_GRANTED`, `APPROVAL_NOT_GRANTED`.

`ExecutionGateway.run()` exposes `reasonCode`, `matchedScope` and `remediation` on its
result, and `PermiscopeAdapter` includes the reason in thrown errors.

## Composable policy builder

Policies can still be plain objects. For larger policies, `definePolicy()` provides a
typed builder that produces the same shape:

```typescript
import { definePolicy } from 'permiscope';

const policy = definePolicy()
  .scope('read_file')
    .allow()
    .whenPath(['/tmp'])
    .withRoles(['analyst'])
  .done()
  .scope('mcp:*')
    .requireApproval()
    .withValidator((action) => action.parameters.toolName !== 'delete_all')
  .done()
  .build();
```

`build()` returns a plain `Policy`, so `PolicyEngine`, `PermiscopeAdapter` and the
sidecar accept it without changes. The builder copies scope data; mutating the builder
after `build()` does not change the returned policy.

## Post-conditions

A scope can declare checks that run **after** the executor finishes. They verify that
the action stayed inside the approved scope, not just that the pre-execution guardrails
passed:

```typescript
import { isPathWithin } from 'permiscope';

{
  actionName: 'write_file',
  decision: 'ALLOW',
  allowedPaths: ['/tmp'],
  postconditions: [
    {
      description: 'target must remain inside /tmp',
      check: (action) => isPathWithin(action.parameters.path, ['/tmp']),
    },
  ],
}
```

A failed or throwing post-condition makes the result unsuccessful with reason code
`POSTCONDITION_FAILED` and writes that outcome to the audit chain. Post-conditions are
additive; existing policies without them behave exactly as before.

## Budgets

An `ExecutionGateway` can be created with a `budget` or a shared `BudgetTracker`:

```typescript
const gateway = new ExecutionGateway(engine, executors, {
  budget: { maxCalls: 100, maxSpend: 10, costPerCall: 0.5, windowMs: 3_600_000 },
});
```

Budgets are keyed by the authenticated principal and reset after `windowMs`. When a
limit is reached, `run()` returns `BUDGET_EXCEEDED` without executing the action and
without consuming further budget. Successful results include `budgetRemaining`.

Budgets are in-process and single-machine; use an external limiter for distributed
deployments.

## Debugging

Enable logging to see evaluation:

```typescript
// In PolicyEngine, errors are logged to console
// Check for: "Policy validator error:" messages
```
