import { PolicyEngine } from '../engine/PolicyEngine';
import { Action, Policy } from '../core/types';

// ---------------------------------------------------------
// TEST UTILS
// ---------------------------------------------------------
function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${msg}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${msg}`);
    }
}

async function runTests() {
    console.log('🧪 Starting Policy Engine & Guardrails Tests...');

    // ---------------------------------------------------------
    // 1. POLICY SETUP
    // ---------------------------------------------------------
    const policy: Policy = {
        scopes: [
            { actionName: 'safe_action', decision: 'ALLOW' },
            { actionName: 'blocked_action', decision: 'BLOCK' },
            { actionName: 'approval_action', decision: 'REQUIRE_APPROVAL' },
            // Guardrails
            {
                actionName: 'write_file',
                decision: 'ALLOW',
                allowedPaths: ['/tmp/', 'C:\\Safe']
            },
            {
                actionName: 'run_command',
                decision: 'ALLOW',
                blockedCommandPatterns: ['rm -rf', 'sudo']
            },
            // Dynamic Validator
            {
                actionName: 'dynamic_action',
                decision: 'ALLOW',
                validator: async (action) => {
                    // Allow only if param 'magic' is 42
                    return action.parameters.magic === 42;
                }
            }
        ]
    };
    const engine = new PolicyEngine(policy);
    const agentId = 'test-agent';
    const timestamp = new Date();

    // ---------------------------------------------------------
    // 2. CORE LOGIC TESTS
    // ---------------------------------------------------------
    console.log('\n--- Core Logic ---');

    // Test ALLOW
    let decision = await engine.evaluate({ actionName: 'safe_action', parameters: {}, agentId, timestamp });
    assert(decision === 'ALLOW', 'Basic ALLOW');

    // Test BLOCK
    decision = await engine.evaluate({ actionName: 'blocked_action', parameters: {}, agentId, timestamp });
    assert(decision === 'BLOCK', 'Basic BLOCK');

    // Test REQUIRE_APPROVAL
    decision = await engine.evaluate({ actionName: 'approval_action', parameters: {}, agentId, timestamp });
    assert(decision === 'REQUIRE_APPROVAL', 'Basic REQUIRE_APPROVAL');

    // Test Default Deny (unknown action)
    decision = await engine.evaluate({ actionName: 'unknown_action', parameters: {}, agentId, timestamp });
    assert(decision === 'BLOCK', 'Default Deny for unknown action');


    // ---------------------------------------------------------
    // 3. GUARDRAILS TESTS
    // ---------------------------------------------------------
    console.log('\n--- Guardrails ---');

    // Path ALLOW
    decision = await engine.evaluate({
        actionName: 'write_file',
        parameters: { path: '/tmp/test.txt' },
        agentId, timestamp
    });
    assert(decision === 'ALLOW', 'Path in /tmp allowed');

    // Path BLOCK
    decision = await engine.evaluate({
        actionName: 'write_file',
        parameters: { path: '/etc/passwd' },
        agentId, timestamp
    });
    assert(decision === 'BLOCK', 'Path in /etc blocked');

    // Command ALLOW
    decision = await engine.evaluate({
        actionName: 'run_command',
        parameters: { command: 'echo hello' },
        agentId, timestamp
    });
    assert(decision === 'ALLOW', 'Safe command allowed');

    // Command BLOCK (Regex)
    decision = await engine.evaluate({
        actionName: 'run_command',
        parameters: { command: 'rm -rf /' },
        agentId, timestamp
    });
    assert(decision === 'BLOCK', 'rm -rf blocked by regex');

    decision = await engine.evaluate({
        actionName: 'run_command',
        parameters: { command: 'sudo apt-get install' },
        agentId, timestamp
    });
    assert(decision === 'BLOCK', 'sudo blocked by regex');

    // ---------------------------------------------------------
    // 4. DYNAMIC VALIDATOR TESTS
    // ---------------------------------------------------------
    console.log('\n--- Policy-as-Code ---');

    // Validator PASS
    decision = await engine.evaluate({
        actionName: 'dynamic_action',
        parameters: { magic: 42 },
        agentId, timestamp
    });
    assert(decision === 'ALLOW', 'Dynamic rule passed (magic=42)');

    // Validator FAIL
    decision = await engine.evaluate({
        actionName: 'dynamic_action',
        parameters: { magic: 0 },
        agentId, timestamp
    });
    assert(decision === 'BLOCK', 'Dynamic rule failed (magic=0)');

    console.log('\n✨ All Policy Engine Tests Passed!');
}

runTests().catch(console.error);
