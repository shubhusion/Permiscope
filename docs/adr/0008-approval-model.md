# 8. Identity-bound, TTL'd approvals with fail-closed timeout

- Status: Accepted
- Date: 2026-11-28

## Context

Approvals must survive process restarts, expire, and resist an agent claiming another
principal's identity. A service has no TTY, so an interactive prompt cannot be the only
path to a decision.

## Decision

Approval keys are a stable hash of authenticated principal, action name and parameters.
Records live in a locked JSON file with a one-hour TTL. The gateway checks the cache,
accepts a host-supplied approver or polls for a dashboard decision, and fails closed on
timeout or rejection. The dashboard API requires its own bearer token.

## Consequences

- Identical actions by the same principal reuse approvals; different principals do not.
- A corrupt cache resets to empty rather than allowing all actions.
- Approvals are single-machine; distributed storage and role-based approvals are open.

## Alternatives

- **Permanent approvals** — rejected: stale consent is a security debt.
- **TTY prompt only** — rejected: services and sidecars have no interactive terminal.
