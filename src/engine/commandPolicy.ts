import { parse } from 'shell-quote';

export type CommandParseResult = { ok: true; argv: string[] } | { ok: false; reason: string };

const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'cmd', 'cmd.exe', 'powershell', 'pwsh']);
const SHELL_COMMAND_FLAGS = new Set(['-c', '/c', '--command', '-command']);

function basename(value: string): string {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Parse a command into an argv array without interpreting shell syntax.
 *
 * Why: regexes matched against a mutated command string are fail-open — stripping
 * `$()` makes `$(rm -rf /)` look harmless while the shell still runs it. Parsing
 * first lets us reject operators entirely and execute the remaining words as argv,
 * so what is authorized is exactly what runs.
 */
export function parseCommand(command: string): CommandParseResult {
  if (typeof command !== 'string' || command.trim() === '') {
    return { ok: false, reason: 'empty command' };
  }
  // shell-quote expands unknown $VAR to an empty token; reject substitution
  // syntax in the raw string instead of silently changing the command.
  if (command.includes('$') || command.includes('`')) {
    return { ok: false, reason: 'shell substitution is not allowed' };
  }

  let tokens: unknown[];
  try {
    tokens = parse(command);
  } catch {
    return { ok: false, reason: 'malformed command' };
  }

  const argv: string[] = [];
  for (const token of tokens) {
    if (typeof token !== 'string') {
      return { ok: false, reason: 'shell operators and comments are not allowed' };
    }
    if (token.includes('`') || token.includes('$')) {
      return { ok: false, reason: 'shell substitution is not allowed' };
    }
    argv.push(token);
  }

  if (argv.length === 0) {
    return { ok: false, reason: 'empty command' };
  }

  if (SHELLS.has(basename(argv[0])) && argv.slice(1).some((arg) => SHELL_COMMAND_FLAGS.has(arg))) {
    return { ok: false, reason: 'nested shells are not allowed' };
  }

  return { ok: true, argv };
}
