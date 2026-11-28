import { Policy } from '../../core/types';
import { mapCodexAction, runCodexHook } from '../../hooks/codex';

const FIXED = new Date('2026-11-28T00:00:00.000Z');

function hook(event: string, fields: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, ...fields });
}

describe('Codex hook', () => {
  test('maps shell, patch and MCP tools to governed actions', () => {
    expect(
      mapCodexAction({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, FIXED),
    ).toMatchObject({ actionName: 'run_command', parameters: { command: 'npm test' } });
    expect(
      mapCodexAction({ tool_name: 'Write', tool_input: { file_path: 'a.txt' } }, FIXED),
    ).toMatchObject({ actionName: 'write_file', parameters: { path: 'a.txt' } });
    expect(
      mapCodexAction({ tool_name: 'mcp__fs__read_file', tool_input: { path: 'a.txt' } }, FIXED),
    ).toMatchObject({
      actionName: 'call_api',
      parameters: { toolName: 'read_file', serverName: 'fs' },
    });
    // apply_patch without a stable path fails closed rather than guessing.
    expect(
      mapCodexAction({ tool_name: 'apply_patch', tool_input: { command: '***' } }, FIXED),
    ).toBeNull();
  });

  test('allows an allowlisted command and denies an interpreter escape', async () => {
    const allowed = await runCodexHook(
      hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } }),
    );
    expect(allowed?.hookSpecificOutput.permissionDecision).toBe('allow');

    const denied = await runCodexHook(
      hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -r -f /' } }),
    );
    expect(denied?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(denied?.hookSpecificOutput.permissionDecisionReason).toMatch(
      /GUARDRAIL_COMMAND_NOT_ALLOWED/,
    );
  });

  test('approval-required leaves the native permission prompt in place', async () => {
    const policy: Policy = {
      scopes: [{ actionName: 'run_command', decision: 'REQUIRE_APPROVAL' }],
    };
    expect(
      await runCodexHook(
        hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo hi' } }),
        policy,
      ),
    ).toBeNull();
    expect(
      await runCodexHook(
        hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'echo hi' } }),
        policy,
      ),
    ).toBeNull();
  });

  test('PermissionRequest allows and denies by policy', async () => {
    const allowed = await runCodexHook(
      hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test' } }),
    );
    expect(allowed?.hookSpecificOutput.decision?.behavior).toBe('allow');

    const denied = await runCodexHook(
      hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -r -f /' } }),
    );
    expect(denied?.hookSpecificOutput.decision?.behavior).toBe('deny');
  });

  test('malformed input and unmapped tools deny; other events are silent', async () => {
    expect((await runCodexHook('not json'))?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect((await runCodexHook('null'))?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(
      (await runCodexHook(hook('PreToolUse', { tool_name: 'TodoWrite', tool_input: {} })))
        ?.hookSpecificOutput.permissionDecision,
    ).toBe('deny');
    expect(await runCodexHook(hook('PostToolUse', { tool_name: 'Bash' }))).toBeNull();
  });

  test('policy evaluation failures fail closed', async () => {
    const broken: Policy = {
      scopes: [{ actionName: 'run_command', decision: 'ALLOW', allowedCommands: ['echo && rm'] }],
    };
    const result = await runCodexHook(
      hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo hi' } }),
      broken,
    );
    expect(result?.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
