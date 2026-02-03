/**
 * Permiscope Integration Example: LangChain
 * 
 * Demonstrates how to wrap LangChain tools with Permiscope governance.
 * Permiscope remains decoupled from LangChain internals.
 */

import { PermiscopeAdapter, withPermiscope } from '../../src';
import * as fs from 'fs';

// 1. Initialize Permiscope
const permiscope = new PermiscopeAdapter();

/**
 * MOCK: A simple LangChain-style tool interface
 */
interface Tool {
    name: string;
    description: string;
    func: (params: any) => Promise<string>;
}

// 2. Wrap a tool's execution using withPermiscope
const safeReadFileTool: Tool = {
    name: 'read_file',
    description: 'Read a file from disk safely.',
    // The executor is wrapped with Permiscope
    func: withPermiscope('read_file', async (params: Record<string, any>) => {
        return fs.readFileSync(params.path, 'utf-8');
    })
};

// 3. Alternatively, wrap using the adapter instance
const rawWriteFile = async (params: Record<string, any>) => {
    fs.writeFileSync(params.path, params.content);
    return 'File written successfully';
};

const safeWriteFileTool: Tool = {
    name: 'write_file',
    description: 'Write a file to disk safely.',
    func: permiscope.wrap('write_file', rawWriteFile)
};

/**
 * DEMO EXECUTION
 */
async function runDemo() {
    console.log('--- LangChain Integration Demo ---');

    try {
        // 🟢 Scenario 1: Allowed Action
        console.log('\n[Scenario 1: Read /tmp/hello.txt (Allowed)]');
        fs.writeFileSync('/tmp/hello.txt', 'Hello from LangChain!');
        const result1 = await safeReadFileTool.func({ path: '/tmp/hello.txt' });
        console.log('Result:', result1);

        // 🔴 Scenario 2: Blocked Action
        console.log('\n[Scenario 2: Read /etc/passwd (Blocked)]');
        await safeReadFileTool.func({ path: '/etc/passwd' });
    } catch (error: any) {
        console.error('Expected Error:', error.message);
    }

    try {
        // 🙋 Scenario 3: Approval Required (if policy set to REQUIRE_APPROVAL)
        // Note: Default policy might ALLOW /tmp, so this would need a custom policy to trigger.
        console.log('\n[Scenario 3: Write to sensitive area (Approval Required)]');
        // Using a path that typically requires approval in default policy
        await safeWriteFileTool.func({ path: 'src/index.ts', content: '// hacked' });
    } catch (error: any) {
        console.error('Result:', error.message);
    }
}

if (require.main === module) {
    runDemo();
}
