# 13. Loopback sidecar contract and shared decide/run path

- Status: Accepted
- Date: 2026-11-28

## Context

Non-TypeScript agents need governance without reimplementing policy logic. A general HTTP
service could become an unauthenticated remote control plane, and an interactive approval
prompt would hang a service.

## Decision

Provide a loopback-only HTTP sidecar with bearer authentication, zod-validated bodies, a
64 KB body cap and no TTY approvals. `/v1/decide` and `/v1/execute` both go through the
gateway's shared principal/budget/policy path; decide never executes. `Idempotency-Key`
replays results, and bind failures reject instead of emitting an unhandled error.
`allowRemote: true` is opt-in and documented as requiring TLS.

## Consequences

- Python, Go and Rust clients need only a stdlib HTTP library.
- The static token identifies the service; per-principal tokens and rate limiting remain
  open limitations.
- Remote deployments need a reverse proxy with TLS.

## Alternatives

- **One SDK per language with embedded policy logic** — rejected: divergent behavior.
- **Public bind by default** — rejected: unacceptable control-plane exposure.
