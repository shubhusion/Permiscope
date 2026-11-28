# Architecture decision records

Canonical records of decisions that shape Permiscope. Each ADR records the context, the
decision, its consequences and the alternatives that were rejected. They are the source of
truth for *why* the code looks the way it does; `docs/architecture-post.md` is a short
narrative summary and `CHANGELOG.md` records *what* shipped.

When working on a change, identify the relevant ADR and mention it in your response and PR
description. If a material decision has no ADR, add one in the same PR. See
[`AGENTS.md`](../../AGENTS.md).

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-cooperative-governance-boundary.md) | Cooperative governance, not a sandbox | Accepted |
| [0002](./0002-ast-command-tokenization.md) | AST command tokenization, no shell string | Accepted |
| [0003](./0003-fail-closed-path-containment.md) | Fail-closed path containment and TOCTOU | Accepted |
| [0004](./0004-host-provided-identity.md) | Identity from the host, not the caller | Accepted |
| [0005](./0005-audit-chain-design.md) | Unkeyed links, keyed signatures, signed head | Accepted |
| [0006](./0006-two-phase-audit.md) | INTENT before execution, RESULT after | Accepted |
| [0007](./0007-redaction-model.md) | Credentials off domain objects; default-deny output | Accepted |
| [0008](./0008-approval-model.md) | Identity-bound, TTL'd approvals with fail-closed timeout | Accepted |
| [0009](./0009-when-guard-vs-validator.md) | `when` skips, `guard` denies, legacy `validator` remains | Accepted |
| [0010](./0010-regex-fail-closed.md) | Unsafe regexes reject the policy | Accepted |
| [0011](./0011-postconditions-detection-only.md) | Postconditions detect; they do not undo | Accepted |
| [0012](./0012-budget-ordering-and-sharing.md) | Budget attempts vs executions, atomic reservation | Accepted |
| [0013](./0013-sidecar-contract.md) | Loopback sidecar contract and shared decide/run path | Accepted |
| [0014](./0014-dual-cjs-esm-package.md) | Dual CJS/ESM package, Node 24+ | Accepted |
| [0015](./0015-fixture-backed-demo.md) | One console, two data sources, read-only demo | Accepted |
| [0016](./0016-trusted-publishing.md) | npm Trusted Publishing with provenance | Accepted |
| [0017](./0017-segmented-audit-log.md) | Segmented audit log and streaming verification | Accepted |
