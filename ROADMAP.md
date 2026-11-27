# Roadmap

**Status:** v1.1.0 released · alpha · all v1.1.0 issues closed
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

## Next

Ideas, not commitments. Open an issue before starting any of them.

- Log rotation and streaming chain verification for large logs.
- Distributed approval storage and role-based approvals.
- Resource limits and timeouts for all built-in executors, not just shell commands.
- Command budgets / rate limits to reduce approval fatigue.
- Optional MCP client adapter using the sidecar contract.
- Post-condition checks that verify an executor stayed within its approved scope.

## Non-goals

Permiscope is cooperative governance, not a sandbox. See
[limitations](./docs/limitations.md). It is single-machine and file-backed; the demo is
read-only and never exposes a live approval endpoint.
