# Security Model

This document describes Permiscope's security guarantees, threat model, and limitations.

## Overview

Permiscope is a **mediation layer**, not a sandbox. It intercepts and controls actions at the API level but does not provide process isolation.

## What is Protected

| Threat | Mitigation |
|--------|------------|
| **Accidental damage** | Policy enforcement blocks dangerous patterns |
| **Privilege escalation** | Least-privilege scopes limit agent capabilities |
| **Unapproved sensitive actions** | Human-in-the-loop approval workflow |
| **Audit tampering** | HMAC-SHA256 signed hash chain |
| **Approval flooding** | TTL-based expiration, file locking |
| **ReDoS attacks** | `safe-regex` validation of patterns |
| **Path traversal** | Normalized path comparison |
| **Dashboard CSRF** | CORS restricted to localhost |
| **Unauthorized approvals** | Token-based authentication |

## What is NOT Protected

> [!CAUTION]
> Permiscope is not a security sandbox.

| Threat | Status |
|--------|--------|
| **Direct `fs` import** | ❌ Not blocked. Agent code must use Permiscope APIs. |
| **Native module execution** | ❌ Not controlled. |
| **Memory exploits** | ❌ Not applicable (TypeScript layer). |
| **Process spawning outside gateway** | ❌ Not intercepted. |

## Threat Model

### Cooperative Agent (Default)
- Agent uses Permiscope APIs correctly
- Agent may have bugs causing unintended actions
- Permiscope prevents accidents

### Semi-Adversarial Agent
- Agent tries to bypass restrictions via creative parameters
- Permiscope normalizes inputs and applies guardrails
- Edge cases may exist

### Fully Adversarial Agent
- Agent imports `fs` directly or spawns processes
- **Permiscope cannot protect against this**
- Use OS-level sandboxing (e.g., containers, gVisor)

## Fail-Closed Behaviors

Permiscope defaults to **fail-closed** (deny on error):

| Scenario | Behavior |
|----------|----------|
| Unknown action type | `BLOCK` |
| Validator throws error | `BLOCK` |
| Audit log write fails (strict mode) | Action blocked |
| Lock acquisition fails | Operation retried or fails |
| Regex pattern unsafe | Pattern skipped (warning logged) |

## Audit Guarantees

| Property | How |
|----------|-----|
| **Integrity** | SHA-256 hash chain links entries |
| **Authenticity** | HMAC-SHA256 signature (when secret set) |
| **Tamper Detection** | `verifyChain()` method |
| **Atomicity** | File locking via `proper-lockfile` |

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `PERMISCOPE_AUDIT_SECRET` | HMAC signing key | Yes (production) |
| `PERMISCOPE_DASHBOARD_TOKEN` | Dashboard API auth | Yes (production) |
| `PERMISCOPE_STRICT_LOGGING` | Block on log failure | Recommended |

## Best Practices

1. **Set all environment variables** in production
2. **Run in containers** for isolation
3. **Monitor audit logs** for anomalies
4. **Review policies** regularly
5. **Use REQUIRE_APPROVAL** for destructive actions
6. **Test with shadow mode** before enabling agents
