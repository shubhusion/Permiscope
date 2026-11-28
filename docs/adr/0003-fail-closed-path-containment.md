# 3. Fail-closed path containment and TOCTOU

- Status: Accepted
- Date: 2026-11-28

## Context

Path guardrails originally checked prefixes, which allowed `/tmp-evil` under a `/tmp` root,
and checked symlinks only at evaluation time, leaving a swap window before `write_file`
opened the path.

## Decision

Resolve both the target and each configured root with `realpathSync`, compare with
`path.relative` containment, and require at least one root for `ALLOW`/`REQUIRE_APPROVAL`
file scopes. Immediately before I/O, re-resolve the path and open the canonical result;
refuse a symlink as the final component. Comparison is case-folded only on Windows.

## Consequences

- A configured root that does not exist denies rather than widening to an ancestor.
- One extra realpath per file action; measured overhead is acceptable.
- A swap of the already-canonical path is still outside library control — documented as
  residual risk requiring OS isolation.

## Alternatives

- **String prefix checks** — rejected: sibling-directory escapes.
- **O_NOFOLLOW-only opening** — rejected as the sole mechanism: unavailable/unreliable on
  Windows and still needs containment of the parent directory.
- **Postcondition-only check** — rejected: detects the escape after the write.
