# 12. Budget attempts vs executions, atomic reservation

- Status: Accepted
- Date: 2026-11-28

## Context

`consume()` ran before policy and approvals, so blocked calls burned budget. Each sidecar
kept its own in-memory counters, so N processes meant N budgets.

## Decision

Record an `attempt` for every governable call, run a non-mutating `check()` preflight, and
reserve an `execution` with an atomic `consumeExecution()` immediately before the side
effect. `BudgetStore.compareAndSet` allows shared implementations; `FileBudgetStore` is
the bundled same-machine backend. Corrupt shared state fails closed.

## Consequences

- A policy-blocked call does not consume an execution.
- Concurrent callers cannot exceed the cap; a reservation can still fail after INTENT.
- Cross-host deployments must supply their own atomic store.

## Alternatives

- **Count every call against the cap** — rejected: blocked calls should not be punished.
- **In-process counters only** — rejected: multiple sidecars bypass the limit.
