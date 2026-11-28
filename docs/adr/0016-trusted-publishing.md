# 16. npm Trusted Publishing with provenance

- Status: Accepted
- Date: 2026-11-28

## Context

The registry served 1.0.2 while the repository contained the fixed 1.2.0 code. A classic
`NPM_TOKEN` publish failed with `EOTP` because npm required a one-time password; passing
an OTP into CI would be fragile and would keep a long-lived write token in circulation.

## Decision

Configure npm Trusted Publishing for `shubhusion/Permiscope` and `release.yml` with the
`npm publish` action enabled. The workflow uses OIDC (`id-token: write`), no
`NPM_TOKEN`, and `npm publish --provenance`. It runs the full gate plus a registry tarball
smoke test before publishing.

## Consequences

- Publishing requires a GitHub Actions run; local manual publish is intentionally not the
  primary path.
- The trusted publisher must explicitly allow direct `npm publish`, not only staged
  publishing.
- Attestations are published to the Sigstore transparency log.

## Alternatives

- **Classic token** — rejected: 2FA prompt blocked the release.
- **Granular automation token with 2FA bypass** — rejected: still a long-lived write
  credential.
