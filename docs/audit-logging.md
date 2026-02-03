# Audit Logging

Permiscope maintains a tamper-evident audit log of all actions.

## Overview

Every action, regardless of outcome, is logged with:
- Timestamp
- Agent identity
- Action details
- Decision
- Result
- Cryptographic chain link

## Log File Location

```
./logs/audit.log
```

Each line is a JSON object representing one entry.

## Entry Structure

```json
{
  "timestamp": "2026-02-01T10:30:00.000Z",
  "agentId": "devops-agent",
  "action": {
    "actionName": "run_command",
    "parameters": { "command": "git status" }
  },
  "decision": "ALLOW",
  "result": {
    "success": true,
    "output": "On branch main...",
    "dryRun": false
  },
  "previousHash": "a1b2c3d4...",
  "signature": "e5f6g7h8..."
}
```

## Hash Chaining

Each entry includes `previousHash` — the hash of the preceding entry.

```
Entry 1: hash(entry1) = H1
Entry 2: previousHash = H1, hash(entry2) = H2
Entry 3: previousHash = H2, hash(entry3) = H3
```

This creates an immutable chain. Modifying any entry breaks the chain.

## HMAC Signing

When `PERMISCOPE_AUDIT_SECRET` is set:

- Entries are signed with HMAC-SHA256
- `signature` field contains the MAC
- Verification requires the same secret

Without the secret, plain SHA-256 is used (development mode).

## Integrity Verification

```typescript
const logger = new AuditLogger('./logs');
const result = logger.verifyChain();

if (!result.valid) {
  console.error('Tampered entries:', result.errors);
}
```

### Verification Checks

1. **Chain integrity** — Each `previousHash` matches computed hash
2. **Signature validity** — HMAC matches (if secret set)
3. **Parse validity** — All entries are valid JSON

## Genesis Block

The first entry has:
```
previousHash: "0000000000000000000000000000000000000000000000000000000000000000"
```

This 64-character zero string is the chain anchor.

## Atomicity

Log writes use `proper-lockfile`:

1. Acquire lock
2. Read last hash
3. Compute new entry
4. Append atomically
5. Release lock

This prevents corruption from concurrent writes.

## Strict Mode

Set `PERMISCOPE_STRICT_LOGGING=true` to block actions if logging fails:

```
Action execution blocked due to strict logging mode.
```

This ensures no action proceeds without an audit record.

## Log Rotation

Currently, log rotation must be handled externally (e.g., `logrotate`). When rotating:

1. Stop the application
2. Archive `audit.log`
3. Start fresh (chain begins from genesis)

> [!WARNING]
> Breaking the file resets the chain. Archive before deleting.

## Best Practices

1. **Set PERMISCOPE_AUDIT_SECRET** in production
2. **Enable strict mode** for compliance environments
3. **Verify chain periodically** via cron or startup
4. **Archive logs** before rotation
5. **Protect log files** with filesystem permissions
