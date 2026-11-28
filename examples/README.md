# Example hook configurations

These are ready-to-copy configs for the native hook adapters. They use the published
`permiscope` CLI, so no repository checkout is required.

> Hooks are cooperative governance, not a sandbox. They can deny a tool call but cannot
> override a host's deny rule, and they do not write signed audit entries. Use the
> `ExecutionGateway`, sidecar or MCP wrapper when you need signed evidence.

## Install

```bash
npm install -g permiscope@2.1.0
# or use npx without installing: npx -y permiscope@2.1.0 hook ...
```

The default policy allows only `echo`, `pwd`, `git status`, `git diff`, `git log`,
`git show`, `git rev-parse` and `npm test`, and confines file actions to the workspace
and temp directories. See the [policy engine docs](../docs/policy-engine.md) to extend it.

## Claude Code

Copy [`claude-code/settings.json`](./claude-code/settings.json) to your project's
`.claude/settings.json`, or merge the `hooks.PreToolUse` entry into the existing file.
Run `/hooks` in Claude Code to inspect the result.

## Cursor

Copy [`cursor/hooks.json`](./cursor/hooks.json) to your project's `.cursor/hooks.json`.
Project hooks run from the project root and require a trusted workspace. `failClosed: true`
makes hook crashes and timeouts block the action instead of failing open. `ask` is only
enforced on the dedicated `before*` hooks; on `preToolUse` an approval requirement is
denied instead.

## Codex

Copy [`codex/hooks.json`](./codex/hooks.json) to `.codex/hooks.json` in a trusted project
layer (or `$CODEX_HOME/hooks.json` for user scope). Open `/hooks` in the Codex CLI and
review/trust the new hook before it runs. Codex does not support `ask` on `PreToolUse`, so
approval-required calls return no decision and use the normal prompt.

## Verify a hook without the agent

Each adapter reads one JSON object on stdin and writes one JSON object on stdout (or
nothing when it has no verdict):

```bash
echo '{"hook_event_name":"beforeShellExecution","command":"npm test"}' \
  | npx -y permiscope@2.1.0 hook cursor

echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -r -f /"}}' \
  | npx -y permiscope@2.1.0 hook codex
```

Expected: the first returns `permission: "allow"`; the second returns a `deny` decision
with `GUARDRAIL_COMMAND_NOT_ALLOWED`.

Full setup details and the shared decision table are in [docs/hooks.md](../docs/hooks.md).
