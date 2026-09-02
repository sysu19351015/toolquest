import { describe, expect, it } from "vitest";
import { createTestHarness, solveVault } from "./helpers.js";

describe("run inspection and replay", () => {
  it("returns a public snapshot without appending an event", () => {
    const { service, events } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    service.move({
      runId: started.runId,
      actionId: "snapshot-move",
      expectedStateVersion: 0,
      destinationId: "gallery"
    });
    const eventCount = events.events.length;

    const snapshot = service.getRun(started.runId);
    const publicView = snapshot.data["snapshot"] as {
      location?: { id?: unknown };
    };

    expect(snapshot.stateVersion).toBe(1);
    expect(snapshot.eventSeq).toBe(2);
    expect(publicView.location?.id).toBe("gallery");
    expect(snapshot.events).toEqual([]);
    expect(events.events).toHaveLength(eventCount);
  });

  it("replays every event in a completed run", () => {
    const { service } = createTestHarness();
    const started = service.startRun({
      roomId: "the-vault",
      seed: "replay-test"
    });
    solveVault(service, started.runId);

    const result = service.replayRun(started.runId);
    const replay = result.data["replay"] as {
      valid?: unknown;
      verifiedEvents?: unknown;
      totalEvents?: unknown;
      mismatches?: unknown[];
    };

    expect(replay.valid).toBe(true);
    expect(replay.verifiedEvents).toBe(11);
    expect(replay.totalEvents).toBe(11);
    expect(replay.mismatches).toEqual([]);
  });

  it("reports a tampered event hash without changing the run", () => {
    const { service, runs } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    service.look(started.runId);
    const record = runs.find(started.runId);
    const event = record?.events[1];
    if (record === undefined || event === undefined) {
      throw new Error("Expected a persisted look event.");
    }
    event.stateHash = "00000000";
    runs.save(record);

    const result = service.replayRun(started.runId);
    const replay = result.data["replay"] as {
      valid?: unknown;
      mismatches?: Array<{ code?: unknown }>;
    };

    expect(replay.valid).toBe(false);
    expect(replay.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STATE_HASH_MISMATCH" })
      ])
    );
  });

  it("exports a Markdown report without the submitted answer", () => {
    const { service } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    solveVault(service, started.runId);

    const result = service.exportReport(started.runId);
    const content = result.data["content"];

    expect(typeof content).toBe("string");
    expect(content).toContain("# ToolQuest Run Report");
    expect(content).toContain("Replay verification: passed");
    expect(content).toContain("| Completion | Safety | Efficiency |");
    expect(content).not.toContain("731");
  });
});
