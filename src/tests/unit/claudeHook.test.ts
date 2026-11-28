import { mapHookAction, runHook } from '../../hooks/claude';
import { Policy } from '../../core/types';

const FIXED = new Date('2026-11-28T00:00:00.000Z');

function hook(
  tool_name: string,
  tool_input: Record<string, unknown>,
  event = 'PreToolUse',
): string {
  return JSON.stringify({
    hookEventName: event,
    tool_name,
    tool_input,
    session_id: 'test-session',
  });
}

describe('Claude Code hook', () => {
  test('maps shell, file and network tools to governed actions', () => {
    expect(
      mapHookAction({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, FIXED),
    ).toMatchObject({
      actionName: 'run_command',
      parameters: { command: 'npm test' },
    });
    expect(
      mapHookAction({ tool_name: 'Edit', tool_input: { file_path: 'a.txt' } }, FIXED),
    ).toMatchObject({
      actionName: 'write_file',
      parameters: { path: 'a.txt' },
    });
    expect(
      mapHookAction({ tool_name: 'Read', tool_input: { file_path: 'a.txt' } }, FIXED),
    ).toMatchObject({
      actionName: 'read_file',
      parameters: { path: 'a.txt' },
    });
    expect(
      mapHookAction({ tool_name: 'WebFetch', tool_input: { url: 'https://example.com' } }, FIXED),
    ).toMatchObject({
      actionName: 'call_api',
    });
    expect(mapHookAction({ tool_name: 'TodoWrite', tool_input: {} }, FIXED)).toBeNull();
  });

  test('allows an allowlisted command and denies an interpreter escape', async () => {
    const allowed = await runHook(hook('Bash', { command: 'npm test' }));
    expect(allowed?.hookSpecificOutput.permissionDecision).toBe('allow');

    const denied = await runHook(hook('Bash', { command: 'rm -r -f /' }));
    expect(denied?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(denied?.hookSpecificOutput.permissionDecisionReason).toMatch(/GUARDRAIL/);
  });

  test('denies a write outside the allowed roots', async () => {
    const result = await runHook(hook('Write', { file_path: '/etc/passwd', content: 'x' }));
    expect(result?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput.permissionDecisionReason).toMatch(/GUARDRAIL_PATH/);
  });

  test('asks for approval when a scope requires it', async () => {
    const policy: Policy = {
      scopes: [{ actionName: 'run_command', decision: 'REQUIRE_APPROVAL' }],
    };
    const result = await runHook(hook('Bash', { command: 'echo hi' }), policy);
    expect(result?.hookSpecificOutput.permissionDecision).toBe('ask');
  });

  test('unknown tools ask, malformed input denies, PostToolUse is silent', async () => {
    expect((await runHook(hook('TodoWrite', {})))?.hookSpecificOutput.permissionDecision).toBe(
      'ask',
    );
    expect((await runHook('not json'))?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect((await runHook('null'))?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(await runHook(hook('Bash', { command: 'echo hi' }, 'PostToolUse'))).toBeNull();
  });

  test('policy evaluation failures fail closed', async () => {
    const broken: Policy = {
      scopes: [{ actionName: 'run_command', decision: 'ALLOW', allowedCommands: ['echo && rm'] }],
    };
    const result = await runHook(hook('Bash', { command: 'echo hi' }), broken);
    expect(result?.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
