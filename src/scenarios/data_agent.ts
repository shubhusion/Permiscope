import { PermiscopeAdapter } from '../adapters/PermiscopeAdapter';
import * as path from 'path';

// Mock Data Environment
const DATA_DIR = path.resolve('temp_test_env', 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

async function runDataScenario() {
    console.log('\n📊 --- Data Agent Scenario ---');

    const adapter = new PermiscopeAdapter({
        policy: {
            scopes: [
                // Allow reading raw, writing processed.
                // Block overwriting raw.
                { actionName: 'read_file', decision: 'ALLOW', allowedPaths: [RAW_DIR] },
                { actionName: 'write_file', decision: 'ALLOW', allowedPaths: [PROCESSED_DIR] },
                { actionName: 'write_file', decision: 'BLOCK', allowedPaths: [RAW_DIR] } // Explicit block (redundant if default deny, but good for explicit safety)
            ]
        },
        defaultAgentId: 'data-bot'
    });

    // 1. Read Raw Data
    console.log('🤖 Agent: Reading raw data...');
    try {
        await adapter.act('read_file', { path: path.join(RAW_DIR, 'input.csv') });
        console.log('✅ Read raw data.');
    } catch (e) {
        // Might fail if file doesn't exist, but intended to be allowed.
        // We'll mock the file first.
        console.log('   (File read simulated)');
    }

    // 2. Process and Write
    console.log('🤖 Agent: Writing processed result...');
    await adapter.act('write_file', { path: path.join(PROCESSED_DIR, 'output.json'), content: '{"status": "ok"}' });
    console.log('✅ Written to /processed.');

    // 3. Accidental Overwrite (Integrity Check)
    console.log('🤖 Agent: Oops, trying to overwrite raw input...');
    try {
        await adapter.act('write_file', { path: path.join(RAW_DIR, 'input.csv'), content: 'CORRUPT' });
    } catch (e: any) {
        console.log(`🛡️ Blocked: ${e.message}`);
    }
}

if (require.main === module) {
    const fs = require('fs');
    if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
    if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    fs.writeFileSync(path.join(RAW_DIR, 'input.csv'), 'id,value\n1,100');
    runDataScenario();
}
