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
  "signature": "e5f6g7h8...",
  "sequence": 42,
  "keyId": "v1"
}
```

## Hash Chaining

Each entry includes `previousHash` — the SHA-256 hash of the preceding entry — and a
monotonically increasing `sequence`. The hash itself is unkeyed so that rotating the
HMAC signing key does not invalidate old links; authenticity comes from the signature.

```
Entry 1: sequence=1, previousHash=0...0, hash(entry1) = H1
Entry 2: sequence=2, previousHash=H1,    hash(entry2) = H2
```

A companion `audit.log.head` file records the last sequence and hash, signed with
HMAC when a secret is configured. It is written under the same lock as the append, so
deleting the tail of the log is detected. Modifying any entry or the head record
without the signing key breaks verification. Signing keys can rotate because the
head carries a `keyId` and verification resolves it from the key ring.

## HMAC Signing

When `PERMISCOPE_AUDIT_SECRET` is set:

- Entries are signed with HMAC-SHA256 and carry a `keyId`
- `signature` field contains the MAC
- Verification looks up the secret by `keyId`, so keys can rotate without
  invalidating history: set `PERMISCOPE_AUDIT_KEY_ID` to the new ID and provide
  `PERMISCOPE_AUDIT_KEY_RING` (JSON mapping of key ID → secret) containing both old and new keys

Without a secret, entries are unsigned (development mode).

## Integrity Verification

```bash
npm run audit:verify                 # verifies ./logs/audit.log
npx permiscope verify ./logs/audit.log
```

Exit code is `0` when the chain is valid and `1` otherwise.

```typescript
const logger = new AuditLogger('./logs', false, {
  keyRing: { v1: 'old-secret', v2: 'new-secret' },
});
const result = logger.verifyChain();
```

### Verification Checks

1. **Sequence continuity** — each entry's `sequence` is the expected number
2. **Chain integrity** — each `previousHash` matches the computed hash
3. **Head agreement and signature** — the last sequence and hash match the signed `audit.log.head` (detects tail truncation and head tampering)
4. **Signature validity** — HMAC matches using the key named by `keyId`
5. **Parse validity** — all entries are valid JSON

Legacy logs without sequence numbers or a head file are reported as unverifiable
rather than silently trusted.

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
