---
name: Feature request
about: Propose a new guardrail, integration, or developer experience change
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Problem

What real agent workflow is currently unsafe, awkward, or impossible? Describe the
use case rather than the implementation.

## Who needs it

- Integration: library / sidecar / dashboard / MCP / Python SDK
- Deployment: local development / single machine service / team deployment
- Is this a security boundary change? (yes/no)

## Proposed behavior

Describe the decision or API you want. For policy features, show the intended scope:

```ts
{
  actionName: 'run_command',
  decision: 'ALLOW',
  allowedCommands: ['git status'],
}
```

## Security boundary review

- Does this widen or narrow what an agent can do?
- What is the fail-closed behavior when configuration is missing or invalid?
- Which existing ADR does it extend or supersede?

## Alternatives considered

Include approaches you rejected and why.

## Acceptance criteria

List the regression tests, docs and ADR changes that would make this issue done.
