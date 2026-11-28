# 2. AST command tokenization, never a shell string

- Status: Accepted
- Date: 2026-11-28

## Context

Early command filtering stripped `$()` and backticks before matching denylist patterns.
`$(rm -rf /)` became `rm -rf /` for the checker while the shell still executed the
original string. Regex denylists also failed on quoting and operator variations.

## Decision

Parse the command with `shell-quote`, walk the resulting token AST, reject any token that
is not a plain string, any operator, and any raw `$` or backtick, then execute the resulting
argv with `spawn(program, args, { shell: false })`. What is authorized is exactly what runs.

## Consequences

- Shell built-ins and operators (`&&`, `|`, redirects) are unavailable.
- `echo` is emulated on Windows so governed commands behave consistently.
- Shell-specific behavior must be moved into a custom executor.
- Command fuzz tests assert that no unsafe token ever reaches `spawn`.

## Alternatives

- **Strip dangerous substrings then use a denylist** — rejected after the bypass above.
- **Pass the string to a shell with escaping** — rejected: escaping is context-dependent
  and platform-specific.
