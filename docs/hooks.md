# Claude Code hook

Permiscope can decide on Claude Code's built-in tool calls before they run. The hook
uses the same `PolicyEngine` and default executable allowlist as the adapter and sidecar
([ADR-0021](./adr/0021-native-claude-hook.md)).

> [!IMPORTANT]
> Hooks are cooperative governance, not a sandbox ([ADR-0001](./adr/0001-cooperative-governance-boundary.md)).
> A hook can deny a call, but it cannot override a deny or ask permission rule, and a
> user can remove it. Use OS isolation for adversarial code.

## Setup

Add a `PreToolUse` hook to `.claude/settings.json` in your project:

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

The hook reads Claude Code's JSON on stdin and writes one JSON object on stdout:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Permiscope blocked: GUARDRAIL_COMMAND_NOT_ALLOWED"
  }
}
```

## Decision mapping

| Permiscope decision | Hook decision |
|---|---|
| `ALLOW` | `allow` |
| `BLOCK` / `SHADOW_BLOCK` | `deny` |
| `REQUIRE_APPROVAL` | `ask` |
| Unmapped tool | `ask` |
| Malformed input or policy error | `deny` |

`PostToolUse` events return no verdict; the hook stays silent so normal flow continues.

## Tool mapping

| Claude Code tool | Governed action |
|---|---|
| `Bash`, `PowerShell` | `run_command` |
| `Write`, `Edit`, `NotebookEdit` | `write_file` |
| `Read`, `NotebookRead`, `Glob`, `Grep` | `read_file` |
| `WebFetch` | `call_api` |

The default policy allows only `echo`, `pwd`, `git status`, `git diff`, `git log`,
`git show`, `git rev-parse` and `npm test`, and confines file actions to the workspace
and temp directories. Other commands are denied or sent to the human.

## Limitations

- The hook does not execute actions and does not write audit entries. Use the
  `ExecutionGateway`, sidecar or MCP wrapper when you need signed evidence for the
  execution itself.
- `ask` requires a human; it does not create a cached approval.
- Hooks run with the user's privileges and can be disabled. For enforced governance,
  combine them with Claude Code permission rules or managed settings.
