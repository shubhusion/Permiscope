# Why Permiscope looks like this

A short note on the design decisions behind v1.1.0, written so future maintainers can
tell what was deliberate and what was not.

## The problem

An agent with raw file and shell access is one bug or one injected instruction away
from damage. The industry need is no longer "what can an agent do" but "how do we stop
it from breaking things". Permiscope inserts a mediation layer between the agent and
the resource: every governed action is evaluated, optionally approved, executed, and
recorded.

## Threat model

| Actor | Assumption | Defence |
|---|---|---|
| Cooperative agent | Uses the provided API, may have bugs | Guardrails and approvals prevent accidents |
| Semi-adversarial agent | Crafts hostile parameters | AST tokenization, realpath containment, fail-closed defaults |
| Fully adversarial agent | Direct `fs`, native modules, child processes | **Out of scope** — use OS isolation |

The boundary is honest: we govern calls that pass through us, not the process itself.

## Decisions and why

The canonical records are the [architecture decision records](./adr/README.md). The bullets
below are a short summary; each links to its full ADR.

- **[Parse, do not sanitize](./adr/0002-ast-command-tokenization.md).** Early versions stripped `$()` and backticks before regex
  matching, which made `$(rm -rf /)` disappear while still executing. We now tokenize
  with `shell-quote`, reject operators and nested shells, and execute via argv with no
  shell. What is authorized is what runs.
- **[Fail closed](./adr/0003-fail-closed-path-containment.md).** A scope with no allowed roots denies file access; a non-interactive
  approval request times out and blocks; a corrupt cache becomes empty. Permissive
  defaults were the source of most real bugs found in the audit.
- **[Identity from the host, not the caller](./adr/0004-host-provided-identity.md).** Approval cache keys once used a
  caller-supplied `agentId`, so any agent could claim another's approval. A host-provided
  `principalProvider` now supplies identity.
- **[Unkeyed links, keyed signatures](./adr/0005-audit-chain-design.md).** The hash chain uses plain SHA-256 so rotating an
  HMAC key does not invalidate old links. Per-entry `keyId` plus a key ring provides
  authenticity across rotations. A head record catches tail truncation, which a purely
  backward chain cannot detect.
- **[One UI, two data sources](./adr/0015-fixture-backed-demo.md).** The same React console can read the local Express API
  or a committed fixture, which makes a public demo possible without exposing a live
  approval endpoint or any secrets.
- **[Sidecar over SDK proliferation](./adr/0013-sidecar-contract.md).** A loopback HTTP service with a typed JSON contract
  makes governance usable from Python, Go or Rust without rewriting policy logic for
  each language. It is loopback-only by default and never waits for a TTY.

## What it cannot do

Permiscope is not a process sandbox. It does not isolate memory, block native modules,
or intercept calls made outside its APIs. It is single-machine and file-backed, and the
dashboard is not a public control plane. Use containers or VMs, restrict the network,
and keep secrets short-lived. Those limits are documented in
[limitations](./limitations.md) and [SECURITY.md](../SECURITY.md).

## How we know it works

A versioned corpus of 36 adversarial cases runs on every CI job; the current result is
published in the README with a one-command reproduction. The rogue-agent fixture shows
the four decision paths — allow, block, approved, shadow block — in one recorded chain.
