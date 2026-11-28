import { Action, Policy } from '../core/types';
import { defaultPolicy } from '../defaults/defaultPolicy';
import { evaluateHookAction, malformedVerdict } from './evaluate';

export interface CursorHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown> | string;
  command?: string;
  file_path?: string;
  mcp_server_name?: string;
  cwd?: string;
}

export interface CursorHookOutput {
  permission: 'allow' | 'deny' | 'ask';
  user_message: string;
  agent_message: string;
}

const OBSERVATIONAL_EVENTS = new Set([
  'postToolUse',
  'postToolUseFailure',
  'afterShellExecution',
  'afterMCPExecution',
  'afterFileEdit',
  'sessionStart',
  'sessionEnd',
  'preCompact',
  'stop',
]);

const ASK_EVENTS = new Set(['beforeShellExecution', 'beforeReadFile', 'beforeMCPExecution']);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through: an unparseable input object is fail-closed below.
    }
  }
  return {};
}

/** Translate a Cursor hook payload into a governed action. */
export function mapCursorAction(input: CursorHookInput, now: Date = new Date()): Action | null {
  const event = input.hook_event_name ?? '';
  const tool = input.tool_name ?? '';
  const toolInput = object(input.tool_input);
  const base = { agentId: 'cursor-hook', timestamp: now };
  const path = text(toolInput.file_path) ?? text(toolInput.path) ?? text(input.file_path);

  if (event === 'beforeShellExecution' || tool === 'Shell') {
    const command = text(toolInput.command) ?? text(input.command);
    return command ? { ...base, actionName: 'run_command', parameters: { command } } : null;
  }
  if (event === 'beforeReadFile' || tool === 'Read' || tool === 'Grep') {
    return path ? { ...base, actionName: 'read_file', parameters: { path } } : null;
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'Delete') {
    return path ? { ...base, actionName: 'write_file', parameters: { path } } : null;
  }
  if (event === 'beforeMCPExecution' || tool.startsWith('MCP:')) {
    return {
      ...base,
      actionName: 'call_api',
      parameters: {
        toolName: tool,
        serverName: input.mcp_server_name ?? text(toolInput.mcp_server_name) ?? '',
        input: toolInput,
      },
    };
  }
  return null;
}

function output(permission: CursorHookOutput['permission'], reason: string): CursorHookOutput {
  return { permission, user_message: reason, agent_message: reason };
}

/**
 * Evaluate Cursor hook input. Returns null for observational events, which
 * have no permission decision to report.
 */
export async function runCursorHook(
  raw: string,
  policy: Policy = defaultPolicy,
  now: Date = new Date(),
): Promise<CursorHookOutput | null> {
  let input: CursorHookInput;
  try {
    input = JSON.parse(raw) as CursorHookInput;
  } catch {
    const verdict = malformedVerdict('Permiscope could not parse hook input; failing closed');
    return output('deny', verdict.reason);
  }
  if (!input || typeof input !== 'object') {
    const verdict = malformedVerdict(
      'Permiscope received a non-object hook payload; failing closed',
    );
    return output('deny', verdict.reason);
  }
  if (OBSERVATIONAL_EVENTS.has(input.hook_event_name ?? '')) return null;

  const event = input.hook_event_name ?? '';
  const action = mapCursorAction(input, now);
  if (!action) {
    // Cursor only enforces `ask` on the dedicated before* hooks. On preToolUse
    // it would silently continue, so an unmapped tool must deny.
    return output('deny', 'Permiscope does not map this tool; failing closed');
  }

  const verdict = await evaluateHookAction(action, policy);
  if (verdict.decision === 'ask' && !ASK_EVENTS.has(event)) {
    return output('deny', `${verdict.reason}. Use a dedicated before* hook to ask for approval`);
  }
  return output(verdict.decision, verdict.reason);
}
