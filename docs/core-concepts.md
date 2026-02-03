# Core Concepts

This document explains the fundamental concepts in Permiscope.

## Actions

An **Action** is a request from an agent to perform a real-world operation.

```typescript
interface Action {
  actionName: string;      // e.g., 'read_file', 'run_command'
  parameters: Record<string, any>;
  agentId: string;
  reason?: string;
  timestamp: Date;
}
```

### Built-in Action Types
- `read_file` — Read file contents
- `write_file` — Write to a file
- `run_command` — Execute a shell command
- `call_api` — Make an HTTP request (via custom executor)

## Policies

A **Policy** defines rules for how actions are handled.

```typescript
interface Policy {
  scopes: PermissionScope[];
}
```

## Scopes

A **PermissionScope** is a rule that matches specific actions and defines their treatment.

```typescript
interface PermissionScope {
  actionName: string;
  decision: 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
  allowedPaths?: string[];           // For file operations
  blockedCommandPatterns?: string[]; // Regex patterns
  validator?: (action) => boolean;   // Dynamic validation
}
```

### Decision Types

| Decision | Behavior |
|----------|----------|
| `ALLOW` | Action proceeds immediately |
| `BLOCK` | Action is rejected, error returned |
| `REQUIRE_APPROVAL` | Pauses for human approval |
| `SHADOW_BLOCK` | Action blocked but agent sees success (testing mode) |

## Guardrails

Guardrails are additional restrictions applied after scope matching:

1. **Path Restrictions** — Limit file operations to specific directories
2. **Command Patterns** — Block commands matching regex patterns
3. **Dynamic Validators** — Custom TypeScript functions for complex logic

## Approvals

When a scope has `REQUIRE_APPROVAL`, the action enters the approval workflow:

1. Request is registered in ApprovalCache
2. Human is prompted (CLI or Dashboard)
3. Upon approval, action proceeds
4. Approval is cached with TTL (default: 1 hour)

## Dry-Run Mode

Execute actions without side effects:

```typescript
const result = await gateway.run(action, true); // dryRun = true
```

- Policy is evaluated
- Approvals are checked
- **Execution is skipped**
- Decision is returned

## Shadow Mode

Test untrusted agents safely:

```typescript
const agent = createAgent({ shadowMode: true });
```

- Blocked actions appear successful to the agent
- Decision is `SHADOW_BLOCK`
- No actual execution occurs
- Useful for observing agent behavior

## Audit Trail

Every action is logged with:
- Timestamp
- Agent ID
- Action details
- Decision
- Result
- Hash chain link
- HMAC signature (if configured)
