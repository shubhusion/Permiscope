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
- **ReDoS protection**: unsafe regex patterns are skipped with a warning.

### Dynamic Validators

```typescript
{
  actionName: 'read_file',
  decision: 'REQUIRE_APPROVAL',
  validator: (action) => {
    const path = action.parameters.path || '';
    return path.includes('.env');
  }
}
```

- Return `true` if scope applies
- Return `false` to skip this scope
- Throw → `BLOCK` (fail-closed)
- Supports `async` validators

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

## Debugging

Enable logging to see evaluation:

```typescript
// In PolicyEngine, errors are logged to console
// Check for: "Policy validator error:" messages
```
