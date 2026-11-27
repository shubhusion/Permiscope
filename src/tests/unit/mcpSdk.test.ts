import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { McpGovernor } from '../../adapters/McpGovernor';
import { ApprovalCache } from '../../gateway/ApprovalCache';
import { AuditLogger } from '../../logging/AuditLogger';
import { Policy } from '../../core/types';

const auditLogger = { log: async () => undefined } as unknown as AuditLogger;
const approvalCache = { isApproved: async () => false } as unknown as ApprovalCache;

function asGovernorClient(client: Client) {
  return {
    listTools: () => client.listTools(),
    callTool: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }),
  };
}

const openConnections: Array<Client | McpServer> = [];

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((item) => item.close()));
});

async function realClient(): Promise<{ client: Client; server: McpServer; calls: string[] }> {
  const calls: string[] = [];
  const server = new McpServer({ name: 'permiscope-test-server', version: '1.0.0' });
  server.tool('echo', { text: z.string() }, async ({ text }) => {
    calls.push(text);
    return { content: [{ type: 'text', text }] };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'permiscope-test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  openConnections.push(client, server);
  return { client, server, calls };
}

describe('MCP SDK integration', () => {
  test('governor lists tools from a real SDK server', async () => {
    const { client } = await realClient();
    const governor = new McpGovernor({
      client: asGovernorClient(client),
      policy: { scopes: [{ actionName: 'mcp:echo', decision: 'ALLOW' }] },
      gatewayOptions: { auditLogger, approvalCache },
    });
    const tools = await governor.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain('echo');
  });

  test('governor forwards a governed call to the real tool', async () => {
    const { client, calls } = await realClient();
    const governor = new McpGovernor({
      client: asGovernorClient(client),
      policy: { scopes: [{ actionName: 'mcp:echo', decision: 'ALLOW' }] },
      gatewayOptions: { auditLogger, approvalCache },
    });
    const result = await governor.callTool('echo', { text: 'hello-mcp' });
    expect(result.isError).toBe(false);
    expect(result.decision).toBe('ALLOW');
    expect(calls).toEqual(['hello-mcp']);
  });

  test('a blocked tool never reaches the real server', async () => {
    const { client, calls } = await realClient();
    const policy: Policy = { scopes: [{ actionName: 'mcp:echo', decision: 'BLOCK' }] };
    const governor = new McpGovernor({
      client: asGovernorClient(client),
      policy,
      gatewayOptions: { auditLogger, approvalCache },
    });
    const result = await governor.callTool('echo', { text: 'should-not-run' });
    expect(result.isError).toBe(true);
    expect(result.decision).toBe('BLOCK');
    expect(calls).toEqual([]);
  });
});
