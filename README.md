# ToolQuest

The escape room for tool-using agents.

ToolQuest exposes deterministic puzzle rooms as a local Model Context Protocol
(MCP) server. Connect an agent, let it explore with tools, and inspect a
reproducible event trace and score at the end.

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
    npm start

For the visual interface, run:

    npm run web

Then open `http://127.0.0.1:4310`. The interface is designed for non-technical
players and keeps all run data on the local machine.

The server communicates over stdio. A common MCP client configuration looks
like this; replace the path with an absolute path on your machine:

    {
      "mcpServers": {
        "toolquest": {
          "command": "node",
          "args": ["/absolute/path/to/toolquest/dist/server.js"]
        }
      }
    }

## Agent loop

1. Call list_rooms and choose a challenge.
2. Call start_run with the selected roomId.
3. Call look with the returned runId.
4. Inspect visible target IDs to discover clues and interaction IDs.
5. Use move or use with a unique actionId and the latest stateVersion.
6. Call submit when the final mechanism is ready and you know the answer.
7. Call replay_run to verify the trace and export_report for a Markdown result.

After a client or server restart, call list_runs to rediscover recent run IDs,
then call get_run and continue from the returned stateVersion and public
snapshot.

## Visual interface

Version 0.4 adds a local-first browser experience powered by the same RunService
as the MCP server. Players can choose a room, inspect visible objects, move,
use inventory items, submit answers, resume earlier runs, inspect the public
event timeline, verify deterministic replay, and download a redacted report.

The browser never receives hidden room definitions or plaintext answers. The
Web server listens only on `127.0.0.1`, applies restrictive browser security
headers, limits request bodies, and requires a per-process page token for every
state-changing request.

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

State files are private server data. Action arguments are stored only as
SHA-256 idempotency digests, and the submitted answer is never written in
plaintext. Public JSONL events contain only answer length and outcome. Run
discovery returns only public summaries. Structurally malformed state files
fail closed instead of returning partial records.

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

The test suite includes domain and application tests, Web API security and flow,
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

Version 0.4 includes a responsive local Web interface, two built-in rooms,
eleven MCP tools, atomic local run persistence, restart discovery and recovery,
deterministic event replay, redacted Markdown reports, JSONL traces, and
room-aware scoring. The file repository supports one server process per state
directory. Remote hosting, authentication, community room loading,
multi-process transactions, and a public model leaderboard remain out of scope.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](SECURITY.md).
Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

MIT
