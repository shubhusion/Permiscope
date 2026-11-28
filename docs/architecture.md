# Architecture

Permiscope is a **mediated execution layer** that sits between an external system (agent, script, or workflow) and real-world resources. Every action an external system wants to perform must pass through Permiscope's secure gateway.

## Overview

![Permiscope architecture](./assets/permiscope-architecture.svg)

The diagram shows the main path: an agent SDK calls the gateway through an adapter;
Python and other languages use the HTTP sidecar; MCP and the console are additional
governed consumers. Credentials travel in request context, never on the `Action`.

## Components

### PermiscopeAdapter
- **Role**: Primary integration API.
- **Responsibility**: Provides a framework-agnostic way to wrap execution and route actions through the gateway.
- **Location**: `src/adapters/PermiscopeAdapter.ts`

### ExecutionGateway
- **Role**: Central orchestrator.
- **Responsibility**: Coordinates policy evaluation, approval handling, execution, and logging.
- **Location**: `src/gateway/ExecutionGateway.ts`

### PolicyEngine
- **Role**: Decision maker
- **Responsibility**: Evaluates actions against defined policies and guardrails
- **Location**: `src/engine/PolicyEngine.ts`

### ApprovalCache
- **Role**: State manager for approvals
- **Responsibility**: Tracks pending, approved, and rejected requests with TTL
- **Location**: `src/gateway/ApprovalCache.ts`

### AuditLogger
- **Role**: Immutable record keeper
- **Responsibility**: Writes a signed INTENT record before execution and a linked RESULT
  record afterwards; maintains a tamper-evident hash chain and redacts credentials and
  sensitive output
- **Location**: `src/logging/AuditLogger.ts`

### Supporting components
- **Request context** (`src/core/requestContext.ts`): `AsyncLocalStorage` carrier for the
  bearer token; `verifiedPrincipalProvider` (`src/auth/verifiedPrincipal.ts`) resolves it
  to a principal with roles.
- **BudgetTracker** (`src/gateway/BudgetTracker.ts`): separates attempts from executions
  and atomically reserves a call just before the side effect.
- **IdempotencyCache** (`src/gateway/IdempotencyCache.ts`): bounded, TTL'd replay cache
  keyed by principal and `Idempotency-Key`.
- **HTTP sidecar** (`src/sidecar/server.ts`): loopback API for language-agnostic clients.
- **McpGovernor** (`src/adapters/McpGovernor.ts`): governs MCP tool calls.

## Data Flow

1. **Request**: caller uses `act()`/`wrap()`, the sidecar, an MCP tool or the console.
2. **Identity**: gateway resolves a verified principal from request context; the
   caller-supplied `agentId` is never trusted for identity.
3. **Budget**: an attempt is recorded and a non-mutating preflight runs; a blocked call
   does not burn an execution.
4. **Policy**: `PolicyEngine` applies `when` (skip) and `guard` (deny) predicates plus
   path/command guardrails; unsafe regexes are rejected when the policy is constructed.
5. **Approval**: `REQUIRE_APPROVAL` uses the identity-bound, TTL'd approval cache or waits
   for a human and fails closed if no decision arrives.
6. **INTENT**: a signed record with the decision and `intentHash` is written before any
   side effect; strict logging blocks the action if this write fails.
7. **Execution**: budgets reserve one execution, file paths are re-resolved to their
   canonical form, and the executor runs. Postconditions detect violations after the
   fact; they do not undo committed side effects.
8. **RESULT**: a second signed record with the same `intentHash` records the outcome.
9. **Response**: the result is returned; an `Idempotency-Key` replay skips steps 2–8.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| **Agent ↔ Adapter** | Untrusted input. Parameters are checked by policy guardrails. |
| **Gateway ↔ PolicyEngine** | Internal, trusted interface. |
| **Gateway ↔ System** | Actions are mediated. No direct agent access. |
| **Dashboard ↔ ApprovalCache** | Requires authentication token. |

## Key Design Principles

1. **Default Deny**: Unknown actions are blocked.
2. **Fail Closed**: Errors in validators or logging fail to BLOCK.
3. **Immutable Audit**: Hash chain prevents log tampering.
4. **Human Override**: Sensitive actions require explicit approval.
5. **Two-Phase Audit**: INTENT precedes side effects; RESULT records the outcome.
