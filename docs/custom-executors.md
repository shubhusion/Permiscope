# Custom Executors

Built-in executors handle `read_file`, `write_file` and `run_command`. To support other
actions, pass a map of executors to the `ExecutionGateway` constructor (or set
`customExecutors` on `PermiscopeAdapter`).

## Registering an executor

```typescript
import { ExecutionGateway, PolicyEngine } from 'permiscope';

const engine = new PolicyEngine(policy);
const gateway = new ExecutionGateway(engine, {
  call_api: async (params) => {
    const response = await fetch(params.url, {
      method: params.method ?? 'GET',
      body: params.body ? JSON.stringify(params.body) : undefined,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  },
});
```

There is no `gateway.registerExecutor()` method. Executors are supplied at construction
time so that every governed call has exactly one execution path.

## Executor interface

```typescript
type ActionExecutor = (params: Record<string, any>) => Promise<any>;
```

The executor receives `action.parameters` and returns the output value directly.
Throwing marks the action unsuccessful with `success: false` and the error message.

## Policy for custom actions

Use `when` for applicability and `guard` for hard denial. A `guard` that returns false
blocks even if a later ALLOW scope matches.

```typescript
const policy = {
  scopes: [
    {
      actionName: 'call_api',
      decision: 'ALLOW',
      guard: (action) => String(action.parameters.url || '').startsWith('https://api.internal.com'),
    },
  ],
};
```

## Built-in executors

| Action | Parameters | Behavior |
|--------|------------|----------|
| `read_file` | `{ path: string }` | async read via `fs.promises.readFile` |
| `write_file` | `{ path: string, content: string }` | async write via `fs.promises.writeFile` |
| `run_command` | `{ command: string, timeoutMs?, maxOutputBytes? }` | AST-parsed argv, `spawn` without a shell |

## Best practices

### Fail closed

```typescript
const gateway = new ExecutionGateway(engine, {
  my_action: async (params) => {
    if (!params.target) throw new Error('Missing target');
    return doWork(params.target);
  },
});
```

### Validate parameters

Check required parameters before executing; a throw is reported as a failed action.

### Timeouts

Implement timeouts for external calls, for example with `AbortController`.

### Dry run

Executors are not called when `gateway.run(action, true)` is used.

## Security considerations

| Risk | Mitigation |
|------|------------|
| External API calls | Allowlist URLs with a policy `guard` |
| Credentials exposure | Store secrets in the environment, not in parameters |
| Rate limiting | Use a shared `BudgetTracker` store or throttle in the executor |
| Injection | Use AST-parsed commands; never concatenate parameters into a shell string |
