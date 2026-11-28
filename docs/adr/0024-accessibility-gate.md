# 24. Automated accessibility gate

- Status: Accepted
- Date: 2026-11-28

## Context

The public landing page and governance console are the project's front door, but neither
had an accessibility baseline. Manual review is essential yet easy to skip, and the
existing CSS had concrete WCAG 2.2 AA gaps: no skip link, no explicit focus style for
landing links, sticky-header focus overlap, and a generic `div` carrying an `aria-label`.

## Decision

- Target WCAG 2.2 AA for both the landing root and `#/console/overview`.
- Add `@playwright/test` and `@axe-core/playwright` as dev dependencies and a
  `test:a11y` script that serves `dist/web` with `vite preview` and scans both routes
  for `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` violations.
- Fail the scan on any automatically detectable violation. CI runs it on the Linux
  Node 24 job; the Release workflow runs it before publishing.
- Add a skip link as the first keyboard stop, visible focus for all interactive
  elements, `scroll-margin-top` so the sticky header cannot obscure focus, ≥24px
  targets, semantic landmarks/headings, and an explicit label for the decision visual.
- Keep manual keyboard and screen-reader checks: automated scans detect only a portion
  of WCAG issues.

## Consequences

- The site now has a measurable, repeatable accessibility gate instead of ad hoc review.
- CI gains a Playwright browser download on one matrix job, and the release workflow
  gains the same step; contributors need `npx playwright install chromium` locally
  before running `npm run test:a11y`.
- Automated scans cannot prove full conformance. Manual review remains part of the
  contributor checklist.
- The landing page keeps its dark control-room aesthetic; accessibility is achieved
  through semantics, contrast and focus management rather than a redesign.

## Alternatives

- **Manual-only checklist** — rejected: regressions are invisible and the project
  already had measurable failures.
- **Lighthouse CI only** — deferred: axe gives per-rule, per-node diagnostics inside the
  existing test runner; Lighthouse remains useful for manual performance review.
- **Change the color palette entirely** — rejected: the failing contrast came from a
  CSS specificity bug, not the palette.
