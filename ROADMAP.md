# Roadmap

**Status:** v1.1.0, v1.2.0, v2.0.0 and v2.1.0 released · v2.2.0 work unreleased on `main` · alpha
[![CI](https://github.com/shubhusion/Permiscope/actions/workflows/ci.yml/badge.svg)](https://github.com/shubhusion/Permiscope/actions/workflows/ci.yml)
**[Live demo →](https://shubhusion.github.io/Permiscope/)** ·
[Eval corpus](./eval/cases.json) · [Security policy](./SECURITY.md) ·
[Architecture decisions](./docs/adr/README.md)

GitHub Issues are the source of truth; this file is a status summary. The
[ADR index](./docs/adr/README.md) records *why* each decision was made.

## Shipped in v1.1.0

| Issue | Delivered |
|---|---|
| [#9](https://github.com/shubhusion/Permiscope/issues/9) | Maintainer rules and contribution workflow |
| [#11](https://github.com/shubhusion/Permiscope/issues/11) | Up-to-date toolchain, ESLint 10, Node 24/26 CI |
| [#1](https://github.com/shubhusion/Permiscope/issues/1) | Shell-injection bypass fixed with AST tokenization |
| [#10](https://github.com/shubhusion/Permiscope/issues/10) | `wrap()` gateway bypass and double execution fixed |
| [#2](https://github.com/shubhusion/Permiscope/issues/2) | Fail-closed path guardrails with realpath containment |
| [#3](https://github.com/shubhusion/Permiscope/issues/3) | Authenticated approvals, TTL, non-interactive fail-closed |
| [#4](https://github.com/shubhusion/Permiscope/issues/4) | Sequence numbers, `verify` CLI and key rotation |
| [#5](https://github.com/shubhusion/Permiscope/issues/5) | HTTP sidecar and stdlib Python SDK |
| [#6](https://github.com/shubhusion/Permiscope/issues/6) | 36-case adversarial corpus, 100% pass rate |
| [#7](https://github.com/shubhusion/Permiscope/issues/7) | React console and hosted read-only demo |
| [#8](https://github.com/shubhusion/Permiscope/issues/8) | Release, changelog, security policy, architecture post |

## Shipped in v1.2.0

Published to npm with provenance on 2026-11-28.

| Issue | Delivered |
|---|---|
| #58 | Real-process E2E harness and manual validation checklist |
| #60 | Real MCP SDK client/server integration tests |
| #62 | Bearer tokens removed from the audit log; recursive redaction |
| #63 | INTENT written before execution; strict logging blocks before side effects |
| #64 | `decide()` and `/v1/decide` share the governed path |
| #65 | Explicit `when`/`guard` scope predicates |
| #66 | Unsafe regexes fail closed at policy construction |
| #67 | Release workflow, npm Trusted Publishing, tarball smoke test |
| #68 | Host-only shadow mode |
| #69 | Path TOCTOU closed by re-resolving before I/O |
| #70 | Detection-only postconditions with optional compensation |
| #71 | Budget attempts/executions split |
| #72 | `Idempotency-Key` replay cache |
| #73 | Sensitive output redacted from logs and dashboard |
| #74 | Configurable dashboard CORS; ignored `_agentId` removed |
| #75 | Documentation drift and sidecar bind-error handling |

## Shipped in v2.0.0

This is a breaking release; see the [migration guide](./docs/migration.md#1x--20).

| Issue | Delivered |
|---|---|
| #90 | Trusted Publishing replaced token auth; provenance retained |
| #91 | Documentation refresh with Archify diagrams |
| #93 | `ExecutionGateway.run` split into focused helpers |
| #95 | JWT verification split into focused helpers |
| #97 | npm advisories cleared; GitHub Actions v6 |
| #99 | File-backed shared budget store for multiple processes |
| #101 | ADR set and `AGENTS.md` working rules |
| #103 | Streaming audit chain verification |
| #105 | Segmented audit logs, signed segment heads and migration CLI ([ADR-0017](./docs/adr/0017-segmented-audit-log.md)) |
| #107 | Roadmap reconciled with v1.1.0/v1.2.0 releases |
| #109 | Explicit branching, tagging and release rules ([ADR-0018](./docs/adr/0018-branching-and-release-model.md)) |
| #111 | Default command allowlist closes interpreter and network escape ([ADR-0019](./docs/adr/0019-default-command-allowlist.md)) |
| #113 | Honest demo fixtures with a verified chain and CI drift gate |
| #115 | Fail-closed dashboard and sidecar defaults ([ADR-0020](./docs/adr/0020-fail-closed-host-defaults.md)) |
| #117 | Segmented audit crash recovery, atomic migration and read-only verify |
| #119 | Project landing page at the site root |
| #121 | Refreshed contributor and security onboarding |
| #123 | Native Claude Code PreToolUse hook ([ADR-0021](./docs/adr/0021-native-claude-hook.md)) |
| #125 | Single-use approvals with pending expiry ([ADR-0022](./docs/adr/0022-single-use-approvals.md)) |

## Shipped in v2.1.0

| Issue | Delivered |
|---|---|
| #129 | Native Cursor hook adapter and shared hook evaluator ([ADR-0023](./docs/adr/0023-shared-hook-evaluator.md)) |
| #131 | Native Codex hook adapter |

## Merged after v2.1.0 — targets v2.2.0

| Issue | Delivered |
|---|---|
| #135 | Documentation index, launch post and hook examples |
| #138 | Landing page refresh with native hook section |
| #141 | WCAG 2.2 AA gate for the web UI ([ADR-0024](./docs/adr/0024-accessibility-gate.md)) |

## Next

Ideas, not commitments. Open an issue before starting any of them.

- Automate the GitHub Release and milestone closure (npm publishing is already automatic).
- Multi-host audit collection and verification across archived segments; same-machine segmentation is shipped.
- Distributed approval storage and role-based approvals.
- Resource limits and timeouts for all built-in executors, not just shell commands.
- Cross-host budget stores (Redis/Postgres) using the `BudgetStore` interface; the file-backed store covers one host.
- Per-principal sidecar tokens, rate limiting and TLS for remote deployments.
- Python SDK follow-up module: chain verification, approval management, async and retries.
- Optional maintenance refactors from Architecture Diagnosis: CLI `main`, `createSidecar`, `executeAction`, `PolicyEngine.evaluateDetailed`.

## Non-goals

Permiscope is cooperative governance, not a sandbox ([ADR-0001](./docs/adr/0001-cooperative-governance-boundary.md)).
See [limitations](./docs/limitations.md). It is single-machine by default; segmentation
and the file-backed budget store share state across processes on one host. The demo is
read-only and never exposes a live approval endpoint.
