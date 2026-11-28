## Description
Please describe the changes in this pull request. Include a summary of the problem being solved or the feature being added.

## Related Issues
Link any related issues here (e.g., Fixes #123).

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring / Technical Debt

## Architecture decision

Name the ADR this follows, or state that no ADR applies. Material decisions need a new
ADR in `docs/adr/` in the same PR.

## How Has This Been Tested?
Report each gate you actually ran with its result; separate automated checks from manual
inspection. Do not claim a check that was not run.

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run eval`
- [ ] `npm run typecheck:web` / `npm run build:web`
- [ ] `npm run build:esm` / `npm run check:package`
- [ ] `npm run e2e` / `npm run smoke:package`
- [ ] `npm audit --audit-level=moderate`
- [ ] Manual verification (describe how to repeat it)

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
