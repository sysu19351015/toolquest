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
- JSONL traces with redacted final answers;
- no LLM judge and no external service required.

## Quick start

Requirements: Node.js 20 or newer.

    npm install
    npm run check
    npm start

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

1. Call start_run with roomId set to the-vault.
2. Call look with the returned runId.
3. Inspect visible target IDs to discover clues and interaction IDs.
4. Use move or use with a unique actionId and the latest stateVersion.
5. Call submit when the vault is unlocked and you know the code.

## MCP tools

| Tool | Purpose | Changes world state |
| --- | --- | --- |
| start_run | Create an isolated deterministic run | Creates a run |
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

Normal game failures, such as using the wrong item, remain successful MCP calls
with a world_failure event. Invalid IDs, stale versions, and missing runs are
recoverable MCP tool errors with a stable code and recoveryHint.

## Traces

By default, the stdio server appends public events to:

    .toolquest/runs/<runId>.jsonl

Set TOOLQUEST_DISABLE_TRACES=1 to disable disk traces. The final answer itself
is never written to the public event input.

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

The test suite includes domain and application tests, an in-memory MCP contract
test, and a real stdio subprocess test.

## Current scope

Version 0.1 includes one room, The Vault, local stdio transport, in-memory runs,
JSONL traces, and deterministic scoring. It does not yet include remote HTTP,
authentication, crash recovery, a replay UI, community room loading, or a
public model leaderboard.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](SECURITY.md).

## License

MIT
