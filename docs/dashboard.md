# Dashboard

The Permiscope Dashboard is a web interface for managing approvals and viewing audit logs.

## Overview

- **URL**: `http://localhost:3000`
- **Purpose**: Human oversight without terminal access
- **Authentication**: Bearer token required for mutations

## Starting the Dashboard

```bash
# From the repository root
npm run dev:dashboard
```

## API Endpoints

### GET `/api/logs`
Returns the audit log, newest first.

**Authentication**: Not required  
**Response**: Array of log entries

```json
[
  {
    "timestamp": "2026-02-01T10:30:00.000Z",
    "agentId": "agent-001",
    "action": { "actionName": "run_command" },
    "decision": "ALLOW",
    "result": { "success": true }
  }
]
```

### GET `/api/approvals`
Returns all approval requests, pending first.

**Authentication**: Not required  
**Response**: Array of approval requests

### POST `/api/approvals/:id`
Update an approval status.

**Authentication**: Required (`Authorization: Bearer <token>`)  
**Body**:
```json
{ "status": "APPROVED" }
```
or
```json
{ "status": "REJECTED" }
```

## Authentication

Set the environment variable:

```bash
export PERMISCOPE_DASHBOARD_TOKEN=your-secret-token
```

Include in requests:
```
Authorization: Bearer your-secret-token
```

Without the token, approval updates are rejected with `401 Unauthorized`.

## UI Features

### Pending Approvals Panel
- Shows all `PENDING` requests
- Agent ID, action name, parameters
- Approve/Reject buttons

### Audit Log Stream
- Real-time log viewer
- Color-coded decisions (green=success, red=blocked)
- Auto-refreshes every 2 seconds

## CORS Configuration

The dashboard only accepts requests from:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

This prevents cross-origin attacks.

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Unauthorized approvals | Token authentication |
| XSS attacks | DOM-based rendering (no innerHTML) |
| CSRF | CORS restriction |
| Log tampering | Dashboard is read-only for logs |

## Best Practices

1. **Always set DASHBOARD_TOKEN** in production
2. **Run behind reverse proxy** (nginx, Caddy) for HTTPS
3. **Restrict network access** — Dashboard should not be public
4. **Monitor approvals** — Set up alerts for pending items
5. **Use short tokens** — Rotate periodically

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check `PERMISCOPE_DASHBOARD_TOKEN` is set |
| No approvals shown | No pending requests, or cache file issue |
| Logs not updating | Check `./logs/audit.log` exists |
| CORS error | Ensure you're accessing from `localhost:3000` |
