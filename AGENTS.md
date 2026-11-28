# Agent working rules

These rules apply to any agent working in this repository.

## Architecture decisions

**Always mention the relevant architecture decision when working.** Before changing code,
find the matching record in [`docs/adr/`](./docs/adr/README.md). Name it in your response
and in the PR description, for example "This follows ADR-0012 (budget ordering)". If a
material decision has no ADR, add one in the same PR with Status, Context, Decision,
Consequences and Alternatives. Do not silently contradict an accepted ADR — supersede it
with a new record and link the old one.

## Change workflow

1. One issue → one branch → one PR → review → CI green → squash merge.
2. Never commit directly to `main`.
3. Write the issue with both the problem and the proposed fix; include regression tests in
   the acceptance criteria.
4. Fix the root cause, not the test. Add a regression test for every bug.
5. Update documentation wherever behavior or APIs change. Reconcile `README.md`,
   `CHANGELOG.md`, `docs/` and `ROADMAP.md` in the same PR.

## Verification gates

Run before asking for review:

```bash
npm run lint
npm run build
npm test
npm run eval
npm run typecheck:web
npm run build:web
npm run build:esm
npm run check:package
npm run e2e
npm run smoke:package
npm audit --audit-level=moderate
```

CI runs the same gates across Ubuntu/Windows and Node 24/26. Python SDK tests run on Linux.

## Security posture

- Fail closed. A skipped rule, missing key or unwritable audit log must not become an
  allow.
- Credentials never enter domain objects or audit logs; they live in request context.
- Commands are parsed to argv and executed without a shell.
- Path containment uses canonical paths and is re-checked immediately before I/O.
- Permiscope is cooperative governance, not a sandbox (ADR-0001). Say so in docs and
  responses when security claims could be overread.

## Style

- Keep changes small, logical and consistent with surrounding code.
- Prefer explicit names and typed APIs over `any` and casts.
- Report automated checks separately from visual/manual inspection; never claim a check
  that was not run.
