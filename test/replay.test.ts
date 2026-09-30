import { describe, expect, it, vi } from "vitest";
import { createTestHarness, solveVault } from "./helpers.js";

describe("run inspection and replay", () => {
  it("reads snapshot and timeline from one record without side effects", () => {
    const { service, runs, events } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    service.look(started.runId);
    const before = runs.find(started.runId);
    const find = vi.spyOn(runs, "find");
    const observed = service.getRunObservation(started.runId);
    expect(find).toHaveBeenCalledTimes(1);
    expect(observed.eventSeq).toBe(2);
    expect(observed.data["timeline"]).toHaveLength(2);
    expect(observed.events).toEqual([]);
    expect(events.events).toHaveLength(2);
    expect(runs.find(started.runId)).toEqual(before);
  });

  it("escapes untrusted seed and metadata in Markdown reports", () => {
    const { service } = createTestHarness();
    const malicious = '![pixel](https://example.invalid/pixel)<img src="x">|\r\n*text*';
    const started = service.startRun({
      roomId: "the-vault", seed: malicious,
      agent: { name: malicious }, label: malicious
    });
    const content = service.exportReport(started.runId).data["content"] as string;
    expect(content).not.toContain("![pixel]");
    expect(content).not.toContain("<img");
    expect(content).not.toContain("\r");
    expect(content).toContain("!\\[pixel\\]");
    expect(content).toContain("&lt;img");
    expect(content).toContain("\\|");
  });

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
    const started = service.startRun({
      roomId: "the-vault",
      agent: {
        name: "Agent *QA*",
        model: "model-v2",
        provider: "local"
      },
      label: "release-check"
    });
    solveVault(service, started.runId);

    const result = service.exportReport(started.runId);
    const content = result.data["content"];

    expect(typeof content).toBe("string");
    expect(content).toContain("# ToolQuest Run Report");
    expect(content).toContain("Replay verification: passed");
    expect(content).toContain("## Agent context");
    expect(content).toContain("Agent: Agent \\*QA\\*");
    expect(content).toContain("Model: model-v2");
    expect(content).toContain("Run label: release-check");
    expect(content).toContain("## Run metrics");
    expect(content).toContain("World failures: 0");
    expect(content).toContain("Public input");
    expect(content).toContain("| Completion | Safety | Efficiency |");
    expect(content).not.toContain("731");
  });
});
