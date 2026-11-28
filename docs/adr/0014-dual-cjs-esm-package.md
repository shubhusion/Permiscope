# 14. Dual CJS/ESM package, Node 24+

- Status: Accepted
- Date: 2026-11-28

## Context

Consumers use both `require()` and `import()`. The registry package was stale and the
repository alone held the current code. CI toolchain and dependency versions had moved to
Node 24/26.

## Decision

Ship `dist/index.js` (CommonJS) and `dist/index.mjs` (ESM) with an `exports` map, verify
both entry points with `check:package`, and declare `engines.node >= 24`. Publishing runs
from a workflow, not a local machine.

## Consequences

- Two build artifacts must stay in sync; CI checks both on every matrix job.
- Node 20 users cannot install the package; documentation says so explicitly.
- `npm pack` smoke tests validate what users actually receive.

## Alternatives

- **ESM only** — rejected: breaks existing CommonJS consumers.
- **CJS only** — rejected: blocks modern ESM tooling.
