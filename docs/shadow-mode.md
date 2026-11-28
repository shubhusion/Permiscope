# Shadow Mode

Shadow Mode allows testing untrusted agents without real-world side effects.

## Overview

When enabled, blocked actions appear successful to the agent while no actual execution occurs.

## Why Shadow Mode Exists

| Problem | Solution |
|---------|----------|
| Testing new agents is risky | Shadow simulates success without damage |
| Understanding agent behavior | Observe what actions it attempts |
| Gradual trust building | Validate before enabling real access |

## How It Works

When a policy returns `BLOCK` and the gateway was configured with `shadowMode: true`, the
decision becomes `SHADOW_BLOCK`: the caller receives `success: true` with output
`[SHADOW] Action appeared successful.`, and no executor runs. With shadow mode off the
same action returns `success: false` with a `BLOCK` decision. Both outcomes are written to
the audit chain as INTENT and RESULT records — see the
[governed call sequence](./assets/governed-call.svg) for the full path.

## Enabling Shadow Mode

```typescript
import { PermiscopeAdapter } from 'permiscope';

const permiscope = new PermiscopeAdapter({
  defaultAgentId: 'untrusted-agent',
  shadowMode: true
});

// The caller thinks this worked, but nothing happened.
// act() resolves to the output value; a blocked action returns the shadow string.
const output = await permiscope.act('run_command', { command: 'rm -rf /' });
// output === '[SHADOW] Action appeared successful.'
```

Alternatively, for quick demos:

```typescript
import { createAgent } from 'permiscope';

const agent = createAgent({ shadowMode: true });
```

## Decision Types in Shadow Mode

| Normal Decision | Shadow Result |
|-----------------|---------------|
| `ALLOW` | Normal execution |
| `BLOCK` | Fake success, `SHADOW_BLOCK` logged |
| `REQUIRE_APPROVAL` | Normal approval flow |

## Audit Logging

Shadow actions are logged with the `SHADOW_BLOCK` decision. Execution output is redacted
by default; hosts can opt in via `AuditLoggerOptions.allowedOutputKeys`:

```json
{
  "decision": "SHADOW_BLOCK",
  "action": { "actionName": "run_command", "parameters": {"command": "rm -rf /"} },
  "result": { "success": true, "output": "[redacted]" }
}
```

## When to Use

| Scenario | Shadow Mode |
|----------|-------------|
| New agent first deployment | ✅ Enable |
| Testing policy changes | ✅ Enable |
| Production trusted agent | ❌ Disable |
| Compliance environment | ❌ Disable |

## Risks

> [!WARNING]
> Shadow Mode can mask agent misbehavior.

- Agent may rely on fake success and continue bad patterns
- No feedback loop — agent doesn't learn restrictions
- Should only be used for observation, not long-term

## Best Practices

1. **Short observation period** — Days, not weeks
2. **Review audit logs** — Check for blocked patterns
3. **Transition gradually** — Move to `REQUIRE_APPROVAL` next
4. **Never use in production** without understanding implications
