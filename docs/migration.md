# Migration guide

## 1.0.x → 1.1.x and later

v1.1.0 introduced deliberate fail-closed behavior changes. Review these before upgrading.

| Change | What to do |
|---|---|
| File scopes with no `allowedPaths` now deny access | Add explicit `allowedPaths` to every `read_file`/`write_file` scope. `defaultPolicy` reads only the workspace and temp dir. |
| Approval identity comes from a host `principalProvider` | Stop passing caller-controlled `agentId` for approval identity. Configure a principal provider (or `verifiedPrincipalProvider`). |
| `wrap()` always routes through the gateway | Remove code that assumed `wrap()` executed outside policy/audit. One execution and one audit entry now occur per call. |
| Audit writes are awaited; strict mode propagates failures | Handle gateway rejections when logging fails; set `PERMISCOPE_AUDIT_SECRET` in production. |
| Command execution uses argv with no shell | Shell built-ins and `&&`/`|`/`$(...)` are no longer available. Use custom executors for shell-specific behavior. |
| Node 24+ required | Upgrade CI and local Node. |
| Rejections now expire | Do not rely on permanent rejections; re-approve when needed. |
| Credentials are no longer an `Action` field | Remove `token` from constructed actions. Supply it via `withRequestContext({ token }, () => ...)` from `permiscope` (or rely on the sidecar, which does this for you). `verifiedPrincipalProvider` reads the token from context. |
| `validator: false` skips a scope rather than denying | If you used `validator` as a deny rule, replace it with `guard` (false denies). Use `when` for applicability (false skips). The legacy field keeps its old behavior, so no immediate change is required for working policies. |

Additive APIs introduced after 1.1.0 (`evaluateDetailed`, budgets, postconditions,
MCP governor, verified principals, policy builder, ESM build) do not require changes,
but adopting them strengthens governance.

## Compatibility policy

- **Patch releases** (`1.1.x`) contain fixes only and do not change documented behavior.
- **Minor releases** (`1.x.0`) may add features and deprecate APIs. Deprecated APIs keep
  working for at least one minor release.
- **Major releases** (`2.0.0`) may introduce breaking changes, always with a migration
  section in this file.
- Security fixes are backported to the latest minor only; older minors receive fixes
  at maintainer discretion (see `SECURITY.md`).

Deprecations are announced in `CHANGELOG.md` under `Deprecated` and in the relevant
docs at least one minor release before removal.
