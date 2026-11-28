# 18. Branching and release model

- Status: Accepted
- Date: 2026-11-28

## Context

The project uses one issue → one branch → one PR → review → CI → squash merge. That loop
worked for dozens of changes, but the surrounding rules were implicit. One branch was
named `test/50-e2e` while closing issue #58, and the `v1.2.0` tag was pushed before the
final Trusted Publishing workflow fix landed. `main` also carries unreleased v1.3.0 work,
so a patch of an older release has no clean base. `SECURITY.md` currently says security
fixes are backported to the latest minor only.

## Decision

Use **GitHub Flow with explicit tag discipline** while only the latest minor is supported:

- `main` is the only long-lived branch. Every change arrives by PR and squash merge; CI
  must be green.
- Work branches are short-lived and named `<type>/<issue>-<slug>` with types `feat`, `fix`,
  `docs`, `test`, `refactor`, `perf`, `chore`, `release`, `hotfix`. The number must match
  the issue the PR closes.
- A release is a tag on a green `main` commit whose release configuration is final. The
  tag drives the Release workflow (OIDC publish with provenance).
- Do not move a published tag; correct forward with a new version.
- If the project later promises patches for older minors, adopt `hotfix/vX.Y.Z` branches
  cut from the published tag and `release/vX.Y.Z` branches for stabilization, merging
  fixes back to `main`.

## Consequences

- Minimal branch overhead; no separate `develop` or permanent maintenance branches.
- Older minors cannot be patched without a new minor release — this must stay explicit in
  `SECURITY.md` so users are not surprised.
- Tag discipline is a manual checklist item; the workflow verifies tag/version equality
  but cannot know whether a later config change was intended for the release.

## Alternatives

- **Continue ad hoc** — rejected: caused the branch-name drift and premature tag.
- **Trunk-based with permanent release/hotfix branches** — deferred: correct when older
  minors are supported, but unnecessary overhead today.
- **GitFlow with permanent `develop`** — rejected: no parallel releases or dedicated
  release manager to justify it.
