import * as readline from 'readline';
import { Action, PermissionDecision } from '../core/types';
import { PolicyEngine } from '../engine/PolicyEngine';
import { AuditLogger } from '../logging/AuditLogger';
import { ApprovalCache } from './ApprovalCache';

export type ActionExecutor = (params: any) => Promise<any>;

export interface GatewayResult {
  decision: PermissionDecision;
  success: boolean;
  output?: any;
  error?: string;
}

export class ExecutionGateway {
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;
  private approvalCache: ApprovalCache;
  private customExecutors: Record<string, ActionExecutor>;

  constructor(policyEngine: PolicyEngine, customExecutors: Record<string, ActionExecutor> = {}) {
    this.policyEngine = policyEngine;
    this.auditLogger = new AuditLogger();
    this.approvalCache = new ApprovalCache();
    this.customExecutors = customExecutors;
  }

  async run(action: Action, dryRun: boolean = false): Promise<GatewayResult> {
    let decision = await this.policyEngine.evaluate(action);
    let success = false;
    let output = null;
    let error = undefined;

    // Check approval cache if needed
    if (decision === 'REQUIRE_APPROVAL') {
      if (await this.approvalCache.isApproved(action.agentId, action.actionName, action.parameters)) {
        decision = 'ALLOW';
      } else if (dryRun) {
        // In dry run, we stop here and report that approval would be needed
      } else {
        // Request actual human approval (now with polling!)
        const approved = await this.requestHumanApproval(action);
        if (approved) {
          await this.approvalCache.approve(action.agentId, action.actionName, action.parameters);
          decision = 'ALLOW';
        } else {
          decision = 'BLOCK';
        }
      }
    }

    // Execute if allowed
    if (decision === 'ALLOW') {
      if (dryRun) {
        success = true;
      } else {
        try {
          output = await this.executeAction(action);
          success = true;
        } catch (e: any) {
          success = false;
          error = e.message;
        }
      }
    } else if (decision === 'BLOCK' && (action as any).shadowMode) {
      decision = 'SHADOW_BLOCK';
      success = true;
      output = '[SHADOW] Action appeared successful.';
    } else {
      success = false;
    }

    // Log it (async, but we don't block on it for performance)
    this.auditLogger.log({
      timestamp: new Date().toISOString(),
      agentId: action.agentId,
      action: action,
      decision: decision,
      result: { success, output, error, dryRun },
    }).catch(e => console.error('Audit log error:', e));

    return { decision, success, output, error };
  }

  private async requestHumanApproval(action: Action): Promise<boolean> {
    await this.approvalCache.requestApproval(action.agentId, action.actionName, action.parameters);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n--- PERMISCOPE SECURITY ALERT ---');
    console.log(`Agent '${action.agentId}' wants to perform: ${action.actionName}`);
    console.log('Parameters:', JSON.stringify(action.parameters, null, 2));
    if (action.reason) console.log('Reason:', action.reason);
    console.log('👉 Go to http://localhost:3000 to approve, OR respond here.');

    return new Promise((resolve) => {
      // Poll for external approval (Dashboard)
      const pollInterval = setInterval(async () => {
        const approved = await this.approvalCache.isApproved(action.agentId, action.actionName, action.parameters);
        const rejected = await this.approvalCache.isRejected(action.agentId, action.actionName, action.parameters);

        if (approved) {
          clearInterval(pollInterval);
          rl.close();
          console.log('\n✅ Approved via Dashboard.');
          resolve(true);
        } else if (rejected) {
          clearInterval(pollInterval);
          rl.close();
          console.log('\n❌ Rejected via Dashboard.');
          resolve(false);
        }
      }, 500);

      rl.question('Allow this action? (y/N): ', (answer) => {
        if (rl.line !== undefined) { // Check if not already closed by poll
          clearInterval(pollInterval);
          rl.close();
          resolve(answer.toLowerCase() === 'y');
        }
      });
    });
  }

  private async executeAction(action: Action): Promise<any> {
    const { actionName, parameters } = action;

    // 1. Try Custom Executors first
    if (this.customExecutors[actionName]) {
      return await this.customExecutors[actionName](parameters);
    }

    // 2. Fallback to Built-in Executors
    switch (actionName) {
      case 'read_file':
        if (!parameters.path) throw new Error('Missing path parameter');
        const fs = require('fs').promises;
        return await fs.readFile(parameters.path, 'utf-8');

      case 'write_file':
        if (!parameters.path) throw new Error('Missing path parameter');
        const content = parameters.content || '';
        const fsWrite = require('fs').promises;
        await fsWrite.writeFile(parameters.path, content, 'utf-8');
        return `File written to ${parameters.path}`;

      case 'run_command':
        if (!parameters.command) throw new Error('Missing command parameter');
        const cp = require('child_process');
        return new Promise((resolve, reject) => {
          cp.exec(parameters.command, (error: any, stdout: string, stderr: string) => {
            if (error) {
              reject(new Error(`Command failed: ${stderr || error.message}`));
            } else {
              resolve(stdout.trim());
            }
          });
        });

      default:
        throw new Error(`Unknown action type: ${actionName} - No executor available.`);
    }
  }
}
