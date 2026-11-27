# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

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
- Development requires Node 24+; the published library supports Node 20+. (#13)
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
