# Frequently Asked Questions

## General

### What is Permiscope?

Permiscope is a trust layer for AI agents. It mediates all actions an agent wants to perform, enforcing policies, requiring approvals for sensitive operations, and maintaining an audit trail.

### Is Permiscope a sandbox?

**No.** Permiscope is a mediation layer, not a sandbox. It intercepts API calls but does not provide process isolation. An agent that directly imports Node.js modules can bypass Permiscope.

### Can Permiscope stop malicious code?

Only if the code uses Permiscope's APIs. Malicious code that uses `require('fs')` or `child_process` directly will not be intercepted. For true isolation, use OS-level sandboxing.

### Does Permiscope replace IAM?

No. Permiscope operates at the application level, controlling what AI agents can do. IAM (AWS, GCP, etc.) controls what the application itself can access. They are complementary.

## Integration

### How do I add Permiscope to my project?

```bash
npm install permiscope
```

```typescript
import { createAgent } from 'permiscope';

const agent = createAgent();
await agent.act('read_file', { path: 'data.json' });
```

### Can I use custom action types?

Yes. Register custom executors:

```typescript
gateway.registerExecutor('my_action', async (action) => {
  // Your logic here
  return { success: true, output: 'result' };
});
```

### How do I define policies?

Policies are TypeScript objects:

```typescript
const policy = {
  scopes: [
    { actionName: 'read_file', decision: 'ALLOW' },
    { actionName: 'write_file', decision: 'REQUIRE_APPROVAL' },
    { actionName: 'run_command', decision: 'BLOCK' }
  ]
};
```

## Security

### What happens if the audit secret is not set?

Logs are hashed with SHA-256 (no HMAC). This detects accidental tampering but not by someone with file access. **Always set `PERMISCOPE_AUDIT_SECRET` in production.**

### How do I verify log integrity?

```typescript
const logger = new AuditLogger('./logs');
const result = logger.verifyChain();
console.log(result.valid, result.errors);
```

### What if someone deletes the log file?

The chain starts fresh from genesis. There is no external attestation that logs existed. Consider backup/archive procedures.

## Performance

### Can Permiscope scale?

For single-machine deployments with moderate agent activity, yes. High-volume deployments may hit file locking bottlenecks. Consider:
- Database-backed storage (extension needed)
- Distributed logging (external service)

### Does locking impact performance?

Minimally for typical usage. Locks are held briefly during I/O. Under high contention, agents may wait.

## Approvals

### How long do approvals last?

Default TTL is 1 hour. Configurable:

```typescript
const cache = new ApprovalCache('./data', 30 * 60 * 1000); // 30 min
```

### Can I approve via the Dashboard?

Yes. Navigate to `http://localhost:3000`, set `PERMISCOPE_DASHBOARD_TOKEN`, and approve/reject pending requests.

### What happens if approval times out?

The action remains pending until approved or rejected. The agent may timeout waiting.

## Troubleshooting

### Why is my action blocked?

1. No matching scope → Default deny
2. Path outside `allowedPaths`
3. Command matches `blockedCommandPatterns`
4. Validator returned false
5. Validator threw an error

### Why isn't my validator running?

Validators only run for scopes that match the action name. Check the `actionName` field.

### Dashboard shows 401 error?

Set `PERMISCOPE_DASHBOARD_TOKEN` environment variable and include in request headers.

### Logs aren't appearing?

Check:
- `./logs/audit.log` exists
- Permissions allow write
- No lock file stuck (`*.lock`)

## Advanced

### Can I use Permiscope with other AI frameworks?

Yes. Permiscope is framework-agnostic. Wrap your agent's tool calls with `agent.act()`.

### Is there a TypeScript SDK?

Permiscope is written in TypeScript and includes type definitions.

### Can I contribute?

Yes! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
