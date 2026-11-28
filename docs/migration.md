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
| Unsafe command regexes now throw at startup | Patterns rejected by `safe-regex` (or with a quantified alternation group) previously logged a warning and were skipped. Replace them with a safe, equivalent pattern. |
| Dashboard API rejects requests without a token | Set `PERMISCOPE_DASHBOARD_TOKEN`. For local-only development set `PERMISCOPE_DASHBOARD_ALLOW_ANONYMOUS=true` explicitly. See [ADR-0020](./adr/0020-fail-closed-host-defaults.md). |
| Dashboard and sidecar require a signed, strict audit log | Set `PERMISCOPE_AUDIT_SECRET`. For local-only development set `PERMISCOPE_ALLOW_UNSIGNED_AUDIT=true`. A caller-supplied `auditLogger` is still respected. |
| The default `run_command` policy is an executable allowlist | `defaultPolicy` now allows only `echo`, `pwd`, `git status`, `git diff`, `git log`, `git show`, `git rev-parse` and `npm test`. Add an `allowedCommands` list to your own scope for anything else, or provide your own policy. `undefined` keeps the old unrestricted behavior for custom policies. See [ADR-0019](./adr/0019-default-command-allowlist.md). |
| Segmented audit storage is opt-in | No change required. To adopt it, set `AuditLoggerOptions.segmented` and migrate existing logs with `permiscope audit migrate`. Legacy single-file logs keep verifying. |

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
