# 4. Identity from the host, not the caller

- Status: Accepted
- Date: 2026-11-28

## Context

Approval keys and budget counters originally used the caller-supplied `agentId` on the
`Action`. Any agent could claim another principal's identity, reuse its approvals or
exhaust its budget. Later, the bearer token itself was attached to `Action`, so every
credential was serialized into the audit log.

## Decision

Identity comes from a host-provided `principalProvider`; `verifiedPrincipalProvider`
verifies HS256/RS256 JWTs locally and supplies id and roles. The bearer token is carried
in `AsyncLocalStorage` request context and never placed on the domain object. `decide()`
and `run()` share this resolution path. The misleading `_agentId` parameter was removed
from the adapter.

## Consequences

- Integrations must configure identity; there is no per-action identity escape hatch.
- Caller roles/agentId cannot override verified claims.
- Credentials no longer enter audit entries, and redaction is defence in depth.

## Alternatives

- **Trust caller-supplied agentId** — rejected after the approval-reuse bypass.
- **Use the sidecar's static token as identity** — rejected: it identifies the service,
  not the calling principal.
