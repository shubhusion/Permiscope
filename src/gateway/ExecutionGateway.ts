import * as readline from 'readline';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { Action, PermissionDecision } from '../core/types';
import { parseCommand } from '../engine/commandPolicy';
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
      if (
        await this.approvalCache.isApproved(action.agentId, action.actionName, action.parameters)
      ) {
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
    this.auditLogger
      .log({
        timestamp: new Date().toISOString(),
        agentId: action.agentId,
        action: action,
        decision: decision,
        result: { success, output, error, dryRun },
      })
      .catch((e) => console.error('Audit log error:', e));

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
        const approved = await this.approvalCache.isApproved(
          action.agentId,
          action.actionName,
          action.parameters,
        );
        const rejected = await this.approvalCache.isRejected(
          action.agentId,
          action.actionName,
          action.parameters,
        );

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
        if (rl.line !== undefined) {
          // Check if not already closed by poll
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
        return await fs.promises.readFile(parameters.path, 'utf-8');

      case 'write_file':
        if (!parameters.path) throw new Error('Missing path parameter');
        const content = parameters.content || '';
        await fs.promises.writeFile(parameters.path, content, 'utf-8');
        return `File written to ${parameters.path}`;

      case 'run_command': {
        if (!parameters.command) throw new Error('Missing command parameter');
        const parsed = parseCommand(parameters.command);
        if (!parsed.ok) throw new Error(`Command rejected: ${parsed.reason}`);

        const [program, ...args] = parsed.argv;
        // `echo` is a shell builtin on Windows, not an executable. Emulate it so a
        // governed command behaves the same on every supported platform.
        if (
          process.platform === 'win32' &&
          program.split(/[\\/]/).pop()?.toLowerCase() === 'echo'
        ) {
          return args.join(' ');
        }

        const timeoutMs = typeof parameters.timeoutMs === 'number' ? parameters.timeoutMs : 10_000;
        const maxOutputBytes =
          typeof parameters.maxOutputBytes === 'number' ? parameters.maxOutputBytes : 1024 * 1024;

        return new Promise<string>((resolve, reject) => {
          const child = spawn(program, args, { shell: false, windowsHide: true });
          let stdout = '';
          let stderr = '';
          let timedOut = false;
          let overflowed = false;

          const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
          }, timeoutMs);
          timer.unref();

          const collect = (chunk: Buffer, stream: 'out' | 'err'): string => {
            const next = (stream === 'out' ? stdout : stderr) + chunk.toString('utf8');
            if (Buffer.byteLength(next, 'utf8') > maxOutputBytes) {
              overflowed = true;
              child.kill();
              return next.slice(0, maxOutputBytes);
            }
            return next;
          };

          child.stdout?.on('data', (chunk: Buffer) => {
            stdout = collect(chunk, 'out');
          });
          child.stderr?.on('data', (chunk: Buffer) => {
            stderr = collect(chunk, 'err');
          });
          child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut) reject(new Error(`Command timed out after ${timeoutMs}ms`));
            else if (overflowed)
              reject(new Error(`Command output exceeded ${maxOutputBytes} bytes`));
            else if (code === 0) resolve(stdout.trim());
            else reject(new Error(`Command failed: ${stderr.trim() || `exit code ${code}`}`));
          });
        });
      }

      default:
        throw new Error(`Unknown action type: ${actionName} - No executor available.`);
    }
  }
}
