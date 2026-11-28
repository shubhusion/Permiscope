# Announcing Permiscope 2.1.0

## The problem

Autonomous agents take real actions: they run shell commands, edit files, call APIs and
spend credentials. Most safety advice stops at "be careful". When an agent acts through
your own code, there is no consistent place to enforce least privilege, ask a human, or
produce evidence of what happened.

Permiscope is a small layer that mediates those actions. It is **cooperative governance,
not a sandbox**: anything that bypasses the gateway is outside its boundary. For
adversarial code, use containers, VMs or gVisor.

## What 2.1.0 adds

Version 2.0.0 tightened the defaults: a default executable allowlist, fail-closed host
credentials, single-use approvals and an honest public demo. Version 2.1.0 brings native
hooks to three agent hosts:

- `permiscope hook` — Claude Code `PreToolUse`
- `permiscope hook cursor` — Cursor shell, file and MCP hooks
- `permiscope hook codex` — Codex `PreToolUse` and `PermissionRequest`

All three use one shared policy evaluator and the same deny-by-default rule. No payload
auto-detection: an unrecognized shape never becomes an implicit allow. Setup snippets
are in [docs/hooks.md](./hooks.md) and [examples/](../examples/README.md).

## How it works

```ts
import { PermiscopeAdapter } from 'permiscope';

const gate = new PermiscopeAdapter();
const result = await gate.act('run_command', { command: 'echo hello' });
```

Actions are evaluated against typed scopes, then executed through one gateway that writes
an INTENT record before any side effect and a RESULT record afterwards. Entries are
hash-linked and optionally HMAC-signed. Sensitive actions require a verified principal
and a single-use human approval.

The same policy engine is reachable through the TypeScript adapter, the HTTP sidecar, the
MCP tool wrapper and the native hooks. The default policy allows only a small set of safe
commands; everything else is denied or requires approval.

```bash
npm install permiscope@2.1.0
```

## Evidence, not claims

- A versioned [adversarial corpus](../eval/cases.json) runs in CI: **56/56 passing**.
- The public [console](https://shubhusion.github.io/Permiscope/#/console/overview) reads
  its numbers from generated fixtures, not hard-coded values.
- npm releases use Trusted Publishing with provenance and a Sigstore attestation.

## What it does not do

- It is not a sandbox and does not intercept direct `fs` calls or processes spawned
  outside the gateway.
- It does not detect prompt injection or act as an OAuth provider.
- Hooks only return decisions; they do not execute actions or write signed audit records.
- By default it is single-machine; multi-host audit and distributed state are roadmap items.

See [limitations](./limitations.md) and [security model](./security-model.md).

## Get involved

This is an MIT-licensed open-source project and the first contribution path is short:

- [Good first issues](https://github.com/shubhusion/Permiscope/labels/good%20first%20issue)
- [Contributing guide](../CONTRIBUTING.md) and [docs index](./README.md)
- [Project site](https://shubhusion.github.io/Permiscope/) ·
  [GitHub](https://github.com/shubhusion/Permiscope) ·
  [npm](https://www.npmjs.com/package/permiscope)

If you build agents that take real actions, try the gate, run the eval corpus and tell us
what your policy needs.
