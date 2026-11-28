# Documentation index

Start with the [README](../README.md) for the pitch, quick start and security configuration. This index groups the detailed guides by what you are trying to do.

## Understand

- [Core concepts](./core-concepts.md) — actions, scopes, decisions and approvals
- [Security model](./security-model.md) — threat model and fail-closed behavior
- [Limitations](./limitations.md) — what Permiscope does **not** protect
- [FAQ](./faq.md) — common questions and troubleshooting
- [Architecture](./architecture.md) and [architecture post](./architecture-post.md) — design and tradeoffs

## Integrate

- [Policy engine](./policy-engine.md) — guardrails, decision order and the command allowlist
- [Approvals workflow](./approvals-workflow.md) — identity-bound, single-use approvals
- [Execution gateway](./execution-gateway.md) — the governed execution path
- [Custom executors](./custom-executors.md) — wrap your own actions
- [Integrations](./integrations.md) — adapters, sidecar and MCP
- [Native hooks](./hooks.md) — Claude Code, Cursor and Codex setup
- [Shadow mode](./shadow-mode.md) — observe without executing
- [Python SDK](../python/README.md) — stdlib-only sidecar client

## Operate

- [Audit logging](./audit-logging.md) — chain, signatures, segments and verification
- [Dashboard](./dashboard.md) — approvals and audit API
- [Hosting the demo](./hosting.md) — local console and static deployment
- [Concurrency model](./concurrency-model.md) — locks, budgets and idempotency
- [End-to-end validation](./e2e.md) — live process checks
- [Performance](./performance.md) — benchmark and measured overhead
- [Migration guide](./migration.md) — upgrading and compatibility policy
- [Release procedure](./releases.md) — branching, tagging and publishing

## Contribute

- [AGENTS.md](../AGENTS.md) — repository working rules
- [CONTRIBUTING.md](../CONTRIBUTING.md) — first contribution path and verification gates
- [MAINTAINING.md](../MAINTAINING.md) — reviewer and release checklist
- [Code of Conduct](../CODE_OF_CONDUCT.md) — community expectations
- [Security policy](../SECURITY.md) — supported versions and private reporting
- [Architecture decisions](./adr/README.md) — why the design is the way it is
- [Roadmap](../ROADMAP.md) and [CHANGELOG](../CHANGELOG.md) — shipped and planned work

## Launch material

- [v2.1.0 launch post](./launch-post.md) — announcement draft with positioning and links
- [Worked examples](../examples/README.md) — copy-pasteable hook configs
