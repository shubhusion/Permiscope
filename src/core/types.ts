export type ActionType =
  'read_file' | 'write_file' | 'run_command' | 'call_api' | 'send_email' | string;

export interface Action {
  actionName: ActionType;
  parameters: Record<string, any>;
  agentId: string;
  reason?: string;
  timestamp: Date;
  roles?: string[];
}

export type PermissionDecision = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL' | 'SHADOW_BLOCK';

export interface Postcondition {
  description?: string;
  check: (action: Action, output: any) => boolean | Promise<boolean>;
  /** Best-effort rollback when the check fails. Detection is guaranteed; undo is not. */
  compensate?: (action: Action, output: any) => void | Promise<void>;
}

export interface PermissionScope {
  actionName: ActionType;
  decision: PermissionDecision;
  // Basic guardrails
  allowedPaths?: string[];
  /**
   * Executable allowlist for `run_command`. Each entry is a shell-like prefix
   * parsed without a shell, e.g. `"git status"` or `"npm test"`. The parsed
   * action argv must start with one entry. An explicitly empty list denies all
   * commands; `undefined` leaves the executable unrestricted.
   */
  allowedCommands?: string[];
  blockedCommandPatterns?: string[]; // regex strings
  // Dynamic Policy-as-Code
  /** Predicate for scope applicability: false skips this scope. */
  when?: (action: Action) => boolean | Promise<boolean>;
  /** Predicate that must hold: false denies, even if another scope allows. */
  guard?: (action: Action) => boolean | Promise<boolean>;
  /** Legacy applicability predicate (same skip semantics as `when`). */
  validator?: (action: Action) => boolean | Promise<boolean>;
  roles?: string[];
  // Checked after the executor runs
  postconditions?: Postcondition[];
}

export interface Policy {
  scopes: PermissionScope[];
}

export interface DecisionExplanation {
  decision: PermissionDecision;
  reasonCode: string;
  matchedScope?: string;
  remediation?: string;
}

export interface AuditLogEntry {
  timestamp: string;
  agentId: string;
  action: Action;
  decision: PermissionDecision;
  /** INTENT is written before any side effect; RESULT records the outcome. */
  phase?: 'INTENT' | 'RESULT';
  /** Links a RESULT to the INTENT record it follows. */
  intentHash?: string;
  result?: any;
  previousHash?: string;
  signature?: string;
  sequence?: number;
  keyId?: string;
}
