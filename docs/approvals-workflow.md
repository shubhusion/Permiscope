# Approvals Workflow

Permiscope supports human-in-the-loop approval for sensitive actions.

## Overview

When a policy scope specifies `REQUIRE_APPROVAL`, the action is paused until a human approves or rejects it.

## Approval Lifecycle

![Approval lifecycle](./assets/approval-lifecycle.svg)

A cached approval can skip the wait once: it is consumed by the governed action it
authorized. Both rejection and expiry (or a gateway timeout with no TTY) end in a
fail-closed `BLOCK`. Pending requests expire too, so stale queue entries cannot be
approved later.

## Approval Request Structure

```typescript
interface ApprovalRequest {
  id: string;              // Unique key (base64 encoded)
  agentId: string;
  actionName: string;
  params: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;       // ISO format
  expiresAt?: string;      // TTL expiration
}
```

## Approval Key Generation

Keys are deterministic and based on:
- **Authenticated principal ID** — provided by the host via `principalProvider`, never the caller-controlled `agentId` on the action
- Action name
- Parameters (using `fast-json-stable-stringify`)

This ensures the same action from the same principal produces the same key. A caller
claiming another agent's ID cannot reuse that principal's approval.

## CLI Polling

When running in CLI mode, Permiscope polls the approval cache:

```
🔔 [agent-001] wants to run_command: {"command":"rm -rf /tmp/*"}
Do you approve this action? (y/n)

[Polling for approval... Check dashboard at http://localhost:3000]
```

The CLI waits for:
1. Direct console input (`y`/`n`) when stdin is a TTY
2. Dashboard approval (polled every 500 ms by default)

If stdin is not a TTY, no prompt is opened. The gateway waits only until
`approvalTimeoutMs` (30 s by default) and then **fails closed**. `gateway.close()`
cancels any in-flight wait immediately. An injected `approver` callback replaces both
the prompt and the polling path.

## Dashboard Approval

The web dashboard allows managing approvals remotely:

1. Navigate to `http://localhost:3000`
2. View pending approvals
3. Click Approve or Reject
4. Action proceeds immediately

## Cache Behavior

| Behavior | Description |
|----------|-------------|
| **Auto-expiration** | Pending requests, approvals and rejections all expire after TTL (default: 1 hour) |
| **Reuse** | Approvals are single-use: one grant authorizes one governed action ([ADR-0022](./adr/0022-single-use-approvals.md)) |
| **No pre-approval** | `approve()` only works on an existing `PENDING` request |
| **Revocation** | Dashboard can revoke approvals |
| **Corrupt cache** | Parsed as empty (fail closed), never treated as allow-all |
| **Persistence** | Saved to `data/approvals.json` |

## TTL Configuration

```typescript
const cache = new ApprovalCache('./data', 30 * 60 * 1000); // 30 min
```

## Concurrency Safety

- File locking via `proper-lockfile`
- One lock is held across the entire read-modify-write operation, not separately
  around load and save
- Prevents lost updates between CLI and Dashboard

## Best Practices

1. **Use short TTLs** for sensitive actions
2. **Require re-approval** for destructive operations
3. **Monitor pending approvals** in Dashboard
4. **Set DASHBOARD_TOKEN** to prevent unauthorized approvals
