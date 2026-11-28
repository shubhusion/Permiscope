# 10. Unsafe regexes reject the policy

- Status: Accepted
- Date: 2026-11-28

## Context

Blocked-command patterns were checked with `safe-regex`; unsafe patterns were skipped with
a warning, so a policy author's block rule could silently never fire. The heuristic also
accepts ambiguous quantified alternations such as `(a|a)*`.

## Decision

Compile and validate every `blockedCommandPatterns` entry in the `PolicyEngine`
constructor. Reject patterns flagged by `safe-regex`, syntactically invalid patterns, and
quantified groups containing alternation. Cache the compiled regexes; never skip a rule at
evaluation time.

## Consequences

- A policy with an unsafe pattern refuses to start instead of silently under-blocking.
- Some safe-but-ambiguous patterns are rejected conservatively.
- No new native dependency (`re2`) is required.

## Alternatives

- **Warn and skip** — rejected: fail-open block rules.
- **Use `re2`** — deferred: linear-time execution is attractive but adds a native
  dependency; fail-closed validation solves the observed problem without it.
