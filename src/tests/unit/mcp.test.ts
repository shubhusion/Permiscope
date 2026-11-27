import { McpGovernor, defaultMcpPolicy } from '../../adapters/McpGovernor';
import { McpClientLike } from '../../adapters/McpGovernor';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Policy } from '../../core/types';

const stubLogger = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogger;
const stubCache = {
  isApproved: async () => false,
  isRejected: async () => false,
  requestApproval: async () => undefined,
  approve: async () => true,
} as unknown as ApprovalCache;

function client(calls: string[]): McpClientLike {
  return {
    listTools: () => ({
      tools: [
        { name: 'echo', description: 'Echo text', inputSchema: { type: 'object' } },
        { name: 'delete', description: 'Delete a record' },
      ],
    }),
    callTool: async (name, args) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      return { ok: true, name };
    },
  };
}

describe('MCP tool-call governance', () => {
  test('allows governed tools and forwards arguments', async () => {
    const calls: string[] = [];
    const policy: Policy = {
      scopes: [{ actionName: 'mcp:echo', decision: 'ALLOW' }],
    };
    const governor = new McpGovernor({
      client: client(calls),
      policy,
      gatewayOptions: { auditLogger: stubLogger, approvalCache: stubCache },
    });

    const result = await governor.callTool('echo', { text: 'hi' });
    expect(result.isError).toBe(false);
    expect(result.decision).toBe('ALLOW');
    expect(calls).toEqual(['echo:{"text":"hi"}']);
  });

  test('blocks dangerous tools before calling the client', async () => {
    const calls: string[] = [];
    const policy: Policy = {
      scopes: [{ actionName: 'mcp:delete', decision: 'BLOCK' }],
    };
    const governor = new McpGovernor({
      client: client(calls),
      policy,
      gatewayOptions: { auditLogger: stubLogger, approvalCache: stubCache },
    });

    const result = await governor.callTool('delete', { id: 1 });
    expect(result.isError).toBe(true);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('SCOPE_BLOCK');
    expect(calls).toEqual([]);
  });

  test('wildcard policy requires approval and an injected approver can grant it', async () => {
    const calls: string[] = [];
    const governor = new McpGovernor({
      client: client(calls),
      policy: defaultMcpPolicy(),
      gatewayOptions: {
        auditLogger: stubLogger,
        approvalCache: stubCache,
        approver: async () => true,
      },
    });

    const result = await governor.callTool('echo', {});
    expect(result.decision).toBe('ALLOW');
    expect(result.reasonCode).toBe('APPROVAL_GRANTED');
    expect(calls).toHaveLength(1);
  });

  test('validates tool descriptors and tool names', async () => {
    const calls: string[] = [];
    const governor = new McpGovernor({
      client: client(calls),
      policy: defaultMcpPolicy(),
      gatewayOptions: { auditLogger: stubLogger, approvalCache: stubCache },
    });

    await expect(governor.callTool('')).resolves.toMatchObject({
      isError: true,
      reasonCode: 'INVALID_TOOL_NAME',
    });

    const broken = new McpGovernor({
      client: { listTools: () => ({ tools: [{ name: '' }] }), callTool: async () => null },
      policy: defaultMcpPolicy(),
      gatewayOptions: { auditLogger: stubLogger, approvalCache: stubCache },
    });
    await expect(broken.listTools()).rejects.toThrow('Invalid MCP tool descriptor');
  });
});
