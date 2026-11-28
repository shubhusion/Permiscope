# 17. Segmented audit log and streaming verification

- Status: Proposed
- Date: 2026-11-28

## Context

`verifyChain()` reads the entire `audit.log` into memory and external `logrotate` breaks
the signed head. This is the main scalability limit. Any change must preserve the chain
contract in [ADR 5](./0005-audit-chain-design.md) and the two-phase writes in
[ADR 6](./0006-two-phase-audit.md).

## Decision (proposed)

Introduce an opt-in segmented layout:

```
logs/audit/
  manifest.json        # signed: active segment, last sequence/hash, keyId
  segment-000001.log   # JSONL entries with global sequence numbers
  segment-000001.head  # signed: first/last sequence, firstHash, lastHash
```

Each segment's `firstHash` anchors to the previous segment's `lastHash`, so the chain
remains continuous. Rotation happens under the existing lock at a configurable entry or
byte threshold, using write-to-temp plus atomic rename. Verification streams line by
line and validates the manifest, each segment head and every entry. The legacy
single-file layout stays readable; migration is an explicit CLI command, not automatic.

## Consequences

- Memory is bounded by segment size, not total log size.
- Rotation must be atomic or a crash could leave two active segments.
- Dashboard and CLI must aggregate counts across segments.
- Default switches to segmented only in a future major release.

## Alternatives

- **Keep one file and stream verification only** — useful first step, but does not bound
  file growth.
- **External logrotate only** — rejected: archives lose signed head continuity.
