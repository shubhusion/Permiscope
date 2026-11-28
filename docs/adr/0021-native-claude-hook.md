# 21. Native Claude Code hook

- Status: Accepted
- Date: 2026-11-28

## Context

The adapter, sidecar and MCP wrapper only govern actions that are routed through them.
Claude Code fires a `PreToolUse` hook before every tool call and can allow, deny or ask
based on JSON returned on stdout. That is the first native interception point Permiscope
can use without asking users to change how they call their agent.

The hook protocol is advisory: a hook can deny a call, but its `allow` never overrides a
deny or ask permission rule, and a user can remove the hook. It is cooperative
governance in the sense of ADR-0001, not a sandbox.

## Decision

- Add `permiscope hook`, a command that reads the hook JSON from stdin and writes a
  `hookSpecificOutput` object when it has a verdict.
- Map `Bash`/`PowerShell` to `run_command`, `Write`/`Edit`/`NotebookEdit` to
  `write_file`, `Read`/`NotebookRead`/`Glob`/`Grep` to `read_file`, and `WebFetch` to
  `call_api`. The hook runs with the project directory as its working directory, so the
  default policy's workspace roots apply.
- Map policy decisions to hook decisions: `ALLOW` → `allow`, `BLOCK`/`SHADOW_BLOCK` →
  `deny`, `REQUIRE_APPROVAL` → `ask`.
- Unmapped tools return `ask`; malformed input, policy errors and unknown decisions
  return `deny`. There is no implicit allow path.
- `PostToolUse` is observational and returns no decision.
- Hooks evaluate the same `PolicyEngine` and default executable allowlist as every
  other surface. No parallel policy implementation.

## Consequences

- Users can add one settings.json entry and get Permiscope decisions before Claude Code
  runs shell or file tools. The hook does not execute the action; it only decides.
- `ask` hands the final decision to the human, which matches the approval model but does
  not create a signed approval record. Hooks are therefore a visibility and guardrail
  layer, not a replacement for the gateway's audit trail.
- The executable allowlist means unfamiliar tools and commands default to denial or
  confirmation. Teams can extend the policy in code, but cannot do so by passing flags
  to the hook; this keeps the trust decision explicit.
- Exit code is always 0 when the hook runs; verdicts are conveyed in JSON so a parse
  failure in Claude Code does not silently allow the call.

## Alternatives

- **An MCP server that wraps tool calls** — already available, but only covers MCP tools,
  not Claude Code's built-in Bash/Write/Edit tools.
- **A shell script with regex checks** — rejected: it would duplicate policy logic and
  reintroduce the string-mutation bypasses closed by ADR-0002.
- **Deny every unmapped tool** — rejected as too disruptive; `ask` still fails closed by
  requiring a human, while keeping unrelated tools usable.
- **OS sandbox** — out of scope per ADR-0001. Use containers or VMs for adversarial code.
