import * as fs from 'fs';
import * as path from 'path';

function resolveRoot(input: string): string | null {
  try {
    return fs.realpathSync(path.resolve(input));
  } catch {
    return null;
  }
}

function normalizeForComparison(value: string): string {
  // Windows paths are case-insensitive; POSIX paths are not. Lowercasing on
  // POSIX would *widen* access by treating /TMP as /tmp.
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

/** Resolve traversal and symlinks; a missing target resolves via its nearest existing parent. */
function resolveForCheck(input: string): string | null {
  try {
    let candidate = path.resolve(input);
    while (!fs.existsSync(candidate)) {
      const parent = path.dirname(candidate);
      if (parent === candidate) return null;
      candidate = parent;
    }
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

/** True when the path resolves inside at least one configured root. Fails closed. */
export function isPathWithin(
  inputPath: string | undefined,
  allowedPaths: string[] | undefined,
): boolean {
  if (!allowedPaths || allowedPaths.length === 0) return false;
  if (!inputPath) return false;

  const target = resolveForCheck(inputPath);
  if (!target) return false;

  return allowedPaths.some((allowed) => {
    // A configured root must exist. Widening a missing root to its nearest
    // existing ancestor would silently expand e.g. C:\tmp to C:\.
    const root = resolveRoot(allowed);
    if (!root) return false;

    const relative = path.relative(normalizeForComparison(root), normalizeForComparison(target));
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    );
  });
}
