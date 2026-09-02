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
- Efficiency scoring uses each room's published par action count.
- Interaction prerequisites fail as world outcomes and never mutate state.

## Error semantics

Game-world failures are not transport failures. A locked mechanism or incorrect
answer produces a normal structured result and a world_failure event.

Correctable invocation problems, including unknown runs, invisible targets, and
version conflicts, produce an MCP tool error with a stable code, retryable flag,
and recoveryHint.

Unexpected exceptions are reduced to a correlation ID. Stack traces and local
paths are written only to stderr.

## Event storage

The default FileRunRepository stores one versioned JSON envelope per run under
.toolquest/state. Saves write a uniquely named temporary file and atomically
rename it over the destination. This makes a completed save recoverable after
a process restart. One state directory supports one writer process; distributed
locking and multi-process transactions are deliberately deferred.

The JSONL sink remains a best-effort public trace. A trace write failure is
diagnosed on stderr and does not roll back authoritative state. Public events
redact submitted answers, while persisted action-cache keys use SHA-256
digests rather than plaintext arguments.

Replay starts from the first event's room, seed, and timestamp, then invokes the
same deterministic domain operations. It validates event sequence, run and room
identity, state versions, state hashes, outcomes, messages, and final state.
Reports render only public events and replay results.

## Adding a room

A room definition contains metadata, locations, exits, visible objects,
interactions, items, a final answer, and terminal rules. A set-flag interaction
may require an inventory item, a previously established flag, or both.

Add a trusted definition under src/domain/rooms and register it in
BuiltInRoomCatalog. Give the room a difficulty and parActions value, then cover
its successful path and prerequisite failures in tests. Loading external YAML
or scripts is not supported yet.
