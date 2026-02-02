import { ExecutionGateway } from '../gateway/ExecutionGateway';
import { PolicyEngine } from '../engine/PolicyEngine';
import { Policy, Action } from '../core/types';
import * as path from 'path';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
const TEST_DIR = path.resolve('temp_test_env');
const SECRET_FILE = path.join(TEST_DIR, 'secret_config.yaml');
const LOG_FILE = path.join(TEST_DIR, 'agent.log');

// Setup Policy
const realPolicy: Policy = {
  scopes: [
    {
      actionName: 'run_command',
      decision: 'ALLOW',
      blockedCommandPatterns: ['rm -rf /', 'sudo'], // Block root generic
    },
    {
      actionName: 'write_file',
      decision: 'ALLOW',
      allowedPaths: [TEST_DIR],
      validator: (action) => {
        // Additional safety: block overwriting existing secret file unless authorized?
        // For now, static path check is good enough.
        return true;
      },
    },
    {
      actionName: 'read_file',
      decision: 'REQUIRE_APPROVAL', // Sensitive by default for this test
      allowedPaths: [TEST_DIR],
    },
  ],
};

// ------------------------------------------------------------------
// AGENT SIMULATION
// ------------------------------------------------------------------
class AutonomousAgent {
  private gateway: ExecutionGateway;
  private id: string;

  constructor(id: string, gateway: ExecutionGateway) {
    this.id = id;
    this.gateway = gateway;
  }

  async executeStep(
    stepName: string,
    action: Action,
    options: { dryRun?: boolean; shadowMode?: boolean } = {},
  ) {
    console.log(`\n🤖 [${this.id}] Step: ${stepName}`);
    console.log(`   Intent: ${action.actionName} ${JSON.stringify(action.parameters)}`);
    if (options.dryRun) console.log(`   Mode: DRY-RUN`);
    if (options.shadowMode) console.log(`   Mode: SHADOW`);

    // Ensure agent ID matches
    action.agentId = this.id;
    action.timestamp = new Date();
    if (options.shadowMode) (action as any).shadowMode = true;

    const result = await this.gateway.run(action, options.dryRun);

    console.log(`   🛡️ Result: ${result.decision}`);
    if (result.success) {
      console.log(`   ✅ Execution Success: ${JSON.stringify(result.output).slice(0, 100)}...`);
    } else {
      console.log(`   ❌ Execution Failed/Blocked: ${result.error || 'Blocked by Policy'}`);
    }

    return result;
  }
}

// ------------------------------------------------------------------
// MAIN TEST RUNNER
// ------------------------------------------------------------------
async function runScenarios() {
  const fs = require('fs');
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);
  // Create secret file
  fs.writeFileSync(SECRET_FILE, 'TOP_SECRET_API_KEY=12345');

  const policyEngine = new PolicyEngine(realPolicy);
  const gateway = new ExecutionGateway(policyEngine);
  const agent = new AutonomousAgent('real-agent-v1', gateway);

  console.log('🚀 STARTING REAL AGENT INTEGRATION TEST\n');

  // ✅ Scenario 1: Normal Safe Workflow
  await agent.executeStep('Log Status', {
    actionName: 'run_command',
    parameters: { command: 'echo "System Nominal"' },
    agentId: '',
    timestamp: new Date(),
  });

  await agent.executeStep('Write Temp Log', {
    actionName: 'write_file',
    parameters: { path: LOG_FILE, content: 'Log entry 1' },
    agentId: '',
    timestamp: new Date(),
  });

  // ❌ Scenario 2: Dangerous Attempt
  await agent.executeStep('Try Dangerous Delete', {
    actionName: 'run_command',
    parameters: { command: 'rm -rf /' },
    agentId: '',
    timestamp: new Date(),
  });

  // ⚠️ Scenario 3: Sensitive Action (Requires Approval)
  // Simulate "User Approves" by injecting into Cache
  console.log('   (Simulating Human Approval for next step...)');
  const readParams = { path: SECRET_FILE };

  // 1. Dry run first -> Sees REQUIRE_APPROVAL.
  await agent.executeStep(
    'Read Secret (Dry Run)',
    {
      actionName: 'read_file',
      parameters: readParams,
      agentId: '',
      timestamp: new Date(),
    },
    { dryRun: true },
  );

  // 2. Simulate Approval
  const approvalCache = (gateway as any).approvalCache; // Access private
  approvalCache.approve('real-agent-v1', 'read_file', readParams);
  console.log('   (User Approved via Dashboard)');

  // 3. Real Run
  await agent.executeStep('Read Secret (Real)', {
    actionName: 'read_file',
    parameters: readParams,
    agentId: '',
    timestamp: new Date(),
  });

  // 🔍 Scenario 4: Dry-Run Planning
  await agent.executeStep(
    'Plan Dangerous Move (Dry Run)',
    {
      actionName: 'run_command',
      parameters: { command: 'rm -rf /' },
      agentId: '',
      timestamp: new Date(),
    },
    { dryRun: true },
  );

  // 🎭 Scenario 5: Shadow Mode Safety Simulation
  const shadowResult = await agent.executeStep(
    'Try Malware (Shadow Mode)',
    {
      actionName: 'run_command',
      parameters: { command: 'rm -rf /' },
      agentId: '',
      timestamp: new Date(),
    },
    { shadowMode: true },
  );

  if (shadowResult.success && shadowResult.decision === 'SHADOW_BLOCK') {
    // Agent "thinks" it worked, so it proceeds to next step
    await agent.executeStep('Malware Follow-up (Agent Thinks it deleted root)', {
      actionName: 'run_command',
      parameters: { command: 'echo "Root deleted, planting miner..."' },
      agentId: '',
      timestamp: new Date(),
    });
  }

  console.log('\n✅ SIMULATION COMPLETE.');
}

runScenarios().catch(console.error);
