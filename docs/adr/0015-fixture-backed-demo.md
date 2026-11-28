# 15. One console, two data sources, read-only demo

- Status: Accepted
- Date: 2026-11-28

## Context

A public demo of the governance console would need approval and audit endpoints. Exposing
those endpoints, even read-only, increases risk and complicates hosting.

## Decision

The React console reads either the local authenticated Express API or a committed fixture
(`demo.json`) selected by configuration. The hosted demo uses only the fixture: it is
read-only, approval buttons are disabled, no secrets are present and no live API is called.
GitHub Pages builds with `VITE_BASE=./`.

## Consequences

- The public demo is safe but cannot demonstrate live mutation.
- Fixtures must be regenerated when dashboard data shapes change; a build test checks the
  asset and fixture are present.
- The same UI is exercised by the E2E harness against the real API.

## Alternatives

- **Live API demo with sandbox credentials** — rejected: credential and abuse risk.
- **Separate demo UI** — rejected: would drift from the product.
