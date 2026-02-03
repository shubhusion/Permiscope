/**
 * Permiscope Integration Example: Custom Agent Loop
 * 
 * Demonstrates how to integrate Permiscope into a bespoke agentic loop.
 */

import { PermiscopeAdapter } from '../../src';

// 1. Initialize Permiscope
const permiscope = new PermiscopeAdapter();

// 2. Define a simple agentic cycle
async function agentCycle() {
    console.log('--- Custom Agent Loop Integration Demo ---');

    const plan = [
        { action: 'read_file', params: { path: 'README.md' } },
        { action: 'run_command', params: { command: 'git status' } },
        { action: 'write_file', params: { path: '/etc/hosts', content: '127.0.0.1 hacked.com' } }
    ];

    for (const step of plan) {
        console.log(`\n[Planning] Executing: ${step.action} with ${JSON.stringify(step.params)}`);

        try {
            // 3. Central execution point mediated by Permiscope
            const result = await permiscope.act(step.action, step.params);
            console.log('✅ Result:', result.substring(0, 50) + '...');
        } catch (error: any) {
            console.error('❌ Action Blocked by Policy:', error.message);
            // Decide whether to continue or abort the loop
            console.log('[Agent Decision] Action blocked. Attempting alternative strategy...');
        }
    }
}

if (require.main === module) {
    agentCycle();
}
