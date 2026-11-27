import { ExecutionGateway, GatewayOptions } from '../gateway/ExecutionGateway';
import { PolicyEngine } from '../engine/PolicyEngine';
import { Action, PermissionDecision, Policy } from '../core/types';

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolList {
  tools: McpToolDescriptor[];
}

export interface McpClientLike {
  listTools?: () => Promise<McpToolList> | McpToolList;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface McpGovernorOptions {
  client: McpClientLike;
  policy: Policy;
  gatewayOptions?: GatewayOptions;
  principalId?: string;
}

export interface McpCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
  decision: PermissionDecision;
  reasonCode?: string;
}

/** Governs MCP `tools/call` through the same policy and audit path as other actions. */
export class McpGovernor {
  private client: McpClientLike;
  private gateway: ExecutionGateway;
  private principalId: string;

  constructor(options: McpGovernorOptions) {
    this.client = options.client;
    this.principalId =
      options.principalId ?? options.gatewayOptions?.defaultPrincipalId ?? 'mcp-client';
    this.gateway = new ExecutionGateway(
      new PolicyEngine(options.policy),
      {},
      {
        ...options.gatewayOptions,
        defaultPrincipalId: this.principalId,
      },
    );
  }

  async listTools(): Promise<McpToolList> {
    if (!this.client.listTools) return { tools: [] };
    const result = await this.client.listTools();
    if (!result || !Array.isArray(result.tools)) throw new Error('Invalid MCP tool list');
    for (const tool of result.tools) {
      if (!tool || typeof tool.name !== 'string' || tool.name.length === 0) {
        throw new Error('Invalid MCP tool descriptor');
      }
      if (tool.inputSchema !== undefined && typeof tool.inputSchema !== 'object') {
        throw new Error(`Invalid input schema for MCP tool ${tool.name}`);
      }
    }
    return result;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    if (typeof name !== 'string' || name.length === 0) {
      return this.error('BLOCK', 'INVALID_TOOL_NAME', 'Tool name must be a non-empty string');
    }

    const action: Action = {
      actionName: `mcp:${name}`,
      parameters: { toolName: name, arguments: args },
      agentId: this.principalId,
      timestamp: new Date(),
    };

    const result = await this.gateway.run(action, false, async () =>
      this.client.callTool(name, args),
    );
    if (!result.success) {
      return this.error(
        result.decision,
        result.reasonCode,
        result.error ?? 'Governed action was blocked',
      );
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result.output ?? null) }],
      isError: false,
      decision: result.decision,
      reasonCode: result.reasonCode,
    };
  }

  private error(
    decision: PermissionDecision,
    reasonCode: string | undefined,
    message: string,
  ): McpCallResult {
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
      decision,
      reasonCode,
    };
  }
}

/** Default policy: all MCP tools require approval unless a scope overrides them. */
export function defaultMcpPolicy(): Policy {
  return {
    scopes: [{ actionName: 'mcp:*', decision: 'REQUIRE_APPROVAL' }],
  };
}
