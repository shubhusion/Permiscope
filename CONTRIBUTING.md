# Contributing to Permiscope

Thanks for helping make agent governance safer. Permiscope has a security-sensitive
core, so we keep a deliberately tight change process. Please read
[MAINTAINING.md](./MAINTAINING.md) for the full rules; this is the short version.

## Before you start

- Open or claim an **issue** first. Every change traces back to one.
- For security vulnerabilities, **do not open a public issue** — contact the maintainer
  privately (a `SECURITY.md` policy and private reporting are being added in v1.1.0).
- By contributing you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development setup

Node 22, 24, or 26 (all LTS as of 2026-11; Node 18 and 20 are EOL), npm 10+.

```bash
git clone https://github.com/shubhusion/permiscope.git
cd Permiscope
npm ci
npm run build
npm test
```

Also run `npm run lint` and `npm run audit:verify` where available; both are being
repaired as part of the v1.1.0 toolchain work.

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
