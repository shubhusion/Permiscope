# 20. Fail-closed host defaults

- Status: Accepted
- Date: 2026-11-28

## Context

`AGENTS.md` requires that a skipped rule, missing key or unwritable audit log must not
become an allow. The sidecar already refuses to start without a bearer token, but the
other long-running host did not:

- `createDashboard` skipped authentication whenever `PERMISCOPE_DASHBOARD_TOKEN` was
  unset, exposing approval and log APIs to anyone who could reach the port.
- The dashboard constructed its logger with strict mode disabled.
- The sidecar used the library default logger, which is unsigned by default and only
  enters strict mode when `PERMISCOPE_STRICT_LOGGING=true`.

The library defaults are intentional for local development and for callers that supply
their own logger. The hosts, which process real governed actions, should not inherit
those permissive defaults silently.

## Decision

- The dashboard rejects every `/api` request with `401` when no token is configured.
  Local development can opt out explicitly with
  `PERMISCOPE_DASHBOARD_ALLOW_ANONYMOUS=true`; the warning no longer claims the API is
  unauthenticated, it states that requests will be rejected.
- `AuditLoggerOptions.requireSignature` makes construction throw when no signing secret
  is resolvable from `options.secret`, the key ring or `PERMISCOPE_AUDIT_SECRET`.
- The dashboard and the sidecar construct their default logger with strict mode and
  `requireSignature: true`. A caller-supplied `auditLogger` is always respected.
- `PERMISCOPE_ALLOW_UNSIGNED_AUDIT=true` is the explicit development opt-out for hosts.
  It relaxes the signing requirement only; strict logging stays enabled. It is not read
  by the library's default logger.
- The end-to-end harness now supplies a test token and a test audit secret to both
  spawned processes.

## Consequences

- Running the dashboard or sidecar now requires configuration that was previously
  optional. `docs/migration.md` records the change.
- Anonymous dashboard access and unsigned host logs remain possible, but only through
  named environment variables, so an operator cannot enable them by mistake.
- Strict mode means an unwritable audit log blocks the governed action at the INTENT
  write, before any side effect. This is deliberate: hosts are long-lived and a
  missing audit trail must not turn into an allow.
- The library defaults are unchanged, so existing unit tests and local scripts that
  construct `ExecutionGateway` directly keep working.
- Permiscope remains cooperative governance, not a sandbox (ADR-0001). These defaults
  harden the host boundary; they do not isolate an adversarial agent.

## Alternatives

- **Flip the library defaults globally** — rejected: it breaks every local quick start
  and gives callers no way to distinguish a library experiment from a running host.
- **Keep warning only** — rejected: warnings are not enforcement, which is exactly the
  failure the security posture forbids.
- **Require a token in the sidecar** — already implemented; the gap was the dashboard.
- **Generate an ephemeral secret when none is configured** — rejected: signatures made
  with a secret the operator does not hold provide no auditability and cannot be
  verified after a restart.
