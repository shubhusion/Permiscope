import { Policy } from '../../core/types';
import { mapCursorAction, runCursorHook } from '../../hooks/cursor';

const FIXED = new Date('2026-11-28T00:00:00.000Z');

function hook(event: string, fields: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, ...fields });
}

describe('Cursor hook', () => {
  test('maps shell, file and MCP events to governed actions', () => {
    expect(
      mapCursorAction({ hook_event_name: 'beforeShellExecution', command: 'npm test' }, FIXED),
    ).toMatchObject({ actionName: 'run_command', parameters: { command: 'npm test' } });
    expect(
      mapCursorAction(
        { hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'pwd' } },
        FIXED,
      ),
    ).toMatchObject({ actionName: 'run_command' });
    expect(
      mapCursorAction({ hook_event_name: 'beforeReadFile', file_path: 'package.json' }, FIXED),
    ).toMatchObject({ actionName: 'read_file', parameters: { path: 'package.json' } });
    expect(
      mapCursorAction(
        { hook_event_name: 'preToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.txt' } },
        FIXED,
      ),
    ).toMatchObject({ actionName: 'write_file', parameters: { path: 'a.txt' } });
    expect(
      mapCursorAction(
        {
          hook_event_name: 'beforeMCPExecution',
          tool_name: 'query',
          mcp_server_name: 'db',
          tool_input: '{"sql":"select 1"}',
        },
        FIXED,
      ),
    ).toMatchObject({ actionName: 'call_api', parameters: { serverName: 'db' } });
  });

  test('allows an allowlisted command and denies an interpreter escape', async () => {
    const allowed = await runCursorHook(hook('beforeShellExecution', { command: 'npm test' }));
    expect(allowed?.permission).toBe('allow');

    const denied = await runCursorHook(hook('beforeShellExecution', { command: 'rm -r -f /' }));
    expect(denied?.permission).toBe('deny');
    expect(denied?.user_message).toMatch(/GUARDRAIL_COMMAND_NOT_ALLOWED/);
  });

  test('denies a write outside the allowed roots', async () => {
    const result = await runCursorHook(
      hook('preToolUse', { tool_name: 'Write', tool_input: { file_path: '/etc/passwd' } }),
    );
    expect(result?.permission).toBe('deny');
    expect(result?.user_message).toMatch(/GUARDRAIL_PATH/);
  });

  test('ask is used on dedicated hooks and fails closed on preToolUse', async () => {
    const payload = { file_path: '.env' };
    expect((await runCursorHook(hook('beforeReadFile', payload)))?.permission).toBe('ask');

    const generic = await runCursorHook(
      hook('preToolUse', { tool_name: 'Read', tool_input: payload }),
    );
    expect(generic?.permission).toBe('deny');
    expect(generic?.user_message).toMatch(/before\* hook/);
  });

  test('malformed input and unmapped tools deny; observational events are silent', async () => {
    expect((await runCursorHook('not json'))?.permission).toBe('deny');
    expect((await runCursorHook('null'))?.permission).toBe('deny');
    expect(
      (await runCursorHook(hook('preToolUse', { tool_name: 'Task', tool_input: {} })))?.permission,
    ).toBe('deny');
    expect(await runCursorHook(hook('postToolUse', { tool_name: 'Shell' }))).toBeNull();
  });

  test('policy evaluation failures fail closed', async () => {
    const broken: Policy = {
      scopes: [{ actionName: 'run_command', decision: 'ALLOW', allowedCommands: ['echo && rm'] }],
    };
    const result = await runCursorHook(
      hook('beforeShellExecution', { command: 'echo hi' }),
      broken,
    );
    expect(result?.permission).toBe('deny');
  });
});
