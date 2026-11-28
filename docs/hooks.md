# Native agent hooks

Permiscope can decide on an agent's built-in tool calls before they run. Every hook
uses the same `PolicyEngine`, default executable allowlist and shared evaluator
([ADR-0021](./adr/0021-native-claude-hook.md),
[ADR-0023](./adr/0023-shared-hook-evaluator.md)); each host adapter only translates
payloads and verdicts.

> [!IMPORTANT]
> Hooks are cooperative governance, not a sandbox ([ADR-0001](./adr/0001-cooperative-governance-boundary.md)).
> A hook can deny a call, but it cannot override a deny or ask permission rule, and a
> user can remove it. Use OS isolation for adversarial code. Hooks decide; they do not
> execute actions or write signed audit records.

## Claude Code

Add a `PreToolUse` hook to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|Write|Edit|Read|WebFetch",
        "hooks": [
          {
            "type": "command",
            "command": "npx",
            "args": ["-y", "permiscope", "hook"],
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Permiscope blocked: GUARDRAIL_COMMAND_NOT_ALLOWED"
  }
}
```

| Claude Code tool | Governed action |
|---|---|
| `Bash`, `PowerShell` | `run_command` |
| `Write`, `Edit`, `NotebookEdit` | `write_file` |
| `Read`, `NotebookRead`, `Glob`, `Grep` | `read_file` |
| `WebFetch` | `call_api` |

`PostToolUse` is observational and returns no verdict. Unmapped tools require
confirmation; malformed input and policy errors deny.

## Cursor

Cursor hooks live in `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user).
Use the dedicated permission hooks where `ask` is enforced, set `matcher` to the tools
you want governed, and set `failClosed: true` so a crashed or timed-out hook cannot
fail open:

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "npx -y permiscope hook cursor",
        "matcher": "curl|wget|rm|npm|git|node|python",
        "timeout": 30,
        "failClosed": true
      }
    ],
    "beforeReadFile": [
      { "command": "npx -y permiscope hook cursor", "failClosed": true }
    ],
    "preToolUse": [
      {
        "command": "npx -y permiscope hook cursor",
        "matcher": "Shell|Read|Write|Edit|Delete|Grep|MCP:",
        "failClosed": true
      }
    ]
  }
}
```

On Windows, Cursor runs hook commands through PowerShell; the same `npx` command works.

Output:

```json
{
  "permission": "deny",
  "user_message": "Permiscope blocked: GUARDRAIL_COMMAND_NOT_ALLOWED",
  "agent_message": "Permiscope blocked: GUARDRAIL_COMMAND_NOT_ALLOWED"
}
```

| Cursor event / tool | Governed action |
|---|---|
| `beforeShellExecution`, `preToolUse` `Shell` | `run_command` |
| `beforeReadFile`, `preToolUse` `Read`/`Grep` | `read_file` |
| `preToolUse` `Write`/`Edit`/`Delete` | `write_file` |
| `beforeMCPExecution`, `preToolUse` `MCP:*` | `call_api` |

Cursor accepts `ask` in the `before*` permission hooks but **does not enforce it in
`preToolUse`**. On `preToolUse`, a `REQUIRE_APPROVAL` decision is therefore converted to
a denial so the action cannot proceed silently; use a dedicated `before*` hook to get
`ask`. Malformed input, unmapped tools and policy errors deny. Observational events
(`postToolUse`, `afterFileEdit`, `sessionStart`, `stop`, …) return no verdict.

## Shared rules

The default policy allows only `echo`, `pwd`, `git status`, `git diff`, `git log`,
`git show`, `git rev-parse` and `npm test`, and confines file actions to the workspace
and temp directories. Other commands are denied or require approval.

| Permiscope decision | Claude Code | Cursor `before*` | Cursor `preToolUse` |
|---|---|---|---|
| `ALLOW` | `allow` | `allow` | `allow` |
| `BLOCK` / `SHADOW_BLOCK` | `deny` | `deny` | `deny` |
| `REQUIRE_APPROVAL` | `ask` | `ask` | `deny` |
| Unmapped tool | `ask` | `deny` | `deny` |
| Malformed input or policy error | `deny` | `deny` | `deny` |

`permiscope hook` remains the Claude Code command for compatibility; pass `cursor` to
select the Cursor adapter. The CLI never auto-detects the host: an unrecognized payload
shape must not become an implicit allow.

## Limitations

- Hooks do not write audit entries. Use the `ExecutionGateway`, sidecar or MCP wrapper
  when you need signed evidence for the execution itself.
- `ask` requires a human; it does not create a cached approval.
- Hooks run with the user's privileges and can be disabled. Use host permission rules,
  `failClosed` and managed settings where available; use OS isolation for adversarial code.
