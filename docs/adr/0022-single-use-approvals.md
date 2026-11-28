# 22. Single-use approvals with pending expiry

- Status: Accepted
- Date: 2026-11-28

## Context

ADR-0008 defined identity-bound approvals with a one-hour TTL and stated that identical
actions by the same principal reuse an approval. In practice that made a single human
decision valid for up to 1,000 identical calls, and pending requests had no expiry at
all, so an old queue entry could be approved long after the agent had moved on.

## Decision

- Every request, including `PENDING`, receives an `expiresAt` timestamp based on the
  configured TTL. `getAll`, `approve`, `updateStatus` and the decision checks treat an
  expired record as absent and delete it.
- A new request for an expired key replaces it instead of reusing it.
- Approvals are **single-use**: the gateway calls `consumeApproval` after a granted
  decision, removing the record. Dry runs do not consume because they do not execute.
- `approve` and dashboard `updateStatus` only transition `PENDING` records. They refuse
  expired or already-decided records.
- `isApproved` remains a pure read; consumption is an explicit operation so polling and
  decision logic do not accidentally spend a human's approval twice.

## Consequences

- A human approves one governed action, not an hour of arbitrary replays. Repeated
  identical actions need repeated approvals; this is deliberate.
- Pending queues self-clean, so the dashboard no longer shows stale requests.
- Callers that relied on reuse must request approval again. `docs/migration.md` records
  the change.
- The approval file remains single-machine and file-backed, as in ADR-0008.
- Cooperative governance boundary is unchanged (ADR-0001).

## Alternatives

- **Keep reusable approvals but shorten the TTL** — rejected: the problem is replay
  count, not just duration.
- **Consume inside `isApproved`** — rejected: dry runs and polling would spend the
  approval without executing the action.
- **Never expire pending requests** — rejected: stale consent is a security debt and
  ADR-0008 already rejected permanent approvals.
