# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The public demo no longer fabricates results: per-category eval counts come from real failures and the audit chain is verified before the fixture is generated. `eval:fixture` and `fixture:web` now run in CI with a drift gate; host-level shadow mode is used for the rogue-agent scenario (#113).

### Security

- The default `run_command` policy now uses an executable allowlist instead of a denylist. Commands such as `rm -r -f /`, `node -e`, `curl` uploads and `python -m http.server` were previously allowed; they now block unless a caller opts in. Add `allowedCommands` to a custom scope to widen it. See [ADR-0019](./docs/adr/0019-default-command-allowlist.md) (#111).

### Changed

- Split `ExecutionGateway.run` into focused helpers; no behavior change (#93).
- Made the approval TTL regression test deterministic on loaded CI runners (#93).
- Split JWT verification into decode/signature/claims/principal helpers; no behavior change (#95).
- Cleared all npm advisories with patched minimatch/glob overrides; CI and workflows now use Actions v6 (#97).
- File-backed shared budget store with atomic compare-and-set and fail-closed corruption handling (#99).
- Architecture decision records and `AGENTS.md` working rules, including the requirement to cite the relevant ADR (#101).
- Audit chain verification now streams the log in bounded chunks instead of loading it all (#103).
- Opt-in segmented audit logs with signed segment heads, atomic rotation and a migration CLI (#105).
- Roadmap reconciled with v1.1.0/v1.2.0 releases and pending v1.3.0 work (#107).
- ADR-0018 and explicit branching, tagging and release procedures (#109).

## [1.2.0] - 2026-11-27

This release fixes five security defects found in a self-audit before publishing:
a bearer-token leak into audit logs, strict logging that failed after the side effect,
a `/v1/decide` governance bypass, fail-open validator semantics and fail-open regex
filtering. It also publishes the first registry release that actually contains the
v1.1.0 fixes (the registry was still serving the vulnerable 1.0.2).

### Added

- Structured denial reasons via `evaluateDetailed()` and gateway result fields (#30).
- Python SDK packaging metadata (`pyproject.toml`) (#28).
- Automated Python SDK and built-web-asset tests (#33).
- First-class MCP tool-call adapter with wildcard action scopes (#42).
- Per-principal budgets with call/spend caps and `BUDGET_EXCEEDED` reason code (#43).
- Post-condition checks with `POSTCONDITION_FAILED` audit outcomes (#44).
- Verified JWT principals with role-gated policy scopes and sidecar token forwarding (#45).
- Dual CommonJS/ESM package build with `check:package` and `prepublishOnly` (#46).
- Composable typed policy builder with wildcards, roles and postconditions (#47).
- Migration guide and explicit compatibility/deprecation policy (#49).
- Deterministic fuzz tests and a repeatable benchmark script with recorded numbers (#48).
- Real-process end-to-end harness (`npm run e2e`) and manual validation checklist (#58).
- Real MCP SDK client/server integration tests via `InMemoryTransport` (#58).
- Browser/pages smoke check in the deploy workflow (#24).
- Release workflow with npm Trusted Publishing (OIDC), provenance and a tarball install/quick-start smoke test (#67).

### Changed

- Dashboard API requires a bearer token on every route and redacts log parameters by default (#26).
- Coverage thresholds raised to 70/65/72/72 (#31).
- `npm audit --audit-level=high` added to CI (#29).
- `engines.node` is now `>=24`, matching the tested matrix (#32).
- Documentation updated for v1.1.0 behavior (#28).

### Fixed

- Bearer tokens no longer enter the audit log: credentials move to `AsyncLocalStorage` request context, with recursive redaction as defence in depth (#62).
- Strict logging blocks before execution: a signed INTENT record is written first and a linked RESULT record is appended afterwards (#63).
- `ExecutionGateway.decide()` and `/v1/decide` now share principal verification, roles and budgets with execution (#64).
- Explicit `when` (skip) and `guard` (deny) scope predicates replace fail-open validator misuse (#65).
- Unsafe or invalid command regexes now fail closed at policy construction instead of being skipped (#66).
- Shadow mode moved to host-only `GatewayOptions`; action-level `shadowMode` is ignored (#68).
- File paths are re-resolved and canonicalized immediately before I/O, closing the symlink-swap TOCTOU gap (#69).
- Postconditions are documented as detection-only; results report `sideEffects` and support optional compensation (#70).
- Budgets separate attempts from executions, reserve atomically before side effects and accept an optional shared store (#71).
- `Idempotency-Key` support on `/v1/execute` with a bounded, TTL'd replay cache and concurrent deduplication (#72).
- Audit output and errors are redacted by default; raw dashboard views still scrub credential-shaped fields (#73).
- Dashboard CORS follows `PERMISCOPE_DASHBOARD_PORT`; the ignored `_agentId` adapter parameter is removed (#74).
- Sidecar bind failures reject cleanly; roadmap, Node-version and limitations docs reconciled with shipped code (#75).
- Audit head record is HMAC-signed and verified with the key ring (#27).
- GitHub Pages demo blank page caused by a case-mismatched asset base path (#24).
- High-severity dependency advisories patched (#29).
- README and docs no longer claim Node 20 support or stale dashboard behavior (#28, #32).

## [1.1.0] - 2026-11-27

### Added

- **MCP-ready governance sidecar**: loopback HTTP API (`/v1/decide`, `/v1/execute`)
  with bearer-token auth, zod validation and a 64 KB body cap. Exposed as
  `createSidecar`/`startSidecar` and `permiscope serve`. (#20)
- **Python SDK**: stdlib-only client with `decide`, `allowed` and `execute`. (#20)
- **Adversarial eval corpus**: 36 versioned cases, `permiscope eval`, a published
  **36/36 (100%)** pass rate, and a deterministic rogue-agent fixture. (#21)
- **Audit CLI**: `permiscope verify [path]` and `npm run audit:verify`. (#19)
- **Audit key rotation**: entries carry `keyId`; a key ring lets old entries stay
  verifiable after rotation. (#19)
- **React governance console** with approvals, audit stream, chain panel, eval
  scoreboard and scenario timeline, plus a read-only static demo. (#22–#24)
- `SECURITY.md`, `ROADMAP.md` and this changelog.

### Changed

- **Fail-closed path guardrails**: an `ALLOW`/`REQUIRE_APPROVAL` scope without
  `allowedPaths` now denies access. Configure explicit roots when upgrading. (#17)
- **Approval identity**: approvals are keyed to an authenticated principal supplied
  by the host via `principalProvider`; caller-provided `agentId` is no longer trusted. (#18)
- **Strict logging**: audit writes are awaited, so strict-mode failures propagate. (#18)
- Node 24+ is required for both development and the published library; earlier drafts of these notes mentioned Node 20, which was never supported by `engines.node`. (#13, corrected in #28, #32)
- Switched to TypeScript 7 native compiler with a TS 6 compatibility API for
  ts-jest and typescript-eslint. (#13)
- Added an `exports` map and coverage thresholds.

### Fixed

- Shell-injection bypasses: commands are tokenized with `shell-quote`, operators and
  nested shells are rejected, and execution uses argv without a shell. (#16)
- `wrap()` bypassing the gateway and executing twice. (#15)
- Rejections never expiring, silent pre-approval, corrupt approval cache files, and
  approval waits hanging forever without a TTY. (#18)
- Audit tail truncation being undetectable; sequence numbers and a head anchor now
  catch it. (#19)
- GitHub Pages demo blank page caused by a case-mismatched asset base path. (#24)

[Unreleased]: https://github.com/shubhusion/Permiscope/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/shubhusion/Permiscope/releases/tag/v1.1.0
