import { PolicyEngine } from '../engine/PolicyEngine';
import { ExecutionGateway, ActionExecutor } from '../gateway/ExecutionGateway';
import { Policy, Action } from '../core/types';

export interface AdapterConfig {
  policy: Policy;
  defaultAgentId?: string;
  shadowMode?: boolean;
  customExecutors?: Record<string, ActionExecutor>;
}

export class PermiscopeAdapter {
  private engine: PolicyEngine;
  private gateway: ExecutionGateway;
  private defaultAgentId: string;
  private shadowMode: boolean;

  constructor(config: AdapterConfig) {
    this.engine = new PolicyEngine(config.policy);
    this.gateway = new ExecutionGateway(this.engine, config.customExecutors);
    this.defaultAgentId = config.defaultAgentId || 'permiscope-agent';
    this.shadowMode = config.shadowMode || false;
  }

  /**
   * Simplified execution method.
   * @param actionName The type of action (e.g., 'run_command', 'write_file')
   * @param params dictionary of parameters
   * @param agentId Optional overriding agent ID
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
   * Get the underlying gateway if advanced usage is needed
   */
  getGateway(): ExecutionGateway {
    return this.gateway;
  }
}
