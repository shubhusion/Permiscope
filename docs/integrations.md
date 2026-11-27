# Framework Integrations

Permiscope is designed as a **framework-agnostic trust layer**. It does not create agents itself; instead, it provides a secure gateway to govern the actions of **any** autonomous system.

## Integration Philosophy

1.  **Lightweight Interception**: Don't rewrite your agent. Simply wrap the point where it interacts with the real world (files, commands, APIs).
2.  **Flexible Patterns**: Use `PermiscopeAdapter.act()` for centralized loops, or `wrap()`/`withPermiscope()` for functional integration.
3.  **Audit First**: Even in non-agent scripts, Permiscope provides a tamper-proof audit trail of system-level activities.

---

## 🔗 LangChain

LangChain agents use "Tools" to interact with environments. You can wrap any Tool's executor function with Permiscope.

### Example
```typescript
import { withPermiscope } from 'permiscope';

const safeTool = new Tool({
  name: "search",
  description: "Search the web",
  func: withPermiscope("search_api", async (input) => {
    // Original tool logic
    return await webSearch(input);
  })
});
```
See [examples/integrations/langchain.ts](../examples/integrations/langchain.ts) for a full implementation.

---

## 🤖 CrewAI

In multi-agent systems, you can route every task through Permiscope while preserving the identity of the specific agent performing the action.

### Example
```typescript
const permiscope = new PermiscopeAdapter();

// Inside your execution loop
const result = await permiscope.act(
  task.action, 
  task.params, 
  task.agent.role // agentId in the audit log
);
```
See [examples/integrations/crewai.ts](../examples/integrations/crewai.ts) for a multi-agent governance example.

---

## 🔁 Custom Agent Loops

If you have a bespoke `while(true)` agent cycle, use Permiscope as the single exit point for all side effects.

### Example
```typescript
for (const step of plan) {
  // Wrap and govern the step
  const result = await permiscope.act(step.action, step.params);
}
```
See [examples/integrations/custom-loop.ts](../examples/integrations/custom-loop.ts).

---

## ⚙️ Workflow Runners & Automations

Permiscope is not limited to "agents." Use it to govern CI/CD bots, internal scripts, or any automated process where auditability and human-in-the-loop are required.

### Example
```typescript
const safeDeploy = withPermiscope('deploy', async (params) => {
  // Deployment logic
});

await safeDeploy({ env: 'production' }); // Triggers approval workflow
```
See [examples/integrations/workflow-runner.ts](../examples/integrations/workflow-runner.ts).

---

## Language-Agnostic Sidecar

For agent stacks that are not Node.js, run Permiscope as a loopback HTTP service.
It requires a bearer token, binds to `127.0.0.1` by default, validates JSON bodies
with zod, caps request size at 64 KB, and never waits for interactive approval.

```bash
PERMISCOPE_SIDECAR_TOKEN=dev-token npx permiscope serve
# optional: PERMISCOPE_SIDECAR_HOST / PERMISCOPE_SIDECAR_PORT
```

Endpoints (all except `/health` require `Authorization: Bearer <token>`):

| Endpoint | Body | Response |
|---|---|---|
| `POST /v1/decide` | `{ actionName, parameters?, reason? }` | `{ decision }` |
| `POST /v1/execute` | `{ actionName, parameters?, reason? }` | `{ decision, success, output?, error? }` |
| `GET /health` | — | `{ status: "ok" }` |

Python clients need no third-party packages — see [python/README.md](../python/README.md).
Non-loopback binding is refused unless the sidecar is created programmatically with
`allowRemote: true`, and should only be done behind TLS with a strong token.

---

## MCP tool calls

`McpGovernor` decorates an MCP client-like object and routes every `tools/call`
through the gateway. Tool names are mapped to actions as `mcp:<toolName>`, so a
policy scope can govern a single tool or all tools with `mcp:*`.

```typescript
import { McpGovernor, defaultMcpPolicy } from 'permiscope';

const governor = new McpGovernor({
  client: mcpClient,           // { listTools?, callTool }
  policy: defaultMcpPolicy(),  // all tools require approval by default
  principalId: 'agent-001',
});

const result = await governor.callTool('read_file', { path: 'config.json' });
if (result.isError) console.error(result.content[0].text);
```

The default policy requires approval for every tool; override with specific scopes
(`mcp:read_file`) or a broader wildcard (`mcp:*`). Results follow MCP's shape
(`content`, `isError`) and include the decision and reason code. Governed calls are
written to the audit chain like any other action.

---

## Best Practices

-   **Intercept Early**: Wrap tool definitions directly so the agent doesn't even "see" raw execution results for blocked actions.
-   **Identify Callers**: Supply a `principalProvider` in the adapter config. Caller-provided `agentId` values are not trusted for approval identity.
-   **Handle Exceptions**: Always wrap calls in `try/catch`. A `BLOCK` or `REJECTED` decision will throw an error, which your agent should handle as "Action failed due to policy."
-   **Fail Closed**: Ensure your agent defaults to a safe state if Permiscope blocks an action.
