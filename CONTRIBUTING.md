# Contributing to Permiscope

Thanks for helping make agent governance safer. Permiscope has a security-sensitive
core, so we keep a deliberately tight change process. Please read
[MAINTAINING.md](./MAINTAINING.md) for the full rules; this is the short version.

## Before you start

- Open or claim an **issue** first. Every change traces back to one.
- For security vulnerabilities, **do not open a public issue** — use GitHub's private
  vulnerability reporting as described in [SECURITY.md](./SECURITY.md).
- By contributing you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Finding a first issue

Look for issues labelled `good first issue` or `docs`. Good starting points include:

- adding an adversarial case to `eval/cases.json` with a regression test,
- improving a `docs/` page or a README example so it matches shipped behavior,
- tightening a unit test around policy decisions, path containment or approval TTLs,
- reproducing a bug on Node 24 and 26 and adding a deterministic regression test.

Comment on the issue to claim it before opening a branch. Small PRs are reviewed first.
Architectural changes need an ADR in `docs/adr/`; see [ADR-0018](./docs/adr/0018-branching-and-release-model.md)
for the branch and release rules.

## Development setup

Use Node 24 or 26 (npm 10+). This matches `engines.node` and the CI matrix; older
Node versions are not tested or supported.

```bash
git clone https://github.com/shubhusion/permiscope.git
cd Permiscope
npm ci
npm run build
npm test
```

Before opening a PR, run the same gates CI runs:

```bash
npm run lint
npm run build
npm test
npm run eval
npm run typecheck:web
npm run build:web
npx playwright install chromium   # first time only
npm run test:a11y
npm run build:esm
npm run check:package
npm run e2e
npm run smoke:package
npm audit --audit-level=moderate
```

`npm run audit:verify` verifies `./logs/audit.log` locally. Report results in the PR
body rather than saying "tests pass" — separate automated checks from manual review.

## The rules for every change

1. **One issue → one branch → one PR.** Branch naming: `fix/<issue>-<slug>` or
   `feat/<issue>-<slug>`. Use Conventional Commits (`fix:`, `feat:`, `test:`, `docs:`).
2. **Open the PR as a draft early.** It becomes ready when CI is green and the
   checklist below is complete.
3. **Never commit directly to `main`.** Squash-merge; include `Closes #N` in the PR body
   so the issue closes automatically.
4. **Code must be logical and efficient.** Every line must earn its place:
   - Prefer the standard library and existing dependencies over new ones.
   - Pick the simplest correct solution that handles the edge cases.
   - If a non-obvious choice is necessary, comment **why**, not *what*.
   - No dead code, no duplicated logic. A script not run by CI is invisible to reviewers.
   - Fail closed: uncertain policy, identity, or logging state must deny the action.

## Testing is mandatory before an issue can be closed

An issue is **not done** until all of the following pass:

- [ ] A regression test exists for the exact bug or behavior in the issue.
- [ ] Unit tests cover the changed logic, including boundary and failure paths.
- [ ] An integration test is added when behavior crosses a boundary (gateway → executor,
      HTTP sidecar → Python SDK, dashboard → approval cache).
- [ ] Tests are deterministic: temp directories, fixed timestamps, stub executors, no
      real destructive commands or network calls.
- [ ] `npm test` exits clean — no leaked-handle warnings, no unexplained skipped suites.
- [ ] CI is green on every matrix entry.
- [ ] Manual verification steps, if any, are written in the PR body so others can repeat them.

For documentation-only changes, verification means checked links, consistency with the
code, and review — code tests are not required, but the PR body must say what was checked.

"Works on my machine" is not evidence, and neither is a passing test that does not
assert the behavior the issue describes.

## Docs and compatibility

- Update the relevant `docs/` page and README example in the **same PR** as the code.
- Preserve 1.x API compatibility in minor releases; deprecate before removing.
- If behavior intentionally changes (for example, fail-closed path defaults), add a
  migration note under `Unreleased` in `CHANGELOG.md`.

## Pull request checklist

- [ ] Linked issue and clear summary.
- [ ] Regression test plus the coverage described above.
- [ ] New dependencies justified in the description (or removed).
- [ ] Docs and changelog entry included.
- [ ] CI green; no new lint or type errors.
- [ ] Reviewer concerns addressed before merge.

## Review process

Reviews focus on correctness, security, efficiency, and compatibility — in that order.
A small, well-tested PR is reviewed faster than a large one. A request to narrow scope
is not a rejection of the idea.

## Getting help

Use the issue for behavior questions, or open a draft PR for design questions. Be
explicit about what you tried and what you expected. Security reports stay private.

## License

By contributing you agree that your contributions are licensed under the MIT License.
