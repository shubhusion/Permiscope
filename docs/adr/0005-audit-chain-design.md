# 5. Unkeyed links, keyed signatures, signed head

- Status: Accepted
- Date: 2026-11-28

## Context

An audit log must prove sequence, detect tampering and survive HMAC key rotation. A chain
whose links are keyed by HMAC breaks when the key changes; a backward chain alone cannot
detect removal of the tail.

## Decision

Each entry carries a sequence number, `previousHash` and an unkeyed SHA-256 link. Each
entry is separately HMAC-signed with the active key and records its `keyId`; verification
uses a key ring so old entries remain verifiable. A signed head record stores the last
sequence and hash under the same lock as the append, detecting tail truncation.

## Consequences

- Key rotation does not invalidate historical links.
- Verification requires the correct key ring for every referenced `keyId`.
- The head record must be written under the same lock; a detached write would race.

## Alternatives

- **Keyed hash chain** — rejected: rotation invalidates all previous links.
- **No head record** — rejected: truncated tails verify successfully.
