import { PolicyEngine } from '../engine/PolicyEngine';
import { ExecutionGateway, ActionExecutor } from '../gateway/ExecutionGateway';
import { Policy, Action } from '../core/types';
import { defaultPolicy } from '../defaults/defaultPolicy';

export interface AdapterConfig {
  policy?: Policy;
  defaultAgentId?: string;
  shadowMode?: boolean;
  customExecutors?: Record<string, ActionExecutor>;
}

/**
 * PermiscopeAdapter - The primary integration point for governing execution.
 * 
 * Use this to wrap any agent, script, or autonomous system.
 * Permiscope does NOT create agents; it governs what they can do.
 * 
 * @example
 * ```typescript
 * const permiscope = new PermiscopeAdapter({ policy: myPolicy });
 * const result = await permiscope.act('read_file', { path: 'config.json' });
 * ```
 */
export class PermiscopeAdapter {
  private engine: PolicyEngine;
  private gateway: ExecutionGateway;
  private defaultAgentId: string;
  private shadowMode: boolean;

  constructor(config: AdapterConfig = {}) {
    this.engine = new PolicyEngine(config.policy || defaultPolicy);
    this.gateway = new ExecutionGateway(this.engine, config.customExecutors);
    this.defaultAgentId = config.defaultAgentId || 'external-system';
    this.shadowMode = config.shadowMode || false;
  }

  /**
   * Execute an action through the trust layer.
   * @param actionName The type of action (e.g., 'run_command', 'write_file')
   * @param params Dictionary of parameters
   * @param agentId Optional identifier for the calling system
   * @returns Promise resolving to the output or throwing an error if blocked/failed.
   */
  async act(actionName: string, params: Record<string, any>, agentId?: string): Promise<any> {
    const action: Action = {
      actionName: actionName as any,
      parameters: params,
      agentId: agentId || this.defaultAgentId,
      timestamp: new Date(),
    };

    if (this.shadowMode) {
      (action as any).shadowMode = true;
    }

    const result = await this.gateway.run(action);

    if (!result.success) {
      throw new Error(
        `Permiscope Blocked Action: ${result.decision} - ${result.error || 'Policy Violation'}`,
      );
    }

    return result.output;
  }

  /**
   * Wrap an executor function with Permiscope governance.
   * Use this to integrate with any framework or custom agent loop.
   * 
   * @param actionName The action type to govern
   * @param executor The function to wrap
   * @returns A governed version of the executor
   * 
   * @example
   * ```typescript
   * const safeReadFile = permiscope.wrap('read_file', async (params) => {
   *   return fs.readFileSync(params.path, 'utf-8');
   * });
   * await safeReadFile({ path: 'config.json' });
   * ```
   */
  wrap<T>(
    actionName: string,
    executor: (params: Record<string, any>) => Promise<T>
  ): (params: Record<string, any>, agentId?: string) => Promise<T> {
    return async (params: Record<string, any>, agentId?: string): Promise<T> => {
      // First, check policy
      const action: Action = {
        actionName: actionName as any,
        parameters: params,
        agentId: agentId || this.defaultAgentId,
        timestamp: new Date(),
      };

      const decision = await this.engine.evaluate(action);

      if (decision === 'BLOCK') {
        throw new Error(`Permiscope Blocked Action: ${actionName} - Policy Violation`);
      }

      if (decision === 'REQUIRE_APPROVAL') {
        // Go through full gateway flow for approval
        const result = await this.gateway.run(action);
        if (!result.success) {
          throw new Error(`Permiscope Blocked Action: ${result.decision} - ${result.error}`);
        }
        // After approval, execute the custom executor
        return executor(params);
      }

      // ALLOW - execute directly
      return executor(params);
    };
  }

  /**
   * Get the underlying gateway for advanced usage
   */
  getGateway(): ExecutionGateway {
    return this.gateway;
  }

  /**
   * Get the policy engine for advanced usage
   */
  getPolicyEngine(): PolicyEngine {
    return this.engine;
  }
}

/**
 * Quick utility to create a governed executor function.
 * Framework-agnostic helper for wrapping any function with Permiscope.
 * 
 * @param actionName The action type
 * @param executor The function to govern
 * @param config Optional adapter configuration
 * @returns A governed version of the executor
 * 
 * @example
 * ```typescript
 * const safeDelete = withPermiscope('delete_file', async (params) => {
 *   fs.unlinkSync(params.path);
 * }, { policy: strictPolicy });
 * 
 * await safeDelete({ path: '/tmp/file.txt' });
 * ```
 */
export function withPermiscope<T>(
  actionName: string,
  executor: (params: Record<string, any>) => Promise<T>,
  config?: AdapterConfig
): (params: Record<string, any>, agentId?: string) => Promise<T> {
  const adapter = new PermiscopeAdapter(config);
  return adapter.wrap(actionName, executor);
}
