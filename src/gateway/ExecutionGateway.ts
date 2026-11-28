import * as readline from 'readline';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { Action, PermissionDecision, Postcondition } from '../core/types';
import { parseCommand } from '../engine/commandPolicy';
import { resolveGuardedPath } from '../engine/pathGuard';
import { PolicyEngine } from '../engine/PolicyEngine';
import { AuditLogger } from '../logging/AuditLogger';
import { ApprovalCache } from './ApprovalCache';
import { Budget, BudgetRemaining, BudgetStore, BudgetTracker } from './BudgetTracker';

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

interface ExecutionOutcome {
  success: boolean;
  output: any;
  error?: string;
  reasonCode?: string;
  executed: boolean;
  compensated: boolean;
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
  /** Optional shared backend used when the gateway builds its own tracker. */
  budgetStore?: BudgetStore;
  /** Present blocked actions as successful without executing them. Host-only. */
  shadowMode?: boolean;
  /** Clock for audit timestamps. Defaults to the system clock; fixtures inject a fixed one. */
  clock?: () => Date;
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
  private clock: () => Date;

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
    this.clock = options.clock ?? (() => new Date());
    if (!this.budgetTracker && options.budget) {
      this.budgetTracker = new BudgetTracker(
        { [this.defaultPrincipalId]: options.budget },
        options.budgetStore,
      );
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
    if (prepared.budgetExceeded) {
      return {
        decision: 'BLOCK',
        success: false,
        sideEffects: 'none',
        reasonCode: 'BUDGET_EXCEEDED',
        error: 'Principal budget exceeded',
      };
    }

    const { governedAction, identity, shadow } = prepared;
    let { decision, reasonCode } = prepared;
    let error: string | undefined;

    // Re-resolve immediately before use and open the canonical path, closing
    // the gap between the policy-time realpath check and the executor's open().
    const canonical = this.guardCanonicalPath(governedAction, decision, dryRun);
    const actionForExecution = canonical.action;
    decision = canonical.decision;
    if (canonical.reasonCode) reasonCode = canonical.reasonCode;
    error = canonical.error;

    // INTENT is written before any side effect; strict logging blocks here.
    const intentHash = await this.writeIntent(identity, governedAction, decision);

    // Reserve only after INTENT is durable; another caller may have used the
    // last slot in between.
    let budgetRemaining = prepared.budgetRemaining;
    const reservation = await this.reserveExecution(identity, decision, dryRun);
    if (reservation.remaining !== undefined) budgetRemaining = reservation.remaining;
    if (!reservation.allowed) {
      decision = 'BLOCK';
      reasonCode = 'BUDGET_EXCEEDED';
      error = reservation.error;
    }

    const executedOutcome = await this.executeOutcome(
      decision,
      shadow,
      dryRun,
      actionForExecution,
      executor,
      error,
    );
    if (executedOutcome.reasonCode) reasonCode = executedOutcome.reasonCode;

    // Await the record: a detached promise both loses strict-mode failures and
    // leaves a lockfile handle open when a test or process exits.
    await this.writeResult(identity, governedAction, decision, intentHash, executedOutcome, dryRun);

    return {
      decision,
      success: executedOutcome.success,
      sideEffects: executedOutcome.executed ? 'committed' : 'none',
      output: executedOutcome.output,
      error: executedOutcome.error,
      reasonCode,
      matchedScope: prepared.matchedScope,
      remediation: prepared.remediation,
      budgetRemaining,
      ...(executedOutcome.compensated ? { compensated: true } : {}),
    };
  }

  private guardCanonicalPath(
    action: Action,
    decision: PermissionDecision,
    dryRun: boolean,
  ): { action: Action; decision: PermissionDecision; reasonCode?: string; error?: string } {
    const isFileAction = action.actionName === 'read_file' || action.actionName === 'write_file';
    if (decision !== 'ALLOW' || dryRun || !isFileAction) return { action, decision };

    const roots = Array.from(
      new Set(this.policyEngine.scopesFor(action).flatMap((scope) => scope.allowedPaths ?? [])),
    );
    const guarded = resolveGuardedPath(action.parameters.path, roots);
    if (!guarded.ok) {
      return { action, decision: 'BLOCK', reasonCode: 'GUARDRAIL_PATH', error: guarded.reason };
    }
    return {
      action: { ...action, parameters: { ...action.parameters, path: guarded.path } },
      decision,
    };
  }

  private async writeIntent(
    identity: string,
    action: Action,
    decision: PermissionDecision,
  ): Promise<string> {
    const intentHash = createHash('sha256')
      .update(JSON.stringify({ action, decision, principal: identity }))
      .digest('hex');
    await this.auditLogger.log({
      timestamp: this.clock().toISOString(),
      agentId: identity,
      action,
      decision,
      phase: 'INTENT',
      intentHash,
      result: { planned: true },
    });
    return intentHash;
  }

  private async reserveExecution(
    identity: string,
    decision: PermissionDecision,
    dryRun: boolean,
  ): Promise<{ allowed: boolean; remaining?: BudgetRemaining; error?: string }> {
    if (dryRun || decision !== 'ALLOW' || !this.budgetTracker) return { allowed: true };
    const reserved = await this.budgetTracker.consumeExecution(identity);
    if (!reserved.allowed) {
      return { allowed: false, remaining: reserved.remaining, error: 'Principal budget exceeded' };
    }
    return { allowed: true, remaining: reserved.remaining };
  }

  private executeOutcome(
    decision: PermissionDecision,
    shadow: boolean,
    dryRun: boolean,
    action: Action,
    executor?: ActionExecutor,
    blockError?: string,
  ): Promise<ExecutionOutcome> {
    if (shadow) {
      return Promise.resolve({
        success: true,
        output: '[SHADOW] Action appeared successful.',
        executed: false,
        compensated: false,
      });
    }
    if (decision === 'ALLOW' && dryRun) {
      return Promise.resolve({ success: true, output: null, executed: false, compensated: false });
    }
    if (decision !== 'ALLOW') {
      return Promise.resolve({
        success: false,
        output: null,
        error: blockError,
        executed: false,
        compensated: false,
      });
    }
    return this.executeWithPostconditions(action, executor);
  }

  private async executeWithPostconditions(
    action: Action,
    executor?: ActionExecutor,
  ): Promise<ExecutionOutcome> {
    try {
      const output = await this.executeAction(action, executor);
      const failed = await this.findFailedPostcondition(action, output);
      if (!failed) {
        return { success: true, output, executed: true, compensated: false };
      }

      let error = `Postcondition failed: ${failed.description ?? 'check'}`;
      let compensated = false;
      if (failed.compensate) {
        try {
          await failed.compensate(action, output);
          compensated = true;
        } catch (compensationError: any) {
          error += `; compensation failed: ${compensationError.message}`;
        }
      }
      return {
        success: false,
        output,
        error,
        reasonCode: 'POSTCONDITION_FAILED',
        executed: true,
        compensated,
      };
    } catch (e: any) {
      return { success: false, output: null, error: e.message, executed: true, compensated: false };
    }
  }

  private async findFailedPostcondition(
    action: Action,
    output: any,
  ): Promise<Postcondition | undefined> {
    for (const scope of this.policyEngine.scopesFor(action)) {
      for (const postcondition of scope.postconditions ?? []) {
        let passed = false;
        try {
          passed = await postcondition.check(action, output);
        } catch {
          passed = false;
        }
        if (!passed) return postcondition;
      }
    }
    return undefined;
  }

  private async writeResult(
    identity: string,
    action: Action,
    decision: PermissionDecision,
    intentHash: string,
    outcome: ExecutionOutcome,
    dryRun: boolean,
  ): Promise<void> {
    await this.auditLogger.log({
      timestamp: this.clock().toISOString(),
      agentId: identity,
      action,
      decision,
      phase: 'RESULT',
      intentHash,
      result: { success: outcome.success, output: outcome.output, error: outcome.error, dryRun },
    });
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
