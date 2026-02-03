/**
 * Permiscope Integration Example: CrewAI
 * 
 * Demonstrates how to govern multiple agents in a CrewAI-like setup.
 * Each agent's actions are routed through Permiscope.
 */

import { PermiscopeAdapter } from '../../src';

// 1. Initialize Permiscope for the Crew
const permiscope = new PermiscopeAdapter();

/**
 * MOCK: CrewAI-style Agent and Task
 */
class Agent {
    constructor(public role: string, public goal: string) { }
}

class Task {
    constructor(
        public description: string,
        public agent: Agent,
        public action: string,
        public params: any
    ) { }
}

// 2. Define Crew and Agents
const researcher = new Agent('Researcher', 'Find security vulnerabilities');
const developer = new Agent('Developer', 'Fix security vulnerabilities');

const tasks = [
    new Task('Read config', researcher, 'read_file', { path: 'package.json' }),
    new Task('Update dependencies', developer, 'run_command', { command: 'npm update' }),
    new Task('Delete sensitive data', researcher, 'run_command', { command: 'rm -rf /data' })
];

// 3. Governed Execution Loop
async function runCrew() {
    console.log('--- CrewAI Integration Demo ---');

    for (const task of tasks) {
        console.log(`\n[Agent: ${task.agent.role}] Performing: ${task.description}`);

        try {
            // Route the task's action through Permiscope
            // We pass the agent role as the agentId for the audit log
            const result = await permiscope.act(task.action, task.params, task.agent.role);
            console.log('✅ Success:', result);
        } catch (error: any) {
            console.error('❌ Blocked:', error.message);
        }
    }
}

if (require.main === module) {
    runCrew();
}
