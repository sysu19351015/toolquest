# Contributing

Thanks for helping improve ToolQuest.

## Local checks

    npm install
    npm run check

All pull requests should include tests for behavior changes. Changes to MCP tool
names, schemas, annotations, error codes, or event fields are public contract
changes and must be called out clearly.

## Architecture rules

- Keep puzzle rules out of MCP handlers.
- Do not import the MCP SDK from domain or application modules.
- Do not expose room answers or hidden flags in public results or errors.
- Keep tests deterministic; do not use a live LLM as a release gate.
- Do not add remote file or network access to room definitions.

For a new room, include a golden success path and at least one failure path.
