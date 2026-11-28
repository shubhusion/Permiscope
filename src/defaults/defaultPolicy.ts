import { Policy } from '../core/types';
import * as os from 'os';

const TEMP_DIR = os.tmpdir();
const WORKSPACE = process.cwd();
const READ_ROOTS = [WORKSPACE, TEMP_DIR];

export const defaultPolicy: Policy = {
  scopes: [
    // 1. Specific Sensitive Files -> Require Approval (MUST COME FIRST)
    // This scope ONLY matches when the predicate says the file is sensitive.
    {
      actionName: 'read_file',
      decision: 'REQUIRE_APPROVAL',
      allowedPaths: READ_ROOTS,
      when: (action) => {
        const p = (action.parameters.path || '').toLowerCase();
        // Return true for sensitive files that need approval
        return (
          p.includes('.env') ||
          p.includes('id_rsa') ||
          p.includes('shadow') ||
          p.includes('passwd') ||
          p.includes('.pem') ||
          p.includes('.key')
        );
      },
    },

    // 2. Command Safety
    // The allowlist is the primary control (ADR-0019). It admits only commands
    // that are safe for a cooperative agent by default; callers that need more
    // must opt in explicitly. The block patterns stay as defense-in-depth and
    // cover argument-level escape hatches in the allowed commands.
    {
      actionName: 'run_command',
      decision: 'ALLOW',
      allowedCommands: [
        'echo',
        'pwd',
        'git status',
        'git diff',
        'git log',
        'git show',
        'git rev-parse',
        'npm test',
      ],
      blockedCommandPatterns: [
        'rm -rf',
        'rm -f',
        'sudo',
        'del /s',
        'del /f', // File deletion
        'mkfs',
        'fdisk',
        'format', // Disk ops
        'shutdown',
        'reboot', // System ops
        'chmod 777',
        'chown root', // Permission ops
        // git read commands must not write files or invoke external helpers
        '^git (diff|log|show) .*--out',
        '^git .*--no-i',
        '^git .*--ext-d',
        '^git .*--open-files',
        // npm test must run the local test script, not another package or shell
        '^npm .*--pre',
        '^npm .*--work',
        '^npm .* -w ',
        '^npm .*--script-s',
        '^npm .*--reg',
        '^npm .*--user',
        '^npm .*--global',
      ],
    },

    // 3. File Write Safety (Restricted to Temp/Logs)
    {
      actionName: 'write_file',
      decision: 'ALLOW',
      allowedPaths: [TEMP_DIR, './temp', './logs'],
    },

    // 4. File Read Safety (General)
    {
      actionName: 'read_file',
      decision: 'ALLOW',
      allowedPaths: READ_ROOTS,
    },
  ],
};
