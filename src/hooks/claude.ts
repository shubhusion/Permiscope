import { Action, Policy } from '../core/types';
import { defaultPolicy } from '../defaults/defaultPolicy';
import { evaluateHookAction, malformedVerdict, unmappedVerdict } from './evaluate';

export interface ClaudeHookInput {
  hookEventName?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  session_id?: string;
}

export type HookDecision = 'allow' | 'deny' | 'ask';

export interface ClaudeHookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: HookDecision;
    permissionDecisionReason: string;
  };
}

const COMMAND_TOOLS = new Set(['Bash', 'PowerShell']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'NotebookRead', 'Glob', 'Grep']);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Translate a Claude Code tool call into a governed action. Unknown tools return null. */
export function mapHookAction(input: ClaudeHookInput, now: Date = new Date()): Action | null {
  const tool = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};
  const base = {
    agentId: input.session_id ?? 'claude-code-hook',
    timestamp: now,
  };

  if (COMMAND_TOOLS.has(tool)) {
    const command = text(toolInput.command);
    return command ? { ...base, actionName: 'run_command', parameters: { command } } : null;
  }
  if (WRITE_TOOLS.has(tool)) {
    const filePath = text(toolInput.file_path);
    return filePath
      ? { ...base, actionName: 'write_file', parameters: { path: filePath, ...toolInput } }
      : null;
  }
  if (READ_TOOLS.has(tool)) {
    const filePath = text(toolInput.file_path) ?? text(toolInput.path);
    return filePath ? { ...base, actionName: 'read_file', parameters: { path: filePath } } : null;
  }
  if (tool === 'WebFetch') {
    const url = text(toolInput.url);
    return url ? { ...base, actionName: 'call_api', parameters: { url } } : null;
  }
  return null;
}

function decision(permissionDecision: HookDecision, reason: string): ClaudeHookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Evaluate Claude Code hook input. Returns null when there is no verdict to
 * report (for example PostToolUse, which is observational). Never returns an
 * implicit allow: unmapped tools require confirmation and parse failures deny.
 */
export async function runHook(
  raw: string,
  policy: Policy = defaultPolicy,
  now: Date = new Date(),
): Promise<ClaudeHookOutput | null> {
  let input: ClaudeHookInput;
  try {
    input = JSON.parse(raw) as ClaudeHookInput;
  } catch {
    const verdict = malformedVerdict('Permiscope could not parse hook input; failing closed');
    return decision(verdict.decision, verdict.reason);
  }
  if (!input || typeof input !== 'object') {
    const verdict = malformedVerdict(
      'Permiscope received a non-object hook payload; failing closed',
    );
    return decision(verdict.decision, verdict.reason);
  }
  if (input.hookEventName === 'PostToolUse') return null;

  const action = mapHookAction(input, now);
  if (!action) {
    const verdict = unmappedVerdict();
    return decision(verdict.decision, verdict.reason);
  }

  const verdict = await evaluateHookAction(action, policy);
  return decision(verdict.decision, verdict.reason);
}
