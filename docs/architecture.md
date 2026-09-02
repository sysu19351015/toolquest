# Architecture

## Dependency direction

    server and transport
            |
        MCP adapter
            |
       application
            |
          domain

Infrastructure implements application ports and may depend on domain types.
The domain and application layers must not import the MCP SDK.

## Main invariants

- A run is addressed only by its opaque runId.
- Different runs never share world state, inventory, action cache, or events.
- eventSeq increases for every recorded game call.
- stateVersion increases only when virtual world state changes.
- A mutating command must match the current stateVersion.
- An exact actionId retry returns the original result without a second effect.
- The same actionId with different arguments is rejected.
- Identical seed, room version, and action sequence produce the same state hash.
- Hidden room data reaches MCP output only through a public projection.

## Error semantics

Game-world failures are not transport failures. A locked mechanism or incorrect
answer produces a normal structured result and a world_failure event.

Correctable invocation problems, including unknown runs, invisible targets, and
version conflicts, produce an MCP tool error with a stable code, retryable flag,
and recoveryHint.

Unexpected exceptions are reduced to a correlation ID. Stack traces and local
paths are written only to stderr.

## Event storage

The in-memory RunRecord is the authoritative state for version 0.1. The JSONL
sink is a best-effort public trace used for replay and reports. A trace write
failure is diagnosed on stderr and does not roll back a committed game action.

Crash recovery and a transactional persistent event store are deliberately
deferred.

## Adding a room

A room definition contains locations, exits, visible objects, interactions,
items, a final answer, and terminal rules. Room definitions are trusted source
code in version 0.1. Loading external YAML or scripts is not supported yet.
