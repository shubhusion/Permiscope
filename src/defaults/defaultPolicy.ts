import { Policy } from '../core/types';
import * as os from 'os';
import * as path from 'path';

const TEMP_DIR = os.tmpdir();

export const defaultPolicy: Policy = {
  scopes: [
    // 1. Specific Sensitive Files -> Require Approval (MUST COME FIRST)
    // This scope ONLY matches if the validator returns true (i.e., file is sensitive)
    {
      actionName: 'read_file',
      decision: 'REQUIRE_APPROVAL',
      validator: (action) => {
        const p = (action.parameters.path || '').toLowerCase();
        // Return true for sensitive files that need approval
        return p.includes('.env') || p.includes('id_rsa') || p.includes('shadow') ||
          p.includes('passwd') || p.includes('.pem') || p.includes('.key');
      },
    },

    // 2. Command Safety
    {
      actionName: 'run_command',
      decision: 'ALLOW',
      blockedCommandPatterns: [
        'rm -rf',
        'rm -f',
        'del /s',
        'del /f', // File deletion
        'mkfs',
        'fdisk',
        'format', // Disk ops
        'shutdown',
        'reboot', // System ops
        'chmod 777',
        'chown root', // Permission ops
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
    },
  ],
};
