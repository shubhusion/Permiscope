import * as readline from 'readline';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { Action, PermissionDecision } from '../core/types';
import { parseCommand } from '../engine/commandPolicy';
import { resolveGuardedPath } from '../engine/pathGuard';
import { PolicyEngine } from '../engine/PolicyEngine';
import { AuditLogger } from '../logging/AuditLogger';
import { ApprovalCache } from './ApprovalCache';
import { Budget, BudgetRemaining, BudgetTracker } from './BudgetTracker';

export type ActionExecutor = (params: any) => Promise<any>;
export type PrincipalProvider = (action: Action) => Principal | Promise<Principal>;
export type Approver = (request: ApprovalRequest) => Promise<boolean>;

export interface Principal {
  id: string;
  roles?: string[];
}

export interface ApprovalRequest {
  agentId: string;
  actionName: string;
  params: Record<string, any>;
  reason?: string;
}

export interface GatewayResult {
  decision: PermissionDecision;
  success: boolean;
  /** Postconditions detect violations after execution; the side effect stays committed.
   * Always set by `run()`; optional to keep custom GatewayResult producers compatible. */
  sideEffects?: 'none' | 'committed';
  output?: any;
  error?: string;
  reasonCode?: string;
  matchedScope?: string;
  remediation?: string;
  budgetRemaining?: BudgetRemaining;
  /** True when an optional postcondition compensation hook succeeded. */
  compensated?: boolean;
  /** True when this result came from an idempotency replay, not a fresh execution. */
  replayed?: boolean;
}

export interface GatewayOptions {
  defaultPrincipalId?: string;
  principalProvider?: PrincipalProvider;
  approver?: Approver;
  approvalTimeoutMs?: number;
  approvalPollIntervalMs?: number;
  approvalCache?: ApprovalCache;
  auditLogger?: AuditLogger;
  budget?: Budget;
  budgetTracker?: BudgetTracker;
  /** Present blocked actions as successful without executing them. Host-only. */
  shadowMode?: boolean;
}

export class ExecutionGateway {
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;
  private approvalCache: ApprovalCache;
  private customExecutors: Record<string, ActionExecutor>;
  private defaultPrincipalId: string;
  private principalProvider?: PrincipalProvider;
  private approver?: Approver;
  private approvalTimeoutMs: number;
  private approvalPollIntervalMs: number;
  private closed = false;
  private cancelWaits = new Set<() => void>();
  private budgetTracker?: BudgetTracker;
  private shadowMode: boolean;

  constructor(
    policyEngine: PolicyEngine,
    customExecutors: Record<string, ActionExecutor> = {},
    options: GatewayOptions = {},
  ) {
    this.policyEngine = policyEngine;
    this.auditLogger = options.auditLogger ?? new AuditLogger();
    this.approvalCache = options.approvalCache ?? new ApprovalCache();
    this.customExecutors = customExecutors;
    this.defaultPrincipalId = options.defaultPrincipalId ?? 'external-system';
    this.principalProvider = options.principalProvider;
    this.approver = options.approver;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 30_000;
    this.approvalPollIntervalMs = options.approvalPollIntervalMs ?? 500;
    this.budgetTracker = options.budgetTracker;
    this.shadowMode = options.shadowMode ?? false;
    if (!this.budgetTracker && options.budget) {
      this.budgetTracker = new BudgetTracker({ [this.defaultPrincipalId]: options.budget });
    }
  }

  /** Stops in-flight approval waits; pending actions fail closed. */
  close(): void {
    this.closed = true;
    for (const cancel of Array.from(this.cancelWaits)) cancel();
    this.cancelWaits.clear();
  }

  /** Evaluates a governed action without executing or waiting for approval. */
  async decide(action: Action): Promise<PermissionDecision> {
    // A decide call still consumes a budget attempt: otherwise callers could
    // probe policies for free. It never executes the action.
    return (await this.decideInternal(action, true)).decision;
  }

  private async decideInternal(
    action: Action,
    dryRun: boolean,
  ): Promise<{
    governedAction: Action;
    identity: string;
    decision: PermissionDecision;
    reasonCode: string;
    matchedScope?: string;
    remediation?: string;
    budgetRemaining?: BudgetRemaining;
    budgetExceeded: boolean;
    shadow: boolean;
  }> {
    // Identity comes from the host-provided principal provider, never from the
    // caller-controlled agentId on the Action.
    const principal = this.principalProvider
      ? await this.principalProvider(action)
      : { id: this.defaultPrincipalId };
    const governedAction: Action = {
      ...action,
      agentId: principal?.id || this.defaultPrincipalId,
      roles: principal?.roles ?? action.roles,
    };

    const identity = governedAction.agentId;
    let budgetRemaining: BudgetRemaining | undefined;
    if (this.budgetTracker) {
      // Preflight does not mutate counters: a blocked call must not burn a
      // future execution. Attempts are recorded separately for observability.
      await this.budgetTracker.noteAttempt(identity);
      const budget = await this.budgetTracker.check(identity);
      if (!budget.allowed) {
        return {
          governedAction,
          identity,
          decision: 'BLOCK',
          reasonCode: 'BUDGET_EXCEEDED',
          budgetRemaining: budget.remaining,
          budgetExceeded: true,
          shadow: false,
        };
      }
      budgetRemaining = budget.remaining;
    }

    const explanation = await this.policyEngine.evaluateDetailed(governedAction);
    let decision = explanation.decision;
    let reasonCode = explanation.reasonCode;

    if (decision === 'REQUIRE_APPROVAL') {
      if (
        await this.approvalCache.isApproved(
          identity,
          governedAction.actionName,
          governedAction.parameters,
        )
      ) {
        decision = 'ALLOW';
        reasonCode = 'APPROVAL_GRANTED';
      } else if (dryRun) {
        // Report that approval would be needed without starting a wait.
      } else {
        const approved = await this.requestApproval(governedAction, identity);
        if (approved) {
          await this.approvalCache.approve(
            identity,
            governedAction.actionName,
            governedAction.parameters,
          );
          decision = 'ALLOW';
          reasonCode = 'APPROVAL_GRANTED';
        } else {
          decision = 'BLOCK';
          reasonCode = 'APPROVAL_NOT_GRANTED';
        }
      }
    }

    const shadow = decision === 'BLOCK' && this.shadowMode;
    if (shadow) decision = 'SHADOW_BLOCK';

    return {
      governedAction,
      identity,
      decision,
      reasonCode,
      matchedScope: explanation.matchedScope,
      remediation: explanation.remediation,
      budgetRemaining,
      budgetExceeded: false,
      shadow,
    };
  }

  async run(
    action: Action,
    dryRun: boolean = false,
    executor?: ActionExecutor,
  ): Promise<GatewayResult> {
    const prepared = await this.decideInternal(action, dryRun);
    const {
      governedAction,
      identity,
      decision: preparedDecision,
      budgetExceeded,
      shadow,
    } = prepared;
    let budgetRemaining = prepared.budgetRemaining;

    if (budgetExceeded) {
      return {
        decision: 'BLOCK',
        success: false,
        sideEffects: 'none',
        reasonCode: 'BUDGET_EXCEEDED',
        error: 'Principal budget exceeded',
      };
    }

    let decision = preparedDecision;
    let reasonCode = prepared.reasonCode;
    const matchedScope = prepared.matchedScope;
    const remediation = prepared.remediation;
    let success = false;
    let output = null;
    let error = undefined;
    let executed = false;
    let compensated = false;

    // Re-resolve file paths immediately before execution and use the canonical
    // path for the actual I/O. This closes the gap between the policy-time
    // realpath check and the open() performed by the executor.
    let actionForExecution = governedAction;
    if (
      decision === 'ALLOW' &&
      !dryRun &&
      (governedAction.actionName === 'read_file' || governedAction.actionName === 'write_file')
    ) {
      const roots = Array.from(
        new Set(
          this.policyEngine.scopesFor(governedAction).flatMap((scope) => scope.allowedPaths ?? []),
        ),
      );
      const guarded = resolveGuardedPath(governedAction.parameters.path, roots);
      if (!guarded.ok) {
        decision = 'BLOCK';
        reasonCode = 'GUARDRAIL_PATH';
        error = guarded.reason;
      } else {
        actionForExecution = {
          ...governedAction,
          parameters: { ...governedAction.parameters, path: guarded.path },
        };
      }
    }

    // Bind the eventual result to the decision made here. The INTENT record is
    // written before any side effect so strict logging can genuinely block it.
    const intentHash = createHash('sha256')
      .update(JSON.stringify({ action: governedAction, decision, principal: identity }))
      .digest('hex');
    await this.auditLogger.log({
      timestamp: new Date().toISOString(),
      agentId: identity,
      action: governedAction,
      decision,
      phase: 'INTENT',
      intentHash,
      result: { planned: true },
    });

    // Reserve the execution only after the intent is durably recorded. A
    // concurrent caller may have exhausted the budget in between.
    if (!dryRun && decision === 'ALLOW' && this.budgetTracker) {
      const reserved = await this.budgetTracker.consumeExecution(identity);
      budgetRemaining = reserved.remaining;
      if (!reserved.allowed) {
        decision = 'BLOCK';
        reasonCode = 'BUDGET_EXCEEDED';
        error = 'Principal budget exceeded';
      }
    }

    if (shadow) {
      success = true;
      output = '[SHADOW] Action appeared successful.';
    } else if (decision === 'ALLOW') {
      if (dryRun) {
        success = true;
      } else {
        try {
          executed = true;
          output = await this.executeAction(actionForExecution, executor);
          success = true;

          for (const scope of this.policyEngine.scopesFor(actionForExecution)) {
            for (const postcondition of scope.postconditions ?? []) {
              let passed = false;
              try {
                passed = await postcondition.check(actionForExecution, output);
              } catch {
                passed = false;
              }
              if (!passed) {
                success = false;
                error = `Postcondition failed: ${postcondition.description ?? 'check'}`;
                reasonCode = 'POSTCONDITION_FAILED';
                if (postcondition.compensate) {
                  try {
                    await postcondition.compensate(actionForExecution, output);
                    compensated = true;
                  } catch (compensationError: any) {
                    error += `; compensation failed: ${compensationError.message}`;
                  }
                }
                break;
              }
            }
            if (!success) break;
          }
        } catch (e: any) {
          success = false;
          error = e.message;
        }
      }
    } else {
      success = false;
    }

    // Await the record: a detached promise both loses strict-mode failures and
    // leaves a lockfile handle open when a test or process exits.
    await this.auditLogger.log({
      timestamp: new Date().toISOString(),
      agentId: identity,
      action: governedAction,
      decision,
      phase: 'RESULT',
      intentHash,
      result: { success, output, error, dryRun },
    });

    return {
      decision,
      success,
      sideEffects: executed ? 'committed' : 'none',
      output,
      error,
      reasonCode,
      matchedScope,
      remediation,
      budgetRemaining,
      ...(compensated ? { compensated: true } : {}),
    };
  }

  private async requestApproval(action: Action, identity: string): Promise<boolean> {
    await this.approvalCache.requestApproval(identity, action.actionName, action.parameters);
    const request: ApprovalRequest = {
      agentId: identity,
      actionName: action.actionName,
      params: action.parameters,
      reason: action.reason,
    };

    if (this.approver) {
      const approved = await this.approver(request);
      if (!approved) return false;
      await this.approvalCache.approve(identity, action.actionName, action.parameters);
      return true;
    }

    if (this.closed) return false;
    return this.waitForExternalDecision(
      identity,
      action.actionName,
      action.parameters,
      action.reason,
    );
  }

  /** Poll the dashboard with a hard timeout; no TTY means no interactive prompt. */
  private waitForExternalDecision(
    identity: string,
    actionName: string,
    params: Record<string, any>,
    reason?: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.closed) {
        resolve(false);
        return;
      }

      let settled = false;
      let rl: readline.Interface | undefined;

      const finish = async (approved: boolean): Promise<void> => {
        if (settled) return;
        settled = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        this.cancelWaits.delete(cancel);
        rl?.close();
        if (approved) {
          await this.approvalCache.approve(identity, actionName, params);
        }
        resolve(approved);
      };
      const cancel = (): void => {
        void finish(false);
      };

      const pollTimer = setInterval(() => {
        void (async () => {
          try {
            if (await this.approvalCache.isApproved(identity, actionName, params)) {
              await finish(true);
            } else if (await this.approvalCache.isRejected(identity, actionName, params)) {
              await finish(false);
            }
          } catch {
            await finish(false);
          }
        })();
      }, this.approvalPollIntervalMs);
      pollTimer.unref?.();

      const timeoutTimer = setTimeout(() => {
        void finish(false);
      }, this.approvalTimeoutMs);
      timeoutTimer.unref?.();
      this.cancelWaits.add(cancel);

      if (process.stdin.isTTY) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        console.log('\n--- PERMISCOPE SECURITY ALERT ---');
        console.log(`Agent '${identity}' wants to perform: ${actionName}`);
        console.log('Parameters:', JSON.stringify(params, null, 2));
        if (reason) console.log('Reason:', reason);
        rl.question('Allow this action? (y/N): ', (answer) => {
          void finish(answer.trim().toLowerCase() === 'y');
        });
      }
    });
  }

  private async executeAction(action: Action, executor?: ActionExecutor): Promise<any> {
    const { actionName, parameters } = action;

    // 1. A per-call executor (used by wrap()) wins, then configured executors.
    // Passing it through the gateway keeps one execution path and one audit entry.
    if (executor) return await executor(parameters);
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
