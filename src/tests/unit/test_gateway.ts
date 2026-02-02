import { ExecutionGateway } from '../gateway/ExecutionGateway';
import { PolicyEngine } from '../engine/PolicyEngine';
import { Action, Policy } from '../core/types';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${msg}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${msg}`);
    }
}

async function runTests() {
    console.log('🧪 Starting Execution Gateway Tests...');

    const policy: Policy = {
        scopes: [
            { actionName: 'safe_action', decision: 'ALLOW' },
            { actionName: 'blocked_action', decision: 'BLOCK' },
            { actionName: 'shadow_action', decision: 'BLOCK' } // Will be tested with shadowMode=true
        ]
    };
    const engine = new PolicyEngine(policy);
    // Note: We need to mock ApprovalCache or ensure it doesn't block. 
    // Since we aren't testing 'REQUIRE_APPROVAL' here, it's fine.
    const gateway = new ExecutionGateway(engine);
    const agentId = 'test-gateway';
    const timestamp = new Date();

    // ---------------------------------------------------------
    // 1. DRY RUN TESTS
    // ---------------------------------------------------------
    console.log('\n--- Dry Run ---');

    // Dry Run ALLOW
    let result = await gateway.run({ actionName: 'safe_action', parameters: {}, agentId, timestamp }, true);
    assert(result.decision === 'ALLOW', 'Dry Run ALLOW returned correct decision');
    assert(result.success === true, 'Dry Run ALLOW returned success=true');
    // We can't easily check side effects here without mocking executeAction, 
    // but we know executeAction isn't called if dryRun=true in the code.

    // Dry Run BLOCK
    result = await gateway.run({ actionName: 'blocked_action', parameters: {}, agentId, timestamp }, true);
    assert(result.decision === 'BLOCK', 'Dry Run BLOCK returned correct decision');
    assert(result.success === false, 'Dry Run BLOCK returned success=false');

    // ---------------------------------------------------------
    // 2. SHADOW MODE TESTS
    // ---------------------------------------------------------
    console.log('\n--- Shadow Mode ---');

    // Shadow Mode Blocked Action
    const shadowAction = {
        actionName: 'shadow_action',
        parameters: {},
        agentId,
        timestamp,
        shadowMode: true // Enable Shadow Mode
    } as Action & { shadowMode: boolean };

    result = await gateway.run(shadowAction);

    // Key checks:
    // 1. It should accept the action (success = true) so agent continues.
    // 2. But the decision logged/returned should imply it was shadowed (SHADOW_BLOCK or similar internal state). 
    // In our implementation, we set decision = 'SHADOW_BLOCK' and success = true.

    assert(result.success === true, 'Shadow Mode returned success=true for blocked action');
    assert(result.decision === 'SHADOW_BLOCK', 'Shadow Mode decision was SHADOW_BLOCK');
    assert(result.output === '[SHADOW] Action appeared successful.', 'Shadow Mode returned mock output');

    console.log('\n✨ All Execution Gateway Tests Passed!');
}

runTests().catch(console.error);
