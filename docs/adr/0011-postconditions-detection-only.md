# 11. Postconditions detect; they do not undo

- Status: Accepted
- Date: 2026-11-28

## Context

A failing postcondition set `success = false`, which could be read as "the action was
prevented". In reality the executor had already run and its side effects were committed.

## Decision

`GatewayResult.sideEffects` reports `'committed'` whenever the executor ran, including
when a postcondition fails. A postcondition may provide an optional `compensate` hook; when
it succeeds the result includes `compensated: true`. Documentation states that detection,
not prevention, is guaranteed.

## Consequences

- Callers cannot mistake a failed postcondition for an unexecuted action.
- Compensation is best effort and may itself fail; that is reported in the error.
- Executors should be idempotent or externally reversible when postconditions matter.

## Alternatives

- **Transactional rollback** — rejected: most executors (shell, HTTP) cannot participate.
- **Run postconditions before execution** — rejected: they inspect the actual output.
