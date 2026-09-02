# Security Policy

## Supported version

Security fixes currently target the latest 0.3.x release.

## Reporting

Please do not open a public issue for a vulnerability. Use GitHub private
vulnerability reporting when it is enabled for the repository.

Useful reports include reproduction steps, affected version, impact, and a
suggested mitigation.

## Scope and threat model

ToolQuest 0.3 is a local stdio MCP server. Its tools operate on virtual rooms,
private local run-state files, and public local trace files under configured
directories. It does not execute room scripts, access remote services, or
expose OS filesystem tools to an agent. export_report returns Markdown content
and does not write an agent-selected path.

Persisted state contains room state, public events, cached results, and SHA-256
action digests. Submitted answers are not stored in plaintext. Treat the state
directory as private server data and do not publish it.

Tool annotations are descriptive hints, not an authorization boundary.
