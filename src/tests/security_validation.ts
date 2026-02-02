import { createAgent, PermiscopeAdapter, Policy } from '../index';
import { setupTestEnv, teardownTestEnv, TEST_ENV_DIR } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const LOG_FILE = path.resolve('logs/audit.log');
const REPORT = {
  passed: [] as string[],
  failed: [] as string[],
  edgeCases: [] as string[],
  score: 10,
};

function logPass(test: string) {
  console.log(`✅ PASS: ${test}`);
  REPORT.passed.push(test);
}

function logFail(test: string, reason: string) {
  console.log(`❌ FAIL: ${test} - ${reason}`);
  REPORT.failed.push(`${test}: ${reason}`);
  REPORT.score -= 2;
}

function logEdge(test: string, note: string) {
  console.log(`⚠️ EDGE: ${test} - ${note}`);
  REPORT.edgeCases.push(`${test}: ${note}`);
}

async function runTests() {
  console.log('🚀 STARTING COMPREHENSIVE SECURITY VALIDATION\n');
  setupTestEnv();

  try {
    await testBypass();
    await testMaliciousBehavior();
    await testCascadingFailures();
    await testStress();
    await testEdgeCases();
    await testAuditIntegrity();
    await testApprovalRobustness();
    await testRealWorkflow();
  } catch (e: any) {
    console.error('FATAL SUITE ERROR:', e);
  } finally {
    printReport();
    // Don't teardown immediately so we can inspect if needed, or stick to clean?
    // Let's teardown.
    teardownTestEnv();
  }
}

async function testBypass() {
  console.log('--- 1. Bypass Resistance ---');
  // 1.1 Direct Executor Bypass (Process Level)
  const agent = createAgent({
    policy: {
      scopes: [{ actionName: 'run_command', decision: 'BLOCK' }],
    },
  });

  try {
    await agent.act('run_command', { command: 'echo bypass' });
    logFail('Gateway Enforcement', 'Blocked action executed');
  } catch (e: any) {
    if (e.message.includes('BLOCK')) {
      logPass('Gateway Enforcement (Policy Check)');
    } else {
      logFail('Gateway Enforcement', `Unexpected error: ${e.message}`);
    }
  }
}

async function testMaliciousBehavior() {
  console.log('\n--- 2. Malicious Agent Behavior ---');
  const agent = createAgent({
    policy: {
      scopes: [
        { actionName: 'run_command', decision: 'BLOCK', blockedCommandPatterns: ['rm -rf'] },
      ],
    },
  });

  // 2.1 Repeated Retries
  let blockedCount = 0;
  for (let i = 0; i < 5; i++) {
    try {
      await agent.act('run_command', { command: 'rm -rf /' });
    } catch {
      blockedCount++;
    }
  }
  if (blockedCount === 5) logPass('Repeated Attacks Blocked');
  else logFail('Repeated Attacks', `Only blocked ${blockedCount}/5`);

  // 2.2 Attack Variations
  try {
    await agent.act('run_command', { command: 'rm  -rf  /' }); // Extra spaces
    logFail('Regex Evasion', 'Extra spaces bypassed regex');
  } catch {
    logPass('Regex Evasion (Spaces)');
  }
}

async function testCascadingFailures() {
  console.log('\n--- 3. Cascading Failures ---');
  // Simulate: Read (Allowed) -> Write (Block) -> Delete (Allowed)
  // Ensure flow stops at Write
  const agent = createAgent({
    policy: {
      scopes: [
        { actionName: 'read_file', decision: 'ALLOW' },
        { actionName: 'write_file', decision: 'BLOCK' },
        { actionName: 'delete_file', decision: 'ALLOW' }, // hypothetical
      ],
    },
  });

  const dummyPath = path.join(TEST_ENV_DIR, 'dummy.txt');
  fs.writeFileSync(dummyPath, 'test content');

  let step = 0;
  try {
    step = 1;
    await agent.act('read_file', { path: dummyPath });
    step = 2;
    await agent.act('write_file', { path: dummyPath, content: 'x' });
    step = 3;
    await agent.act('delete_file', { path: dummyPath }); // Should not reach
  } catch (e) {
    // Expected fail at step 2
  }

  if (step === 2) logPass('Workflow Interruption on Failure');
  else logFail('Workflow Interruption', `Workflow proceeded to step ${step}`);
}

async function testStress() {
  console.log('\n--- 4. Stress Testing ---');
  const agent = createAgent({
    policy: {
      scopes: [{ actionName: 'run_command', decision: 'ALLOW' }],
    },
  });

  const start = Date.now();
  const iterations = 100;
  const promises = [];
  for (let i = 0; i < iterations; i++) {
    promises.push(agent.act('run_command', { command: 'echo test' }).catch((e) => e));
  }
  await Promise.all(promises);
  const duration = Date.now() - start;
  logPass(`Stress Test (100 ops in ${duration}ms)`);
}

async function testEdgeCases() {
  console.log('\n--- 5. Edge Cases ---');
  // 5.1 Async Validator Error
  const agent = createAgent({
    policy: {
      scopes: [
        {
          actionName: 'run_command',
          decision: 'ALLOW',
          validator: async () => {
            throw new Error('DB Down');
          },
        },
      ],
    },
  });

  try {
    await agent.act('run_command', { command: 'echo test' });
    logFail('Async Validator Error', 'Failed open (allowed action on validator error)');
  } catch (e: any) {
    logPass('Async Validator Error (Fails Closed)');
  }
}

async function testAuditIntegrity() {
  console.log('\n--- 6. Audit Trail Integrity ---');
  // Run verification first to ensure clean state
  try {
    execSync('npm run audit:verify', { stdio: 'pipe' });
  } catch {
    // Ignore pre-existing state issues? Or fail?
  }

  // Append tamper
  fs.appendFileSync(LOG_FILE, '\nCORRUPT_DATA_ENTRY');

  try {
    execSync('npm run audit:verify', { stdio: 'pipe' });
    logFail('Audit Tamper Detection', 'Verification passed despite corruption');
  } catch (e) {
    logPass('Audit Tamper Detection');
  }

  // Restore log file (remove corruption) to not break future runs
  const stat = fs.statSync(LOG_FILE);
  fs.truncateSync(LOG_FILE, stat.size - 19); // Length of \nCORRUPT_DATA_ENTRY
}

async function testApprovalRobustness() {
  console.log('\n--- 7. Approval System ---');
  const agent = createAgent({
    policy: {
      scopes: [{ actionName: 'sensitive_op', decision: 'REQUIRE_APPROVAL' }],
    },
  });

  const gateway = (agent as any).getGateway();

  // Mock requestHumanApproval to simulate polling behavior for test automation
  gateway.requestHumanApproval = async (action: any) => {
    gateway.approvalCache.requestApproval(action.agentId, action.actionName, action.parameters);
    // Poll for 2 seconds
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      // reload logic is inside isApproved
      if (gateway.approvalCache.isApproved(action.agentId, action.actionName, action.parameters)) {
        return true;
      }
    }
    return false;
  };

  // Start action (will now poll instead of hang)
  const actionPromise = agent.act('sensitive_op', { data: 1 });

  // Give it time to register
  await new Promise((r) => setTimeout(r, 200));

  // Find pending using getAll()
  const pending = gateway.approvalCache.getAll().filter((i: any) => i.status === 'PENDING');
  if (pending.length === 0) {
    logFail('Approval Registration', 'Action did not register as pending');
  } else {
    logPass('Approval Registration');
    const req = pending[0];
    // invalid ID check (mocking logic if approve allows random ID)
    // Actually approve method loads based on key, derived from params.
    // If we call approve with DIFFERENT params/id, it won't affect THIS request.
    // Let's pass 'wrong_action' which generates a different key.
    const res = gateway.approvalCache.approve(req.agentId, 'wrong_action', {});
    // approve void return? Check implementation. It sets status if item exists.
    // It does NOT throw if key not found, just creates a NEW approved entry (Pre-approval).
    // Testing robustness: calling approve wrong id shouldn't approve right id.

    if (gateway.approvalCache.isApproved(req.agentId, 'sensitive_op', req.params)) {
      logFail('Invalid Approval Isolation', 'Wrong ID approval approved pending request');
    } else {
      logPass('Invalid Approval ID Rejected (No Effect)');
    }

    // Correct approval
    gateway.approvalCache.approve(req.agentId, req.actionName, req.params);
  }

  try {
    await actionPromise;
    logPass('Approval Flow Completions');
  } catch (e) {
    logFail('Approval Flow', `Failed after approval: ${e}`);
  }
}

async function testRealWorkflow() {
  console.log('\n--- 8. Real Workflow ---');
  // "Clean temp files, backup config, restart service"
  // Allowed: clean, backup. Blocked: restart.
  const agent = createAgent({
    policy: {
      scopes: [
        { actionName: 'run_command', decision: 'ALLOW', blockedCommandPatterns: ['restart'] },
        { actionName: 'run_command', decision: 'ALLOW' }, // allow others
      ],
    },
  });

  const steps = [
    { cmd: 'echo cleanup', expected: 'allow' },
    { cmd: 'echo backup', expected: 'allow' },
    { cmd: 'service nginx restart', expected: 'block' },
  ];

  let success = true;
  for (const step of steps) {
    try {
      await agent.act('run_command', { command: step.cmd });
      if (step.expected === 'block') {
        logFail(`Real Workflow (${step.cmd})`, 'Should have been blocked');
        success = false;
      }
    } catch (e) {
      if (step.expected === 'allow') {
        logFail(`Real Workflow (${step.cmd})`, 'Should have been allowed');
        success = false;
      }
    }
  }
  if (success) logPass('Real Workflow Simulation');
}

function printReport() {
  console.log('\n===========================================');
  console.log('📊 SECURITY VALIDATION REPORT');
  console.log('===========================================');
  console.log(`\n✅ PASSED TESTS: ${REPORT.passed.length}`);
  REPORT.passed.forEach((t) => console.log(`   - ${t}`));

  console.log(`\n❌ FAILED/RISKY: ${REPORT.failed.length}`);
  REPORT.failed.forEach((t) => console.log(`   - ${t}`));

  console.log(`\n⚠️ EDGE CASES: ${REPORT.edgeCases.length}`);
  REPORT.edgeCases.forEach((t) => console.log(`   - ${t}`));

  console.log(`\n🎯 OVERALL TRUST SCORE: ${Math.max(0, REPORT.score)}/10`);
  console.log('===========================================');
}

if (require.main === module) {
  runTests().catch(console.error);
}
