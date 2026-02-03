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

## Best Practices

-   **Intercept Early**: Wrap tool definitions directly so the agent doesn't even "see" raw execution results for blocked actions.
-   **Identify Callers**: Use the `agentId` parameter in `act()` or `wrap()` to distinguish between different units/agents in your system.
-   **Handle Exceptions**: Always wrap calls in `try/catch`. A `BLOCK` or `REJECTED` decision will throw an error, which your agent should handle as "Action failed due to policy."
-   **Fail Closed**: Ensure your agent defaults to a safe state if Permiscope blocks an action.
