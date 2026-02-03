/**
 * Permiscope Integration Example: Workflow Runner / Automation
 * 
 * Demonstrates how to use Permiscope for scripted automations, CI/CD bots, 
 * or cron jobs where governance and auditability are required.
 */

import { PermiscopeAdapter, withPermiscope } from '../../src';
import * as fs from 'fs';

// 1. Initialize Permiscope for the runner
const permiscope = new PermiscopeAdapter({
    defaultAgentId: 'automation-bot'
});

// 2. Define governed workflow steps
async function runWorkflow() {
    console.log('--- Workflow Runner Integration Demo ---');

    // Step 1: Governance via direct act call
    console.log('\n[Step 1] Checking system status...');
    await permiscope.act('run_command', { command: 'uptime' });

    // Step 2: Governance via functional wrapping (withPermiscope)
    const safeCleanup = withPermiscope('run_command', async (params: Record<string, any>) => {
        // In a real runner, this would execute a complex cleanup script
        console.log(`Doing cleanup in ${params.dir}`);
        return `Cleaned ${params.dir}`;
    });

    console.log('\n[Step 2] Cleaning up temporary files...');
    await safeCleanup({ dir: '/tmp/build' });

    // Step 3: Handling failure/blocking
    console.log('\n[Step 3] Attempting protected operation...');
    try {
        await permiscope.act('write_file', { path: 'dist/prod.env', content: 'KEY=VALUE' });
        console.log('✅ Update successful');
    } catch (error: any) {
        console.error('⚠️ Blocked:', error.message);
        console.log('[Workflow] Sensitive step blocked. Routing for manual approval...');
    }
}

if (require.main === module) {
    runWorkflow();
}
