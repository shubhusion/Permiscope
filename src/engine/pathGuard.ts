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

export type GuardedPathResult = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Canonicalize a file path immediately before use and verify containment again.
 * The canonical path is what callers should open, so swapping a symlink after
 * policy evaluation cannot redirect the write outside the approved roots.
 */
export function resolveGuardedPath(
  inputPath: string | undefined,
  allowedPaths: string[] | undefined,
): GuardedPathResult {
  if (!inputPath) return { ok: false, reason: 'Missing path parameter' };
  if (!allowedPaths || allowedPaths.length === 0) {
    return { ok: false, reason: 'No allowed roots configured' };
  }

  const absolute = path.resolve(inputPath);
  let target: string;
  try {
    target = fs.realpathSync.native(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { ok: false, reason: 'Path cannot be resolved' };
    }
    const realParent = fs.realpathSync.native(path.dirname(absolute));
    const candidate = path.join(realParent, path.basename(absolute));
    // A symlink as the final component would redirect the write after open.
    try {
      if (fs.lstatSync(candidate).isSymbolicLink()) {
        return { ok: false, reason: 'Refusing to write through a symbolic link' };
      }
    } catch (inspectError) {
      if ((inspectError as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { ok: false, reason: 'Path cannot be inspected' };
      }
    }
    target = candidate;
  }

  const inside = allowedPaths.some((allowed) => {
    const root = resolveRoot(allowed);
    if (!root) return false;
    const relative = path.relative(normalizeForComparison(root), normalizeForComparison(target));
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    );
  });
  if (!inside) return { ok: false, reason: 'Resolved path is outside the allowed roots' };
  return { ok: true, path: target };
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
