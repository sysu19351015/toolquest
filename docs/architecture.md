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

The local Web adapter defaults to a read-only RunObserver interface beside MCP.
The Agent host owns the single MCP writer; the Web observer reads the same
absolute state directory. Explicit Playground mode is a separate human writer,
using a separate default directory. No adapter duplicates room rules.

Agent metadata and labels belong to RunRecord, not GameState. They are optional,
strictly validated public text and never affect state hashes or room scoring.
Storage version 1 remains readable when these fields are absent.

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
a process restart. Temporary files are removed on both success and failure.
Reads validate state fields, contiguous event sequences, and cached-action
structure before returning a record. list_runs enumerates only safe run file
names and projects records into public summaries. One state directory supports
one writer process; distributed locking and multi-process transactions are
deliberately deferred.

The JSONL sink remains a best-effort public trace. A trace write failure is
diagnosed on stderr and does not roll back authoritative state. Public events
redact submitted answers, while persisted action-cache keys use SHA-256
digests rather than plaintext arguments.

Replay starts from the first event's room, seed, and timestamp, then invokes the
same deterministic domain operations. It validates event sequence, run and room
identity, state versions, state hashes, outcomes, messages, and final state.
Reports render only public events and replay results.

## Local Web boundary

The visual CLI binds to IPv4 loopback and rejects foreign hosts and origins.
Observer mode exposes only read operations and does not return a write token.
An observation response reads the snapshot and timeline from one record to avoid
mixing two versions. Per-run SSE reads record.events every 500 ms, emits eventSeq
IDs, resumes after Last-Event-ID, and clears timers when the client disconnects.
The console periodically refreshes the newest 100 run summaries for discovery.

Playground mode must be explicitly selected. A random per-process page token
protects its write routes. Bodies are capped and validated by the MCP schemas.
Responses disable caching, framing, content sniffing, and inline code.

The event stream describes accepted game calls and world failures only. Adapter
validation errors, private model reasoning, tokens, and costs are not recorded.
Wall time between events includes Agent deliberation and is not tool latency.

## Adding a room

A room definition contains metadata, locations, exits, visible objects,
interactions, items, a final answer, and terminal rules. A set-flag interaction
may require an inventory item, a previously established flag, or both.

Add a trusted definition under src/domain/rooms and register it in
BuiltInRoomCatalog. Give the room a difficulty and parActions value, then cover
its successful path and prerequisite failures in tests. Loading external YAML
or scripts is not supported yet.
