# 23. Shared evaluator for native hook adapters

- Status: Accepted
- Date: 2026-11-28

## Context

ADR-0021 added a Claude Code hook that returns `allow`/`deny`/`ask`. Cursor and Codex
also run command hooks over JSON stdio, but their event names, payloads and verdict
schemas differ. Copying the policy-evaluation block into each adapter would create three
copies that could drift, and a bug fix in one would not reach the others.

The hosts also disagree on `ask`: Claude Code supports it, Cursor accepts it in
`preToolUse` but does not enforce it, and Codex parses but does not support it in
`PreToolUse`.

## Decision

- Keep one host-agnostic evaluator in `src/hooks/evaluate.ts`. It accepts a governed
  `Action` and returns a normalized `allow`/`deny`/`ask` verdict with the policy reason
  code. All adapters use it; no adapter evaluates policy itself.
- Each host adapter only maps payload → `Action` and verdict → host JSON schema.
- The CLI selects the host explicitly: `permiscope hook` stays Claude Code for
  compatibility, `permiscope hook cursor` selects Cursor. Payload auto-detection is
  rejected because an unrecognized shape must not become an implicit allow.
- Unmapped tools, malformed payloads and policy errors deny in every adapter.
- `REQUIRE_APPROVAL` is translated per host: Claude Code and Cursor's dedicated `before*`
  hooks return `ask`; Cursor's `preToolUse` and Codex's `PreToolUse` deny instead of
  emitting an unenforced `ask`, so the action fails closed and the human can use the
  normal approval flow before retrying.
- Cursor hooks are documented with `failClosed: true`, because Cursor otherwise fails
  open on hook crashes and timeouts.

## Consequences

- Adding a host costs one mapping module, one CLI branch and tests; decision semantics
  stay identical across hosts.
- Users must state the host in the hook command. This is a small setup cost that makes
  misconfiguration visible.
- Denying `REQUIRE_APPROVAL` on generic hooks can block actions that a dedicated
  approval hook would have asked about. The docs explain the difference and recommend
  the dedicated hooks where `ask` is enforced.
- Hooks remain cooperative governance (ADR-0001): they decide, but do not execute or
  write signed audit records. Host trust flows (Codex `/hooks`, Cursor workspace trust)
  still apply.

## Alternatives

- **One adapter with payload auto-detection** — rejected: a new or altered host payload
  could be mistaken for a benign shape and silently allowed.
- **Duplicate the policy logic per host** — rejected: drift risk and repeated security
  fixes.
- **Return `ask` everywhere** — rejected: Cursor and Codex do not enforce it on generic
  tool hooks, which would turn an approval requirement into an implicit allow.
- **OS sandbox** — out of scope per ADR-0001.
