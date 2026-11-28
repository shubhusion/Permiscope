import { Action, Policy } from '../core/types';
import { defaultPolicy } from '../defaults/defaultPolicy';
import { evaluateHookAction, malformedVerdict } from './evaluate';

export interface CodexHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  session_id?: string;
}

export interface CodexHookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse' | 'PermissionRequest';
    permissionDecision?: 'allow' | 'deny';
    permissionDecisionReason?: string;
    decision?: { behavior: 'allow' | 'deny'; message?: string };
  };
}

const OBSERVATIONAL_EVENTS = new Set([
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'Interrupt',
  'SessionStart',
  'SessionEnd',
  'PreModelRequest',
  'PostModelRequest',
]);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Translate a Codex tool call into a governed action. */
export function mapCodexAction(input: CodexHookInput, now: Date = new Date()): Action | null {
  const tool = input.tool_name ?? '';
  const toolInput = object(input.tool_input);
  const base = { agentId: input.session_id ?? 'codex-hook', timestamp: now };

  if (tool === 'Bash') {
    const command = text(toolInput.command);
    return command ? { ...base, actionName: 'run_command', parameters: { command } } : null;
  }
  if (tool === 'apply_patch' || tool === 'Edit' || tool === 'Write') {
    const path = text(toolInput.file_path) ?? text(toolInput.path);
    // apply_patch sequences do not carry a stable path; fail closed instead of
    // guessing which file the patch would change.
    return path ? { ...base, actionName: 'write_file', parameters: { path } } : null;
  }
  if (tool.startsWith('mcp__')) {
    const [server = '', ...rest] = tool.slice(5).split('__');
    return {
      ...base,
      actionName: 'call_api',
      parameters: { toolName: rest.join('__'), serverName: server, input: toolInput },
    };
  }
  return null;
}

function denyOutput(event: 'PreToolUse' | 'PermissionRequest', reason: string): CodexHookOutput {
  return event === 'PreToolUse'
    ? {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }
    : {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'deny', message: reason },
        },
      };
}

function allowOutput(event: 'PreToolUse' | 'PermissionRequest'): CodexHookOutput {
  return event === 'PreToolUse'
    ? {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      }
    : {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'allow' },
        },
      };
}

/**
 * Evaluate Codex hook input. Returns null when Codex should use its native
 * permission flow, including for REQUIRE_APPROVAL (Codex does not support
 * `ask` on PreToolUse).
 */
export async function runCodexHook(
  raw: string,
  policy: Policy = defaultPolicy,
  now: Date = new Date(),
): Promise<CodexHookOutput | null> {
  let input: CodexHookInput;
  try {
    input = JSON.parse(raw) as CodexHookInput;
  } catch {
    const verdict = malformedVerdict('Permiscope could not parse hook input; failing closed');
    return denyOutput('PreToolUse', verdict.reason);
  }
  if (!input || typeof input !== 'object') {
    const verdict = malformedVerdict(
      'Permiscope received a non-object hook payload; failing closed',
    );
    return denyOutput('PreToolUse', verdict.reason);
  }
  if (OBSERVATIONAL_EVENTS.has(input.hook_event_name ?? '')) return null;

  const event: 'PreToolUse' | 'PermissionRequest' =
    input.hook_event_name === 'PermissionRequest' ? 'PermissionRequest' : 'PreToolUse';
  const action = mapCodexAction(input, now);
  if (!action) return denyOutput(event, 'Permiscope does not map this tool; failing closed');

  const verdict = await evaluateHookAction(action, policy);
  if (verdict.decision === 'deny') return denyOutput(event, verdict.reason);
  // Codex does not support `ask` here; no decision leaves the human prompt in place.
  if (verdict.decision === 'ask') return null;
  return allowOutput(event);
}
