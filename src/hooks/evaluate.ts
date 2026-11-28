import { Action, Policy } from '../core/types';
import { defaultPolicy } from '../defaults/defaultPolicy';
import { PolicyEngine } from '../engine/PolicyEngine';

export type HookVerdictDecision = 'allow' | 'deny' | 'ask';

export interface HookVerdict {
  decision: HookVerdictDecision;
  reason: string;
  reasonCode?: string;
}

/** Shared fail-closed responses for payloads that cannot be mapped to an action. */
export function malformedVerdict(message: string): HookVerdict {
  return { decision: 'deny', reason: message };
}

export function unmappedVerdict(): HookVerdict {
  return {
    decision: 'ask',
    reason: 'Permiscope does not map this tool; confirm the tool call manually',
  };
}

/**
 * Host-agnostic decision logic: one policy engine for every hook adapter.
 * Hosts translate the verdict into their own JSON schema.
 */
export async function evaluateHookAction(
  action: Action,
  policy: Policy = defaultPolicy,
): Promise<HookVerdict> {
  try {
    const result = await new PolicyEngine(policy).evaluateDetailed(action);
    switch (result.decision) {
      case 'ALLOW':
        return {
          decision: 'allow',
          reason: `Permiscope allowed: ${result.reasonCode}`,
          reasonCode: result.reasonCode,
        };
      case 'REQUIRE_APPROVAL':
        return {
          decision: 'ask',
          reason: `Permiscope requires approval: ${result.reasonCode}`,
          reasonCode: result.reasonCode,
        };
      case 'BLOCK':
      case 'SHADOW_BLOCK':
        return {
          decision: 'deny',
          reason: `Permiscope blocked: ${result.reasonCode}`,
          reasonCode: result.reasonCode,
        };
      default:
        return {
          decision: 'deny',
          reason: 'Permiscope received an unknown policy decision; failing closed',
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      decision: 'deny',
      reason: `Permiscope policy evaluation failed; failing closed: ${message}`,
    };
  }
}
