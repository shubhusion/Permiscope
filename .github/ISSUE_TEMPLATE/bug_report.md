---
name: Bug report
about: Report incorrect policy decisions, crashes, or documentation drift
title: '[BUG] '
labels: bug
assignees: ''
---

## What happened

Describe the incorrect behavior in one or two sentences.

## Minimal reproduction

Provide the smallest policy and action that reproduce it. For policy bugs, a snippet
like this is ideal:

```ts
const engine = new PolicyEngine({ scopes: [/* ... */] });
await engine.evaluate({
  actionName: 'run_command',
  parameters: { command: '...' },
  agentId: 'repro',
  timestamp: new Date(),
});
```

For HTTP/dashboard bugs, include the request, headers and response status.

## Expected vs actual

| | Result |
|---|---|
| Expected decision / response | |
| Actual decision / response | |
| `reasonCode` (if available) | |

## Environment

- Permiscope version: (e.g. 2.1.0)
- Node.js version: 24.x or 26.x
- OS: Windows / macOS / Linux
- Integration: library / sidecar / dashboard / MCP / Python SDK

## Security impact

Does this allow an action that policy should deny? If yes, **do not post a public
reproduction** — use private vulnerability reporting per `SECURITY.md` and link only a
redacted description here.

## Additional context

Logs, screenshots, or related issues. Remove credentials and bearer tokens.
