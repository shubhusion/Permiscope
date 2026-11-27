import { PermiscopeAdapter } from '../adapters/PermiscopeAdapter';
import * as path from 'path';
import * as fs from 'fs';

// Mock Config Files
const NGINX_CONF = path.resolve('temp_test_env', 'nginx.conf');
if (!fs.existsSync('temp_test_env')) fs.mkdirSync('temp_test_env');
fs.writeFileSync(NGINX_CONF, 'worker_processes 1;');

async function runDevOpsScenario() {
  console.log('🔧 --- DevOps Agent Scenario ---');

  const adapter = new PermiscopeAdapter({
    policy: {
      scopes: [
        { actionName: 'read_file', decision: 'ALLOW' },
        // Dangerous: Restarting services
        {
          actionName: 'run_command',
          decision: 'BLOCK',
          blockedCommandPatterns: ['service .* restart', 'systemctl restart'],
        },
        // Editing config requires approval
        { actionName: 'write_file', decision: 'REQUIRE_APPROVAL', allowedPaths: [NGINX_CONF] },
      ],
    },
    defaultAgentId: 'devops-bot',
  });

  // 1. Check Config
  console.log('🤖 Agent: Checking nginx config...');
  await adapter.act('read_file', { path: NGINX_CONF });
  console.log('✅ Config read success.');

  // 2. Try Restart (Dangerous)
  console.log('🤖 Agent: Trying to restart nginx...');
  try {
    await adapter.act('run_command', { command: 'service nginx restart' });
  } catch (e: any) {
    console.log(`🛡️ Blocked: ${e.message}`);
  }

  // 3. Update Config (Sensitive)
  console.log('🤖 Agent: Requesting to update config...');
  try {
    // For demo purposes, we wont block on interactive prompt here unless we use the dry-run/provisioning flow.
    // Or we can just show it triggering the need for approval.
    // Since `adapter.act` wraps `gateway.run` which uses CLI prompt, this will hang if we run it directly.
    // Let's use a mocked "Pre-Approved" state again to show the flow completion.

    const params = { path: NGINX_CONF, content: 'worker_processes 4;' };
    (adapter.getGateway() as any).approvalCache.approve('devops-bot', 'write_file', params);
    console.log('   (Simulating Manager Approval via Dashboard...)');

    await adapter.act('write_file', params);
    console.log('✅ Config updated successfully.');
  } catch (e: any) {
    console.log(`❌ Failed: ${e.message}`);
  }
}

if (require.main === module) {
  if (!fs.existsSync('temp_test_env')) fs.mkdirSync('temp_test_env');
  runDevOpsScenario();
}
