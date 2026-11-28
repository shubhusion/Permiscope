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
- The gateway re-resolves the path immediately before I/O and opens the canonical
  path, closing the evaluation-to-open TOCTOU gap. A malicious final symlink is refused.
- Residual risk: a swap of the already-canonical path after resolution, or a hostile
  filesystem that lies about `realpath`, is outside the library's control. Use OS-level
  isolation for adversarial environments.

### Command Allowlist

```typescript
{
  actionName: 'run_command',
  decision: 'ALLOW',
  allowedCommands: ['git status', 'git diff', 'npm test']
}
```

- `allowedCommands` is a list of **prefixes**, not a list of executables. Each entry is
  parsed with the same `shell-quote` parser used for actions; invalid entries reject the
  policy at construction.
- The parsed action argv must start with one entry. The first token is compared by
  executable basename, lowercased and without a Windows launcher extension; later tokens
  are compared lowercased. `git status` allows `git status --short`, but not `git push` or
  `git -c core.pager=cat status`.
- An explicitly empty list denies every command. `undefined` leaves the executable
  unrestricted for backwards compatibility; the default policy defines a list.
- The allowlist is evaluated **before** `blockedCommandPatterns`. A command outside the
  list is blocked with `GUARDRAIL_COMMAND_NOT_ALLOWED`; an unparseable command is blocked
  with `GUARDRAIL_COMMAND`.
- The default policy allows only `echo`, `pwd`, `git status`, `git diff`, `git log`,
  `git show`, `git rev-parse` and `npm test`, and adds block patterns for `git --output`,
  `git --no-index`, `git --ext-diff` and npm options that target another prefix,
  workspace, registry, config or script shell. See
  [ADR-0019](./adr/0019-default-command-allowlist.md).

### Command Block Patterns

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
  - Nested shells (`sh -c`, `cmd /c`, PowerShell `-Command`) cause a **BLOCK**;
    the flag comparison is case-insensitive.
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
`NO_APPLICABLE_SCOPE`, `GUARDRAIL_PATH`, `GUARDRAIL_COMMAND`,
`GUARDRAIL_COMMAND_NOT_ALLOWED`, `VALIDATOR_ERROR`, `SCOPE_BLOCK`, `APPROVAL_GRANTED`,
`APPROVAL_NOT_GRANTED`.

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
`POSTCONDITION_FAILED` and writes that outcome to the audit chain. **Detection is the
guarantee, not prevention:** the executor has already run, and every `GatewayResult`
reports `sideEffects: 'committed'` for such actions. A post-condition can supply an
optional `compensate(action, output)` hook for best-effort rollback; when it succeeds
the result includes `compensated: true`. Rollback is not guaranteed — design executors
to be idempotent or externally reversible.

Post-conditions are additive; existing policies without them behave exactly as before.

## Budgets

An `ExecutionGateway` can be created with a `budget` or a shared `BudgetTracker`:

```typescript
const gateway = new ExecutionGateway(engine, executors, {
  budget: { maxCalls: 100, maxSpend: 10, costPerCall: 0.5, windowMs: 3_600_000 },
});
```

Budgets are keyed by the authenticated principal and reset after `windowMs`. Ordering
is deliberate:

1. `noteAttempt()` records every governable call, including policy-blocked ones.
2. `check()` is a non-mutating preflight — a blocked call does **not** burn an execution.
3. `consumeExecution()` atomically reserves a call immediately before the side effect.
   A concurrent caller can therefore still trigger `BUDGET_EXCEEDED` at this point.

Results include `budgetRemaining`. `BudgetTracker` also exposes `snapshotFor()` with
separate `attempts` and `executed` counters.

By default budgets are in-process. For multiple sidecar processes on one machine, pass a
`FileBudgetStore` (from `permiscope`) as the tracker's second constructor argument, or
`budgetStore` to `createSidecar`. It uses `proper-lockfile` for atomic `compareAndSet` and
fails closed if the file is corrupt.

For machines in different hosts, supply your own `BudgetStore` with an atomic
`compareAndSet` per principal (for example Redis WATCH/MULTI or a versioned database
row). All trackers sharing a store share the budget.

## Debugging

Enable logging to see evaluation:

```typescript
// In PolicyEngine, errors are logged to console
// Check for: "Policy validator error:" messages
```
