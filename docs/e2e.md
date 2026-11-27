# End-to-end validation

`npm run e2e` spawns the dashboard and sidecar as real processes, waits for both to be
ready, and exercises: dashboard auth and log redaction, sidecar decide/execute, the
Python SDK against a live sidecar, MCP governance, budgets, post-conditions, JWT
principals, CJS/ESM loading, and audit-chain verification. It runs on Ubuntu in CI.

## Manual checklist

Use this when you want to watch the system yourself.

```bash
npm ci
npm run build && npm run build:web && npm run build:esm
PERMISCOPE_DASHBOARD_TOKEN=dev-token PORT=3000 npm run dev:dashboard
PERMISCOPE_SIDECAR_TOKEN=dev-token npm run serve
```

1. **Browser console** — open http://localhost:3000, enter the token, click all six
   views. Confirm eval 36/36, chain VALID, three pending approvals, searchable logs,
   detail drawer, and the rogue-agent timeline.
2. **Dashboard auth** — `curl http://localhost:3000/api/logs` → 401; with
   `Authorization: Bearer dev-token` → 200 and redacted parameters; `?raw=1` → originals.
3. **Sidecar** — POST `/v1/decide` and `/v1/execute` with `echo hello`; confirm allow.
   Try `rm -rf /`; confirm block. Omit the token; confirm 401.
4. **Python SDK** — `PYTHONPATH=python PERMISCOPE_SIDECAR_TOKEN=dev-token python python/example_agent.py`.
5. **MCP** — run a stub tool through `McpGovernor` with `defaultMcpPolicy()`; confirm
   approval and MCP-shaped result.
6. **Budgets** — two calls with `maxCalls: 1`; second returns `BUDGET_EXCEEDED`.
7. **Post-conditions** — executor that violates the scope returns `POSTCONDITION_FAILED`.
8. **JWT** — valid token with role `admin` succeeds; expired or wrong-role token fails.
9. **Audit** — `npm run audit:verify` after the above; tamper `logs/audit.log.head`
   and confirm verification fails.
10. **Public demo** — hard-refresh https://shubhusion.github.io/Permiscope/ and click
    every tab. The browser may cache old HTML; use Ctrl+Shift+R.

If a step fails, fix it in code and add an assertion to `scripts/e2e.ts` so it never
regresses silently.
