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
}

export interface PermissionScope {
  actionName: ActionType;
  decision: PermissionDecision;
  // Basic guardrails
  allowedPaths?: string[];
  blockedCommandPatterns?: string[]; // regex strings
  // Dynamic Policy-as-Code
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
  result?: any;
  previousHash?: string;
  signature?: string;
  sequence?: number;
  keyId?: string;
}
