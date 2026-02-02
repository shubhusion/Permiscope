import { createAgent } from '../index';

async function testCustomExecutors() {
    console.log("🔌 Testing Custom Executors...");

    const agent = createAgent({
        policy: {
            scopes: [
                { actionName: 'send_notif', decision: 'ALLOW' },
                { actionName: 'charge_card', decision: 'REQUIRE_APPROVAL' }
            ]
        },
        executors: {
            send_notif: async (params) => {
                return `Notification sent to ${params.user}: ${params.msg}`;
            },
            charge_card: async (params) => {
                return `Successfully charged card for $${params.amount}`;
            }
        }
    });

    // 1. Test Allowed Custom Action
    console.log("► [Test 1] Allowed Custom Action");
    const res1 = await agent.act('send_notif', { user: 'alice', msg: 'Hello' });
    console.log(`   Result: ${res1}`);
    if (res1.includes('sent to alice')) {
        console.log("   ✅ PASS");
    } else {
        console.log("   ❌ FAIL");
        process.exit(1);
    }

    // 2. Test Approval for Custom Action (Programmatic Approval)
    console.log("\n► [Test 2] Approved Custom Action");
    const gateway = (agent as any).getGateway();

    // Trigger action (it will poll)
    const actionPromise = agent.act('charge_card', { amount: 50 });

    // Approve via cache (simulating Dashboard)
    await new Promise(r => setTimeout(r, 200));
    gateway.approvalCache.approve('safe-agent', 'charge_card', { amount: 50 });

    const res2 = await actionPromise;
    console.log(`   Result: ${res2}`);
    if (res2.includes('$50')) {
        console.log("   ✅ PASS");
    } else {
        console.log("   ❌ FAIL");
        process.exit(1);
    }

    console.log("\n✨ Pluggability Verification Complete!");
}

testCustomExecutors().catch(console.error);
