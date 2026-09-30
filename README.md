# ToolQuest

A deterministic task environment and live observation console for tool-using agents.

ToolQuest exposes deterministic puzzle rooms as a local Model Context Protocol
(MCP) server. The Agent plays through tools, ToolQuest records and scores its
actions, and a human evaluator watches the public trace in a read-only console.

[简体中文](README.zh-CN.md)

## Why ToolQuest?

Most agent demos show only the final answer. ToolQuest makes the path testable:

- deterministic room state and scoring;
- strict, machine-readable tool results;
- explicit run isolation and optimistic state versions;
- idempotency keys for safe action retries;
- atomic local run persistence and restart recovery;
- deterministic replay verification and Markdown reports;
- JSONL traces with redacted final answers;
- no LLM judge and no external service required.

## Quick start

Requirements: Node.js 20 or newer.

    npm install
    npm run check
    npm run build

Configure the stdio server in your Agent host. Use real absolute paths and
the same `TOOLQUEST_STATE_DIR` for both the Agent and the observation console:

    {
      "mcpServers": {
        "toolquest": {
          "command": "node",
          "args": ["/absolute/path/to/toolquest/dist/server.js"],
          "env": {
            "TOOLQUEST_STATE_DIR": "/absolute/path/to/toolquest/.toolquest/state"
          }
        }
      }
    }

In a separate terminal, set that same absolute state-directory environment
variable, then run:

    npm run web

Open `http://127.0.0.1:4310`. The Agent host starts the MCP writer; the Web
console only reads its state. Keep exactly one writer per state directory.
See [the evaluation guide](docs/evaluation-guide.md) for a complete Windows
example, Agent instructions, inputs, outputs, and troubleshooting.

## Agent loop

1. Call list_rooms and choose a challenge.
2. Call start_run with roomId, optional seed, public agent metadata, and label.
3. Call look with the returned runId.
4. Inspect visible target IDs to discover clues and interaction IDs.
5. Use move or use with a unique actionId and the latest stateVersion.
6. Call submit when the final mechanism is ready and you know the answer.
7. Call replay_run to verify the trace and export_report for a Markdown result.

After a client or server restart, call list_runs to rediscover recent run IDs,
then call get_run and continue from the returned stateVersion and public
snapshot.

## Agent Evaluation Console

Version 0.5 makes the homepage a read-only observation console. It discovers
runs, identifies the Agent and model when provided, and streams recorded events
over SSE. Inspect public tool inputs, environment outputs, event timestamps,
state versions, hashes, snapshots, terminal scores, and replay verification.
Reports include Agent context, elapsed event time, tool counts, and public input.
Overview metrics describe the newest 100 runs, not an all-time benchmark.

Observer requests never call gameplay tools or append events. ToolQuest does
not expose hidden definitions, the submitted answer field, or action digests.
Agent metadata, seeds and labels are public: do not put secrets or prompts in them.

The former human-operated interface remains an explicit Playground:

    npm run playground

Visit `http://127.0.0.1:4310/playground`. By default its state and traces use
separate Playground directories. Never point a Playground writer and an MCP
writer at the same state directory. The Web service binds to `127.0.0.1`, checks
the request host/origin, and requires a page token for Playground writes.

## MCP tools

| Tool | Purpose | Changes world state |
| --- | --- | --- |
| list_rooms | Discover challenges, difficulty, and par actions | No |
| list_runs | Discover recent persisted runs; filter by status and limit | No |
| start_run | Create an isolated deterministic run | Creates a run |
| get_run | Resume a persisted run with a public snapshot | No |
| replay_run | Rebuild and verify a run from its event log | No |
| export_report | Return a redacted Markdown benchmark report | No |
| look | Read location, objects, exits, and inventory | No |
| inspect | Read an object's clue and interactions | No |
| move | Move to a destination returned by look | Yes |
| use | Execute an interaction returned by inspect | Sometimes |
| submit | Submit the final room answer | Sometimes |

Mutating calls require:

- actionId: a unique retry key;
- expectedStateVersion: the latest version returned by ToolQuest.

An exact retry with the same actionId returns the cached first result. Reusing
an actionId with different arguments is rejected.

## Result shape

Every successful call returns text for broad client compatibility and
structuredContent for deterministic automation:

    {
      "ok": true,
      "runId": "run_...",
      "eventSeq": 8,
      "stateVersion": 3,
      "stateHash": "ed39a61c",
      "status": "active",
      "message": "The brass key turns.",
      "data": {},
      "events": []
    }

Normal game failures, such as using the wrong item or missing an interaction
prerequisite, remain successful MCP calls
with a world_failure event. Invalid IDs, stale versions, and missing runs are
recoverable MCP tool errors with a stable code and recoveryHint.

## Persistent runs and traces

By default, the stdio server atomically persists authoritative run state and
appends a separate public event trace:

    .toolquest/state/<runId>.json
    .toolquest/runs/<runId>.jsonl

Use TOOLQUEST_STATE_DIR to change the state directory. Set
TOOLQUEST_DISABLE_STATE=1 for ephemeral in-memory runs, or
TOOLQUEST_DISABLE_TRACES=1 to disable public traces.

State files are private server data. Idempotency checks use SHA-256 argument
digests; public action arguments are also recorded in events. The submitted
answer field is not stored in plaintext: submission events contain answer
length and outcome instead. Run discovery returns only public summaries.
Structurally malformed state files fail closed instead of returning partial records.

## Architecture

    MCP transport
          |
    MCP schema and presenters
          |
    RunService
          |
    deterministic domain engine
          |
    repository, clock, IDs, event sink

The domain and application layers do not import the MCP SDK. See
[docs/architecture.md](docs/architecture.md) for boundaries and invariants.

## Development

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run check

The test suite includes domain and application tests, Observer read-only access,
cross-service SSE, client race/reconnect recovery, Agent metadata, Playground API security and flow,
restart discovery and recovery, malformed-state rejection, tamper-detecting
replay, report redaction, an in-memory MCP contract test, and isolated real
stdio subprocess tests.

## Built-in rooms

| Room ID | Difficulty | What it tests |
| --- | --- | --- |
| the-vault | Starter | Exploration, clue combination, item use |
| signal-station | Intermediate | Multi-location planning, consumed items, chained prerequisites |

Each room publishes a par action count so efficiency scores remain comparable
as scenarios become more complex.

## Current scope

Version 0.5 provides the MCP task environment, read-only live observation,
optional public Agent metadata, explicit human Playground, two built-in rooms,
eleven tools, restart recovery, deterministic replay, and detailed reports.

This release does not start or configure models, store API keys, schedule
batches, compare model quality, or collect private chain-of-thought, tokens,
model cost, or adapter-level invocation errors. Event gaps are not tool latency.
Scoring remains the existing room heuristic (including a fixed safety component),
not a validated general Agent capability benchmark. Remote hosting, authentication,
community rooms, multi-writer transactions, and public leaderboards are deferred.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](SECURITY.md).
Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

MIT
