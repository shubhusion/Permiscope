import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { AuditLogEntry } from '../core/types';

export class AuditLogger {
    private logPath: string;
    private lastHash: string = '';

    constructor(baseDir: string = './logs') {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        this.logPath = path.join(baseDir, 'audit.log');

        // Initialize lastHash from existing file
        this.lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

        if (fs.existsSync(this.logPath)) {
            try {
                const content = fs.readFileSync(this.logPath, 'utf-8').trim();
                if (content) {
                    const lines = content.split('\n');
                    const lastLine = lines[lines.length - 1];
                    // The "last hash" needed for the NEXT entry is the hash of the PREVIOUS entry's full JSON logic.
                    // My log() method calculates: 
                    //    entryWithHashForNext = JSON.stringify(fullEntry)
                    //    this.lastHash = sha256(entryWithHashForNext)
                    // So I need to re-calculate the hash of the last line found in the file.
                    this.lastHash = createHash('sha256').update(lastLine).digest('hex');
                }
            } catch (e) {
                console.error('Failed to recover audit chain:', e);
                // In a strict system, we might crash here. For V2, we log error.
            }
        }
    }

    log(entry: Omit<AuditLogEntry, 'previousHash'>) {
        const logString = JSON.stringify(entry);

        // Calculate new hash: sha256(previousHash + currentLogContent)
        const hashPayload = this.lastHash + logString;
        const newHash = createHash('sha256').update(hashPayload).digest('hex');

        const fullEntry: AuditLogEntry = {
            ...entry,
            previousHash: this.lastHash
        };

        // We store the hash OF THIS ENTRY so the NEXT entry can use it? 
        // Or we store the previous hash IN this entry?
        // User asked: "append hash of previous log entry".
        // So fullEntry has `previousHash`. 
        // But to verify the chain, we also typically want the hash of the current block to be stored or easily calculable.
        // The user just said "create a simple chain". Storing previousHash is enough to link them.
        // I will implicitly update my local state `lastHash` to be the hash of THIS entry (including the prev hash) so the next one links to it.

        const entryWithHashForNext = JSON.stringify(fullEntry);
        this.lastHash = createHash('sha256').update(entryWithHashForNext).digest('hex');

        fs.appendFileSync(this.logPath, entryWithHashForNext + '\n');
    }
}
