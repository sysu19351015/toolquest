# Security Policy

## Supported version

Security fixes currently target the latest 0.5.x release.

## Reporting

Please do not open a public issue for a vulnerability. Use GitHub private
vulnerability reporting when it is enabled for the repository.

Useful reports include reproduction steps, affected version, impact, and a
suggested mitigation.

## Scope and threat model

ToolQuest is a local stdio MCP server. Its tools operate on virtual rooms,
private local run-state files, and public local trace files under configured
directories. It does not execute room scripts, access remote services, or
expose OS filesystem tools to an agent. export_report returns Markdown content
and does not write an agent-selected path.

Persisted state contains room state, public events, cached results, and SHA-256
action digests. Submitted answers are not stored in plaintext. Treat the state
directory as private server data and do not publish it. Seeds, Agent metadata,
labels and other public tool inputs are visible in observations and reports;
never put secrets in them.

Tool annotations are descriptive hints, not an authorization boundary.

ToolQuest 0.5 defaults to a read-only Web observer. It does not invoke gameplay
tools, including look and inspect (which append events despite leaving the
virtual world unchanged). SSE reads authoritative state, not best-effort JSONL.

The CLI binds only to `127.0.0.1`; changing that boundary is unsupported.
Requests reject non-loopback hosts and foreign origins. Responses apply a
restrictive CSP. Explicit Playground writes additionally require a per-process
token. Playground uses a separate state directory by default. Every state
directory supports only one writer; atomic replacement is not a multi-writer lock.

Agent identity and run labels are untrusted public display text, not authenticated
attribution or a secrets store. Do not include API keys, prompts, or private data.
The console is not an authenticated multi-user or remotely hosted service.
