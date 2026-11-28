# Release procedure

This follows [ADR-0018](./adr/0018-branching-and-release-model.md) and the
[release workflow](../.github/workflows/release.yml). Only the latest minor is supported;
see [SECURITY.md](../SECURITY.md).

## Normal release

1. Ensure `main` is green and the milestone issues are closed.
2. Move `CHANGELOG.md` entries under a dated version heading and bump the version with
   `npm version <patch|minor|major> --no-git-tag-version` in a PR.
3. Reconcile `README.md`, `ROADMAP.md` and docs links in the same PR.
4. Review, CI green, squash merge. **Do not tag until after the merge** — the tag must
   point at the commit that contains the final workflow and changelog.
5. Tag the exact green commit:

   ```bash
   git checkout main
   git pull --ff-only
   git tag v<version>
   git push origin v<version>
   ```

   Alternatively dispatch the Release workflow from `main` with `gh workflow run release.yml`.

6. The workflow runs the full gate, verifies tag/version equality, publishes with
   `npm publish --provenance`, and signs a Sigstore attestation.
7. Verify what users get:

   ```bash
   npm view permiscope version
   npm view permiscope@<version> dist.attestations --json
   ```

   Install the tarball in a clean directory and run the README quick-start.

8. Create the GitHub Release with generated notes, close the milestone and close the
   release issue.

## If a release must be corrected

Never move or delete a published tag. Release the next version instead. If you must patch
an older minor, first update `SECURITY.md` to promise that support, then:

1. `git checkout -b hotfix/vX.Y.Z vX.Y.(Z-1)` from the published tag.
2. Fix, test, PR and CI on that branch.
3. Tag the green hotfix commit and push the tag to publish the patch.
4. Merge the hotfix branch back into `main` so the fix is not lost.

## Release gates

The workflow runs: `npm audit --audit-level=high`, build (CJS + ESM + web), typecheck,
tests, lint, eval, E2E, package smoke, tag/version check, then publish with provenance.
