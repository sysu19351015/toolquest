# Security Policy

## Supported version

Security fixes currently target the latest 0.1.x release.

## Reporting

Please do not open a public issue for a vulnerability. Use GitHub private
vulnerability reporting when it is enabled for the repository.

Useful reports include reproduction steps, affected version, impact, and a
suggested mitigation.

## Scope and threat model

ToolQuest 0.1 is a local stdio MCP server. Its tools operate only on an
in-memory virtual room and local public trace files under the configured trace
directory. It does not execute room scripts, access remote services, or expose
OS filesystem tools to an agent.

Tool annotations are descriptive hints, not an authorization boundary.
