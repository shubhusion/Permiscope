# 7. Credentials off domain objects; default-deny output

- Status: Accepted
- Date: 2026-11-28

## Context

The sidecar attached the raw bearer token to `Action`, which `AuditLogger` JSON-stringified.
Every credential landed in plaintext in `audit.log`. Parameter redaction on `/api/logs`
also left sensitive executor output and errors visible.

## Decision

Credentials live only in request context. Audit logging recursively redacts
credential-shaped keys and JWT/bearer-shaped values, and treats `result.output` and
`result.error` as sensitive by default with an explicit `allowedOutputKeys` opt-in. The
dashboard applies credential redaction even in `?raw=1` mode.

## Consequences

- Logs are safe to share by default; debugging output requires an explicit allowlist.
- Redaction happens before signing, so verification is unaffected.
- Old logs containing credentials are not retroactively scrubbed.

## Alternatives

- **Rely on callers not to log secrets** — rejected: the leak was in our own code.
- **Redact only known key names** — insufficient for `.env` contents returned as output.
