# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.2.x | ✅ Current release line |
| 1.1.x | ⚠️ Best-effort, no published backports |
| 1.0.x | ❌ |
| < 1.0 | ❌ |

Security fixes are applied to the latest released minor first. Under
[ADR-0018](./docs/adr/0018-branching-and-release-model.md), patching an older minor
requires changing this support policy *before* cutting a `hotfix/vX.Y.Z` branch. Until
then older minors receive fixes at maintainer discretion. See
[migration](./docs/migration.md) for the compatibility policy.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository (Security →
Report a vulnerability). Do **not** open a public issue for an unpatched flaw.
Include a reproduction, affected version, and impact statement.

You should get an acknowledgement within 3 working days. Critical issues — guardrail
bypasses, approval spoofing, audit forgery — are prioritized and patched as soon as a
regression test exists. We will credit reporters who consent.

## What Permiscope protects

- Accidental or careless agent actions through policy mediation and approvals
- Command injection in governed `run_command` calls (AST tokenization, executable
  allowlist, argv execution)
- Path traversal and symlink escape via realpath containment
- Approval spoofing via authenticated principals
- Audit tampering and tail truncation via signed, sequenced entries with a head anchor
- Missing host credentials: the dashboard and sidecar fail closed ([ADR-0020](./docs/adr/0020-fail-closed-host-defaults.md))

## What Permiscope does **not** protect

Permiscope is cooperative governance, **not a sandbox**. It cannot stop an agent that
imports `fs` directly, spawns processes outside the gateway, or loads native addons.
It is single-machine and file-backed by default; the dashboard has no user management
or TLS. For adversarial environments use OS isolation (containers, gVisor, VMs),
network restrictions, and short-lived credentials.

See [limitations](./docs/limitations.md) and the
[architecture post](./docs/architecture-post.md) for details.
