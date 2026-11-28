# 6. INTENT before execution, RESULT after

- Status: Accepted
- Date: 2026-11-28

## Context

Strict logging was advertised as blocking actions when the audit write failed, but the
gateway executed the action first and logged afterwards. The error claimed "Action
blocked" after a side effect had already been committed.

## Decision

Write a signed `INTENT` record containing the decision and an `intentHash` before any side
effect and gate execution on its success. Append a `RESULT` record with the same hash
afterwards. Error messages are phase-aware: an INTENT failure blocks; a RESULT failure
reports that the action already ran. The dashboard hides internal INTENT markers.

## Consequences

- Two audit records per governed action; slightly higher write cost.
- Strict mode now genuinely prevents side effects on INTENT failure.
- Consumers that count log lines must filter on `phase === 'RESULT'`.

## Alternatives

- **Single record after execution** — rejected: strict logging could not block.
- **Log only on success** — rejected: blocks and failures must be auditable too.
