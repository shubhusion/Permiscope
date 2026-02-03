# Concurrency Model

Permiscope is designed for concurrent access by multiple agents and approval sources.

## Overview

File-based persistence with locking ensures data integrity across:
- Multiple agent processes
- CLI and Dashboard simultaneous access
- Concurrent approval requests

## File Locking Strategy

Permiscope uses [`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile) for atomic file operations.

### Lock Points

| File | Operations | Lock Type |
|------|------------|-----------|
| `data/approvals.json` | read, write, update | Exclusive |
| `logs/audit.log` | append | Exclusive |

### Lock Configuration

```typescript
await lockfile.lock(filePath, { retries: 3 });
```

- **Retries**: 3 attempts before failure
- **Type**: Exclusive (no concurrent access)
- **Scope**: Per-file

## Async Flows

All I/O operations are asynchronous:

```typescript
// ApprovalCache
async isApproved(agentId, actionName, params): Promise<boolean>
async approve(agentId, actionName, params): Promise<void>
async requestApproval(...): Promise<ApprovalRequest>

// AuditLogger
async log(entry): Promise<void>
```

## Race Condition Prevention

### Scenario: Concurrent Approval Checks

```
Process A: isApproved() → PENDING
Process B: isApproved() → PENDING
Dashboard: updateStatus(APPROVED)
Process A: re-checks → APPROVED
Process B: re-checks → APPROVED
```

Both processes correctly see the updated status due to:
1. Lock acquisition before read
2. Fresh file read within lock
3. Atomic write with lock held

### Scenario: Concurrent Log Writes

```
Agent 1: log(entry1)
  → acquire lock
  → read last hash
  → compute new hash
  → append
  → release lock

Agent 2: log(entry2)
  → waits for lock
  → acquires lock
  → reads updated last hash
  → compute new hash
  → append
  → release lock
```

Hash chain remains consistent.

## Potential Issues

| Issue | Mitigation |
|-------|------------|
| Lock timeout | Retry logic with exponential backoff |
| Stale lock | `proper-lockfile` has stale detection |
| Deadlock | Single lock per file, no cross-file locking |
| High contention | Lock held briefly, async I/O |

## Performance Considerations

- **Lock duration**: Minimized by doing computation outside locks
- **File size**: Large logs may cause slow reads within locks
- **Contention**: High-volume agents may experience delays

## Best Practices

1. **Keep log files reasonably sized** — Rotate periodically
2. **Use TTL for approvals** — Reduces cache file size
3. **Monitor lock wait times** — May indicate contention
4. **Single dashboard instance** — Avoid conflicting updates

## Not Supported

- **Distributed locking** — File locks are per-machine
- **Database storage** — Extension point, not implemented
- **Cross-machine coordination** — Requires external service
