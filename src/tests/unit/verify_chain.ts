import * as fs from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';

describe('Audit Log Integrity', () => {
  const logPath = './logs/audit.log';

  test('Log chain integrity should be valid', () => {
    // If log file doesn't exist, we skip or pass (initial state)
    if (!fs.existsSync(logPath)) {
      console.warn('Audit log file not found, skipping integrity check.');
      return;
    }

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    let recomputedPreviousHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const entry = JSON.parse(line);

      // 1. Check if entry.previousHash matches what we expect
      expect(entry.previousHash).toBe(recomputedPreviousHash);

      // 2. Compute hash for the NEXT entry
      recomputedPreviousHash = createHash('sha256').update(line).digest('hex');
    }
  });
});
