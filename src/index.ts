import { PermiscopeAdapter } from './adapters/PermiscopeAdapter';
import { defaultPolicy } from './defaults/defaultPolicy';
import { Policy } from './core/types';

// ============================================
// PRIMARY API - Framework-Agnostic Integration
// ============================================

/**
 * PermiscopeAdapter - The primary way to integrate Permiscope.
 * Wrap your agent, script, or automation with governed execution.
 */
export { PermiscopeAdapter, withPermiscope } from './adapters/PermiscopeAdapter';
export { McpGovernor, defaultMcpPolicy } from './adapters/McpGovernor';
export type {
  McpClientLike,
  McpToolDescriptor,
  McpToolList,
  McpGovernorOptions,
  McpCallResult,
} from './adapters/McpGovernor';
export type { AdapterConfig } from './adapters/PermiscopeAdapter';

// ============================================
// ADVANCED API - For Custom Implementations
// ============================================
export { ExecutionGateway } from './gateway/ExecutionGateway';
export { BudgetTracker } from './gateway/BudgetTracker';
export { IdempotencyCache } from './gateway/IdempotencyCache';
export type {
  Budget,
  BudgetRemaining,
  BudgetCheck,
  BudgetSnapshot,
  BudgetStore,
} from './gateway/BudgetTracker';
export { PolicyEngine } from './engine/PolicyEngine';
export { isPathWithin, resolveGuardedPath } from './engine/pathGuard';
export type { GuardedPathResult } from './engine/pathGuard';
export { withRequestContext, requestContext, requestToken } from './core/requestContext';
export type { RequestContext } from './core/requestContext';
export { defaultPolicy } from './defaults/defaultPolicy';
export { definePolicy, PolicyBuilder, ScopeBuilder } from './policy/builder';
export { createSidecar, startSidecar } from './sidecar/server';
export { verifiedPrincipalProvider, signHs256Token } from './auth/verifiedPrincipal';
export type { JwtVerifierOptions } from './auth/verifiedPrincipal';
export type { SidecarOptions } from './sidecar/server';
export * from './core/types';

// ============================================
// CONVENIENCE HELPERS
// ============================================

/**
 * Quick-start helper for demos and testing.
 * For production, use PermiscopeAdapter directly for more control.
 *
 * @deprecated Prefer `new PermiscopeAdapter(config)` for clarity.
 * This function exists for backward compatibility and quick demos.
 *
 * @example
 * ```typescript
 * // Quick demo:
 * const agent = createAgent();
 * await agent.act('read_file', { path: 'test.txt' });
 *
 * // Recommended production pattern:
 * const permiscope = new PermiscopeAdapter({ policy: myPolicy });
 * await permiscope.act('read_file', { path: 'test.txt' });
 * ```
 */
export function createAgent(config?: {
  policy?: Policy;
  name?: string;
  shadowMode?: boolean;
  executors?: Record<string, (params: any) => Promise<any>>;
  approver?: import('./gateway/ExecutionGateway').Approver;
  principalProvider?: import('./gateway/ExecutionGateway').PrincipalProvider;
  approvalTimeoutMs?: number;
}) {
  return new PermiscopeAdapter({
    policy: config?.policy || defaultPolicy,
    defaultAgentId: config?.name || 'demo-agent',
    shadowMode: config?.shadowMode,
    customExecutors: config?.executors,
    approver: config?.approver,
    principalProvider: config?.principalProvider,
    approvalTimeoutMs: config?.approvalTimeoutMs,
  });
}
