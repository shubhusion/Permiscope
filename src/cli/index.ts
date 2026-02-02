#!/usr/bin/env node
import { defaultPolicy } from '../defaults/defaultPolicy';
import { createAgent } from '../index';

async function runDemo() {
    // Import dynamically or just move logic here to avoid circularity if index.ts exports createAgent
    // Actually src/index.ts imports this file? No, it imports Adapter.
    // Let's just move the demo logic here.
    console.clear();
    console.log("🔒 \x1b[36mWelcome to Permiscope\x1b[0m - The Trust Layer for AI Agents\n");
    console.log("We are setting up a secure agent with \x1b[32mZero Configuration\x1b[0m...\n");

    const agent = createAgent();
    console.log("✅ Agent initialized with Default Safe Policy.\n");

    await new Promise(r => setTimeout(r, 800));

    console.log("► [Action 1] Agent tries SAFE command: \x1b[33m'echo \"Hello World\"'\x1b[0m");
    try {
        const res = await agent.act('run_command', { command: 'echo "Hello World"' });
        console.log(`   Running... \n   \x1b[32m✔ ALLOWED:\x1b[0m Output: "${res.trim()}"`);
    } catch (e: any) {
        console.log(`   ❌ BLOCKED: ${e.message}`);
    }

    console.log("");
    await new Promise(r => setTimeout(r, 1000));

    console.log("► [Action 2] Agent tries DANGEROUS command: \x1b[33m'rm -rf /'\x1b[0m");
    try {
        await agent.act('run_command', { command: 'rm -rf /' });
    } catch (e: any) {
        console.log(`   \x1b[31m🛡️  BLOCKED BY POLICY:\x1b[0m Dangerous pattern detected!`);
        console.log(`   (Your system is safe)`);
    }

    console.log("\n✨ \x1b[36mDemo Complete.\x1b[0m That's the power of Permiscope.");
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--demo') || args[0] === 'demo') {
        await runDemo();
        process.exit(0);
    }

    if (args.length === 0) {
        console.log('Usage: permiscope <command> [args...]');
        console.log('Example: permiscope run_command "echo hello"');
        console.log('         permiscope read_file "C:/Safe/data.txt"');
        console.log('         permiscope --demo');
        process.exit(1);
    }

    const actionName = args[0];
    const paramsRaw = args.slice(1).join(' ');

    let parameters: any = {};
    if (actionName === 'run_command') {
        parameters = { command: paramsRaw };
    } else if (actionName === 'read_file' || actionName === 'write_file') {
        parameters = { path: args[1] };
    } else {
        parameters = { args: args.slice(1) };
    }

    console.log(`🔒 Permiscope protecting action: ${actionName}`);
    const agent = createAgent();

    try {
        const result = await agent.act(actionName, parameters);
        console.log('\n--- Output ---');
        console.log(result);
        console.log('--------------');
    } catch (error: any) {
        console.error('\n❌ Action failed:', error.message);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
