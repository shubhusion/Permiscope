# Dashboard

The dashboard is the human-in-the-loop control plane for Permiscope. Since v1.1.0 the
UI is a React console in `web/`; `src/dashboard/server.ts` provides its API and serves
the built assets. See [hosting](./hosting.md) for local development and deployment.

## Starting locally

```bash
npm run dev:dashboard   # API and built UI at http://localhost:3000
npm run dev:web         # Vite dev server with /api proxy (optional)
```

## Authentication

Every `/api/*` route requires a bearer token. Set it before starting the server:

```bash
export PERMISCOPE_DASHBOARD_TOKEN=your-secret-token
```

Requests must include `Authorization: Bearer <token>`. Without a token the server
starts with a warning and all API routes are open — never do this outside local
development. CORS restricts browser origins but is not authentication.

The React console asks for the token in the header and keeps it in memory only; it
is never written to local storage or bundled into the static demo.

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/logs` | GET | Audit entries, newest first. Parameter values are redacted unless `?raw=1`. |
| `/api/approvals` | GET | Approval requests, pending first. |
| `/api/chain` | GET | Chain validity, entry count and performed checks. |
| `/api/approvals/:id` | POST | Approve or reject a pending request (`{ "status": "APPROVED" \| "REJECTED" }`). |

All four require the bearer token. `/api/logs?raw=1` is intended for administrators
who need the original parameters; treat its output as sensitive.

## Console views

- **Overview** — eval pass rate, chain status, pending approvals.
- **Approvals** — pending requests with TTL; Approve/Reject require the token.
- **Audit stream** — searchable, filterable entries with a detail drawer.
- **Chain** — verification checks and the `npm run audit:verify` command.
- **Eval** — adversarial corpus results by category.
- **Scenario** — recorded rogue-agent timeline.

The public demo at https://shubhusion.github.io/Permiscope/ is read-only and uses
committed fixture data; Approve/Reject are disabled there.

## Security notes

- No HTTPS or user management in the bundled server — put it behind a reverse proxy
  for anything beyond localhost.
- The token grants full approval authority; use a long random value and rotate it.
- Log parameters may contain secrets; the default redaction protects casual readers.
- The console is a control plane, not a sandbox: see [limitations](./limitations.md).
