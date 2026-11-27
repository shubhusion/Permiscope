# Roadmap

**Status:** v1.1.0 released · v1.2.0 changes merged, publication pending · alpha
[![CI](https://github.com/shubhusion/Permiscope/actions/workflows/ci.yml/badge.svg)](https://github.com/shubhusion/Permiscope/actions/workflows/ci.yml)
**[Live demo →](https://shubhusion.github.io/Permiscope/)** ·
[Eval corpus](./eval/cases.json) · [Security policy](./SECURITY.md)

GitHub Issues are the source of truth; this file is a summary that links to them.

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

## Shipped in v1.2.0 (pending publication)

| Issue | Delivered |
|---|---|
| #62 | Bearer tokens removed from the audit log; recursive redaction |
| #63 | INTENT written before execution; strict logging blocks before side effects |
| #64 | `decide()` and `/v1/decide` share the governed path |
| #65 | Explicit `when`/`guard` scope predicates |
| #66 | Unsafe regexes fail closed at policy construction |
| #67 | Release workflow with npm provenance and tarball smoke test |
| #68 | Host-only shadow mode |
| #69 | Path TOCTOU closed by re-resolving before I/O |
| #70 | Detection-only postconditions with optional compensation |
| #71 | Budget attempts/executions split and shared-store support |
| #72 | `Idempotency-Key` replay cache |
| #73 | Sensitive output redacted from logs and dashboard |
| #74 | Configurable dashboard CORS; ignored `_agentId` removed |

## Next

Ideas, not commitments. Open an issue before starting any of them. Budgets,
postconditions, MCP governance and verified JWT principals are already shipped —
see the tables above.

- Log rotation and streaming chain verification for large logs (the main scalability limit).
- Distributed approval storage and role-based approvals.
- Resource limits and timeouts for all built-in executors, not just shell commands.
- Shared budget-store implementations (Redis/Postgres) using the new `BudgetStore` interface.
- Per-principal sidecar tokens, rate limiting and TLS for remote deployments.
- Python SDK follow-up module: chain verification, approval management, async and retries.

## Non-goals

Permiscope is cooperative governance, not a sandbox. See
[limitations](./docs/limitations.md). It is single-machine and file-backed; the demo is
read-only and never exposes a live approval endpoint.
