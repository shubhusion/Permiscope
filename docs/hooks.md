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

## Codex

Codex hooks live in `.codex/hooks.json` (trusted project layer), `$CODEX_HOME/hooks.json`
(user) or system config. New or changed hooks must be reviewed once with `/hooks` before
Codex runs them. Codex does not support `ask` on `PreToolUse`, so approval decisions are
left undecided and the native permission prompt handles them.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch|Write|Edit|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y permiscope hook codex",
            "timeout": 30,
            "statusMessage": "Checking Permiscope policy"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "Bash|apply_patch|Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx -y permiscope hook codex" }
        ]
      }
    ]
  }
}
```

Output for a denied call:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Permiscope blocked: GUARDRAIL_COMMAND_NOT_ALLOWED"
  }
}
```

`PermissionRequest` uses `hookSpecificOutput.decision.behavior` (`allow`/`deny`) instead.
If Permiscope returns no decision, Codex continues with its normal approval prompt.

| Codex tool | Governed action |
|---|---|
| `Bash` | `run_command` |
| `apply_patch`, `Edit`, `Write` | `write_file` (requires a path in `tool_input`) |
| `mcp__<server>__<tool>` | `call_api` |

`apply_patch` payloads without a stable file path are denied rather than guessed.
Malformed input, unmapped tools and policy errors deny. Other events return no verdict.

## Shared rules

The default policy allows only `echo`, `pwd`, `git status`, `git diff`, `git log`,
`git show`, `git rev-parse` and `npm test`, and confines file actions to the workspace
and temp directories. Other commands are denied or require approval.

| Permiscope decision | Claude Code | Cursor `before*` | Cursor `preToolUse` | Codex |
|---|---|---|---|---|
| `ALLOW` | `allow` | `allow` | `allow` | `allow` / `behavior: allow` |
| `BLOCK` / `SHADOW_BLOCK` | `deny` | `deny` | `deny` | `deny` / `behavior: deny` |
| `REQUIRE_APPROVAL` | `ask` | `ask` | `deny` | no decision (native prompt) |
| Unmapped tool | `ask` | `deny` | `deny` | `deny` |
| Malformed input or policy error | `deny` | `deny` | `deny` | `deny` |

`permiscope hook` remains the Claude Code command for compatibility; pass `cursor` or
`codex` to select another adapter. The CLI never auto-detects the host: an unrecognized
payload shape must not become an implicit allow.

## Limitations

- Hooks do not write audit entries. Use the `ExecutionGateway`, sidecar or MCP wrapper
  when you need signed evidence for the execution itself.
- `ask` requires a human; it does not create a cached approval.
- Hooks run with the user's privileges and can be disabled. Use host permission rules,
  `failClosed` and managed settings where available; use OS isolation for adversarial code.
