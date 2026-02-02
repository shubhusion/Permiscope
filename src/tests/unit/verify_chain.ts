import * as fs from 'fs';
import { createHash } from 'crypto';

const logPath = './logs/audit.log';

function verifyLogChain() {
    console.log('🔗 Verifying Audit Log Hash Chain...');

    if (!fs.existsSync(logPath)) {
        console.error('❌ Audit log file not found.');
        process.exit(1);
    }

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    let valid = true;
    let recomputedPreviousHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        try {
            const entry = JSON.parse(line);

            // 1. Check if entry.previousHash matches what we expect
            if (entry.previousHash !== recomputedPreviousHash) {
                console.error(`❌ Hash Mismatch at line ${i + 1}`);
                console.error(`   Expected: ${recomputedPreviousHash}`);
                console.error(`   Found:    ${entry.previousHash}`);
                valid = false;
                break; // Stop on first error
            }

            // 2. Compute hash for the NEXT entry
            // The Logger computed `lastHash` by hashing the JSON string of THIS entry.
            // Wait, in my AuditLogger implementation:
            // const entryWithHashForNext = JSON.stringify(fullEntry);
            // this.lastHash = createHash('sha256').update(entryWithHashForNext).digest('hex');
            //
            // So the `previousHash` of entry N+1 should be SHA256(JSON string of entry N).

            recomputedPreviousHash = createHash('sha256').update(line).digest('hex');
            console.log(`✅ Line ${i + 1}: Integrity OK`);

        } catch (e) {
            console.error(`❌ Parse Error at line ${i + 1}: ${e}`);
            valid = false;
        }
    }

    if (valid) {
        console.log('\n✨ Audit Chain Verified Successfully!');
    } else {
        console.error('\n❌ Audit Chain Verification Failed.');
        process.exit(1);
    }
}

verifyLogChain();
