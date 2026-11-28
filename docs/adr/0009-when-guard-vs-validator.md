# 9. `when` skips, `guard` denies, legacy `validator` remains

- Status: Accepted
- Date: 2026-11-28

## Context

`validator` returning false skipped a scope, so an author using it as a deny rule got
fail-open behavior: a later permissive ALLOW scope could win. Changing its semantics
silently would break working policies.

## Decision

Add explicit `when` (false skips the scope) and `guard` (false denies the action) to
`PermissionScope`, both async-capable and fail-closed on throw. Keep `validator` with its
original skip semantics and document the migration.

## Consequences

- New policies have an unambiguous deny predicate.
- Existing policies keep working; authors of validator-as-deny rules must migrate.
- The typed policy builder exposes `.when()` and `.guard()`.

## Alternatives

- **Redefine `validator` to deny** — rejected: breaking change for existing policies.
- **Add only `guard`** — rejected: applicability and denial would still be conflated.
