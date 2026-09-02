# Changelog

All notable changes to ToolQuest are documented here.

## 0.3.0

- Persist authoritative runs as versioned JSON with atomic file replacement.
- Recover active and terminal runs after a server restart.
- Add get_run for non-mutating public snapshots.
- Add replay_run with event-by-event state, outcome, and hash verification.
- Add export_report for redacted Markdown benchmark reports.
- Store idempotency arguments as SHA-256 digests instead of plaintext.
- Expand restart, corruption, tamper detection, privacy, MCP, and stdio tests.

## 0.2.0

- Add the read-only list_rooms MCP tool for challenge discovery.
- Add Signal Station, an intermediate room with a consumed item and chained
  interaction prerequisites.
- Add room difficulty and par action metadata.
- Calibrate efficiency scoring per room while preserving The Vault scores.
- Generalize final-challenge messages so the engine supports non-vault rooms.
- Expand service, MCP contract, and real stdio coverage to 14 tests.

## 0.1.0

- Launch the deterministic The Vault room.
- Expose start_run, look, inspect, move, use, and submit over MCP stdio.
- Add isolated runs, optimistic state versions, idempotent actions, scoring,
  redacted JSONL traces, and stable recoverable errors.
