# Custom Executors

Permiscope allows registering custom action handlers for extending functionality.

## Overview

Built-in executors handle `read_file`, `write_file`, and `run_command`. For other actions, register custom executors.

## Registering an Executor

```typescript
import { ExecutionGateway } from 'permiscope';

const gateway = new ExecutionGateway(policy);

// Register a custom executor
gateway.registerExecutor('call_api', async (action) => {
  const { url, method, body } = action.parameters;
  
  const response = await fetch(url, {
    method: method || 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' }
  });
  
  return {
    success: response.ok,
    output: await response.text(),
    error: response.ok ? undefined : response.statusText
  };
});
```

## Executor Interface

```typescript
type Executor = (action: Action) => Promise<ExecutorResult>;

interface ExecutorResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

## Policy for Custom Actions

```typescript
const policy = {
  scopes: [
    {
      actionName: 'call_api',
      decision: 'ALLOW',
      validator: (action) => {
        const url = action.parameters.url || '';
        // Only allow internal APIs
        return url.startsWith('https://api.internal.com');
      }
    },
    {
      actionName: 'call_api',
      decision: 'BLOCK' // Block all other APIs
    }
  ]
};
```

## Built-in Executors Reference

| Action | Parameters | Behavior |
|--------|------------|----------|
| `read_file` | `{ path: string }` | Returns file contents |
| `write_file` | `{ path: string, content: string }` | Writes content to file |
| `run_command` | `{ command: string }` | Executes shell command |

## Best Practices

### 1. Fail-Closed

Always handle errors gracefully:

```typescript
gateway.registerExecutor('my_action', async (action) => {
  try {
    // ... execution logic
    return { success: true, output: result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});
```

### 2. Validate Parameters

Check required parameters before executing:

```typescript
gateway.registerExecutor('send_email', async (action) => {
  const { to, subject, body } = action.parameters;
  
  if (!to || !subject) {
    return { success: false, error: 'Missing required parameters' };
  }
  
  // ... send email
});
```

### 3. Timeouts

Implement timeouts for external calls:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeout);
}
```

### 4. Avoid Side Effects in Dry-Run

Executors are not called in dry-run mode, but if implementing custom logic, check:

```typescript
if (action.dryRun) {
  return { success: true, output: '[DRY RUN]' };
}
```

## Security Considerations

| Risk | Mitigation |
|------|------------|
| External API calls | Use allowlist in policy validator |
| Credentials exposure | Store secrets in environment, not parameters |
| Rate limiting | Implement throttling in executor |
| Injection | Sanitize all parameters |
