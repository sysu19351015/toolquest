# Changelog

All notable changes to ToolQuest are documented here.

## 0.4.0

- Add a local-first visual Web interface for non-technical players.
- Support room selection, run recovery, exploration, movement, interactions,
  answer submission, terminal scoring, and responsive layouts.
- Add a public event timeline, deterministic replay verification, and Markdown
  report downloads to the visual experience.
- Provide built-in Chinese interface copy for both rooms while preserving the
  existing deterministic room engine and MCP tools.
- Add a loopback-only Web server with per-process write tokens, strict request
  schemas, body limits, and restrictive browser security headers.
- Add end-to-end tests for Web delivery, write protection, gameplay recovery,
  replay, and report privacy.

## 0.3.1

- Add list_runs to rediscover persisted runs after client or server restarts.
- Return newest-first public run summaries with optional status and limit filters.
- Validate persisted states, event sequences, and action cache structure before use.
- Remove temporary state files after both successful and failed atomic saves.
- Isolate stdio tests from the default persistent state directory.

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
