# 1. Cooperative governance, not a sandbox

- Status: Accepted
- Date: 2026-11-28

## Context

Permiscope mediates tool calls made by an AI agent. The agent could also open a socket,
load a native module, spawn a process or read files directly, bypassing every API we
control. The project had to state honestly which adversary it can stop.

## Decision

Permiscope governs actions that pass through its APIs. It is cooperative security: a
non-adversarial or semi-adversarial agent that asks the host to perform work is mediated.
A fully adversarial agent with code execution in the same process is out of scope and
must be contained by OS isolation (containers, VMs, seccomp, network policy).

The eval corpus and threat model are scoped to this boundary. Documentation leads with
the limitation rather than hiding it.

## Consequences

- A determined agent can bypass governance; OS isolation remains necessary.
- Guardrails can be strict without pretending to be a process sandbox.
- Every deployment guide must repeat that Permiscope is not a sandbox.

## Alternatives

- **Process sandbox / syscall interception** — rejected: different product, not achievable
  as a TypeScript library, and would require native code.
- **Assume the agent is trusted** — rejected: prompt injection and bugs make even benign
  agents produce hostile parameters.
