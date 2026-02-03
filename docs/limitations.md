# Limitations

This document describes known limitations and design tradeoffs in Permiscope.

## Not a Sandbox

> [!CAUTION]
> Permiscope does not provide process isolation.

| What it does | What it doesn't do |
|--------------|-------------------|
| Intercepts API calls | Block `require('fs')` |
| Enforces policies | Isolate memory |
| Logs actions | Prevent native modules |
| Requires approvals | Sandbox processes |

**If an agent imports `fs` directly, Permiscope cannot intercept those calls.**

## Cooperative Security Model

Permiscope assumes agents use the provided APIs. Bypass is possible if:

- Agent uses Node.js built-ins directly
- Agent spawns child processes outside Permiscope
- Agent uses native addons

For adversarial environments, combine with:
- Container isolation (Docker, gVisor)
- VM-level isolation
- Language-level sandboxes (Deno, etc.)

## Single-Machine Only

- File locking is local
- No distributed coordination
- Dashboard is single-instance

For multi-machine deployments, consider:
- Shared database for approvals
- Centralized logging (ELK, etc.)
- Load balancer with sticky sessions

## Log File Limitations

| Limitation | Impact |
|------------|--------|
| Single file | Large logs slow verification |
| No rotation | Manual archival required |
| Synchronous verify | Blocks during read |
| No streaming | Full file loaded for verify |

## Approval System

| Limitation | Workaround |
|------------|------------|
| No batch approvals | Review one by one |
| No conditional approvals | Use validators in policy |
| No roles/groups | Single token auth |
| TTL is per-action | Manual revocation for others |

## Policy Engine

| Limitation | Notes |
|------------|-------|
| Regex performance | ReDoS protection may skip patterns |
| Case sensitivity | Paths are case-insensitive (Windows compat) |
| No wildcards in action names | Must match exactly |
| No inheritance | Each scope is independent |

## Dashboard

| Limitation | Notes |
|------------|-------|
| No HTTPS | Requires reverse proxy |
| Localhost only | CORS restriction |
| No user management | Single token |
| No search | Logs displayed as-is |

## Concurrency

| Limitation | Impact |
|------------|--------|
| File locking | Contention under high load |
| No queueing | Actions wait for locks |
| Retry limit | 3 attempts, then fail |

## Action Execution

| Limitation | Notes |
|------------|-------|
| Shell commands | `exec` is dangerous |
| No timeout | Commands can hang |
| No resource limits | CPU/memory unbounded |
| Windows paths | Normalized but may have edge cases |

## What Users Must Not Rely On

1. **100% bypass prevention** — Use OS isolation
2. **Sub-millisecond latency** — Lock overhead exists
3. **Cross-machine sync** — Local only
4. **Auto-rotation of logs** — Manual process
5. **Complete audit under high load** — Strict mode may block

## Design Tradeoffs

| Choice | Tradeoff |
|--------|----------|
| File-based storage | Simple, but not scalable |
| Synchronous policies | Predictable, but blocking |
| Single log file | Easy verification, but size issues |
| CLI polling | Universal, but not instant |
