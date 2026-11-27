# Limitations

This document describes known limitations and design tradeoffs in Permiscope v1.1.0.

## Not a Sandbox

> [!CAUTION]
> Permiscope does not provide process isolation.

| What it does | What it doesn't do |
|---|---|
| Mediates governed API calls | Block direct `require('fs')` |
| Enforces policies and approvals | Isolate memory |
| Records a signed audit chain | Prevent native modules |
| Runs a loopback sidecar | Sandbox child processes |

If an agent imports `fs` directly or spawns processes outside the gateway, Permiscope
cannot intercept those calls. Use containers, gVisor or VMs for adversarial environments.

## Cooperative Security Model

Permiscope assumes agents use the provided APIs. Bypass is possible if the agent uses
Node built-ins directly, spawns processes outside the gateway, or loads native addons.
Guardrails are deliberately conservative:

- Command strings are tokenized with `shell-quote`; operators, nested shells and raw
  `$`/backtick substitution are rejected. POSIX grammar is modelled; Windows `cmd.exe`
  quoting is not, so unusual Windows commands may need a custom executor.
- File paths are resolved with `realpathSync` at policy time and **again immediately
  before I/O**, and the canonical path is what gets opened, so swapping a symlink in
  between cannot redirect a write. A swap of the canonical path itself after resolution
  is still outside the library's control; OS isolation is the remaining mitigation.
- Case folding is applied only on Windows. POSIX paths are case-sensitive.

## Single Machine Only

- Approval storage is a local JSON file with `proper-lockfile`; no distributed coordination.
- **Main scalability limit:** the audit log is a single file with an in-memory chain
  head; `verifyChain()` loads the whole file. There is no built-in rotation or streaming
  verification. Rotate externally with `logrotate` (see [audit-logging.md](./audit-logging.md))
  and archive previous segments before restarting verification from a fresh head.
- The dashboard is single-instance.

For multi-machine deployments, use a shared database for approvals, centralized log
collection, and a reverse proxy with TLS.

## Approval System

| Limitation | Workaround |
|---|---|
| No batch approvals | Review one by one |
| No conditional approvals beyond validators | Encode conditions in policy validators |
| No roles/groups | One dashboard bearer token; use separate deployments for separation |
| TTL is per action | Revoke explicitly when policy changes |

The dashboard API requires a bearer token on every route. Log parameter values are
redacted by default; `?raw=1` exposes them to administrators.

## Policy Engine

| Limitation | Notes |
|---|---|
| Regex performance | Unsafe/invalid patterns are rejected at policy construction |
| Wildcards | Suffix wildcards such as `mcp:*` work; other names match exactly |
| No inheritance | Each scope is independent |
| Grouping | Use `roles` or a `when` predicate for conditions |

## Dashboard and Sidecar

| Limitation | Notes |
|---|---|
| No HTTPS in the bundled server | Put it behind a reverse proxy |
| Localhost by default | CORS restricts browser origins; it is not authentication |
| No user management | Single bearer token |
| Sidecar has one static token | No per-principal tokens or rate limiting. Replay protection is opt-in via `Idempotency-Key` |
| Python SDK is stdlib-only | No chain verification, approval management, async or retries yet |
| Sidecar binds loopback unless explicitly allowed | Use `allowRemote: true` only behind TLS |

The public demo is read-only and fixture-backed; it never calls a live approval API.

## Concurrency

| Limitation | Impact |
|---|---|
| File locking | Contention under high load |
| No queueing | Actions wait for locks |
| Retry limit | 3 attempts, then the operation fails |

## Action Execution

| Limitation | Notes |
|---|---|
| Command timeout | 10 seconds by default; configurable via `timeoutMs` |
| Output cap | 1 MB by default; configurable via `maxOutputBytes` |
| No CPU/memory limits | Use OS-level resource controls |
| Built-in commands are minimal | `read_file`, `write_file`, `run_command`, plus `echo` shim on Windows |

## What Users Must Not Rely On

1. **100% bypass prevention** — use OS isolation.
2. **Sub-millisecond latency** — lock and realpath overhead exists.
3. **Cross-machine sync** — local only.
4. **Auto-rotation of logs** — manual process.
5. **Complete audit under high load** — strict mode blocks if logging fails.

## Design Tradeoffs

| Choice | Tradeoff |
|---|---|
| File-based storage | Simple, but not scalable |
| Synchronous policies | Predictable, but blocking |
| Single log file | Easy verification, but size issues |
| argv execution | Safe from shell injection, but no shell features |
| Static demo fixture | Safe public artifact, but not live data |
