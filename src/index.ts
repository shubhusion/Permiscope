import { PermiscopeAdapter } from './adapters/PermiscopeAdapter';
import { defaultPolicy } from './defaults/defaultPolicy';
import { Policy } from './core/types';

// Export Core Classes for advanced users
export { PermiscopeAdapter } from './adapters/PermiscopeAdapter';
export { ExecutionGateway } from './gateway/ExecutionGateway';
export { PolicyEngine } from './engine/PolicyEngine';
export * from './core/types';

/**
 * Zere-config entry point.
 * Creates a safe, authenticated agent wrapper ready to use.
 * 
 * @param config Optional configuration updates
 */
export function createAgent(config?: {
    policy?: Policy,
    name?: string,
    shadowMode?: boolean,
    executors?: Record<string, (params: any) => Promise<any>>
}) {
    return new PermiscopeAdapter({
        policy: config?.policy || defaultPolicy,
        defaultAgentId: config?.name || 'safe-agent',
        shadowMode: config?.shadowMode,
        customExecutors: config?.executors
    });
}
