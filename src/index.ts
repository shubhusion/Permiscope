import { PermiscopeAdapter, withPermiscope } from './adapters/PermiscopeAdapter';
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
export type { AdapterConfig } from './adapters/PermiscopeAdapter';

// ============================================
// ADVANCED API - For Custom Implementations
// ============================================
export { ExecutionGateway } from './gateway/ExecutionGateway';
export { PolicyEngine } from './engine/PolicyEngine';
export { defaultPolicy } from './defaults/defaultPolicy';
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
}) {
  return new PermiscopeAdapter({
    policy: config?.policy || defaultPolicy,
    defaultAgentId: config?.name || 'demo-agent',
    shadowMode: config?.shadowMode,
    customExecutors: config?.executors,
  });
}
