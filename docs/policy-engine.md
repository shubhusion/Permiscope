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

- Paths are **normalized** using `path.resolve` and `path.normalize`
- Comparison is **case-insensitive** (Windows compatible)
- Prevents traversal attacks (`../` is resolved)

### Command Patterns

```typescript
{
  actionName: 'run_command',
  decision: 'ALLOW',
  blockedCommandPatterns: ['rm -rf', 'sudo', 'shutdown']
}
```

- Patterns are **regex strings**
- Commands are **normalized** before matching:
  - Backslashes stripped
  - Quotes removed
  - Command substitution (`$()`, backticks) stripped
  - Multiple spaces collapsed
- **ReDoS protection**: Unsafe patterns are skipped

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
