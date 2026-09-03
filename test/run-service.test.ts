import { describe, expect, it } from "vitest";
import { ToolQuestError } from "../src/domain/errors.js";
import {
  createTestHarness,
  solveSignalStation,
  solveVault
} from "./helpers.js";

describe("RunService", () => {
  it("lists built-in rooms with benchmark metadata", () => {
    const { service } = createTestHarness();

    const result = service.listRooms();

    expect(result.data.rooms).toEqual([
      expect.objectContaining({
        id: "the-vault",
        difficulty: "starter",
        parActions: 7
      }),
      expect.objectContaining({
        id: "signal-station",
        difficulty: "intermediate",
        parActions: 12
      })
    ]);
  });

  it("lists newest runs with status filters, limits, and public summaries", () => {
    const { service } = createTestHarness();
    const active = service.startRun({ roomId: "the-vault", seed: "active" });
    const solved = service.startRun({ roomId: "the-vault", seed: "solved" });
    solveVault(service, solved.runId);

    const allRuns = service.listRuns({ limit: 20 });
    const activeRuns = service.listRuns({ status: "active", limit: 20 });
    const limitedRuns = service.listRuns({ limit: 1 });

    expect(allRuns.data.runs.map((run) => run.runId)).toEqual([
      solved.runId,
      active.runId
    ]);
    expect(activeRuns.data.runs).toEqual([
      expect.objectContaining({ runId: active.runId, status: "active" })
    ]);
    expect(limitedRuns.data.runs).toEqual([
      expect.objectContaining({
        runId: solved.runId,
        status: "solved"
      })
    ]);
    expect(limitedRuns.data.runs[0]?.score?.total).toBe(92);
    expect(JSON.stringify(allRuns)).not.toContain("inventory");
    expect(JSON.stringify(allRuns)).not.toContain("flags");
  });

  it("completes the built-in vault room and returns a deterministic score", () => {
    const { service, events } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault", seed: "demo" });

    const result = solveVault(service, started.runId);

    expect(result.status).toBe("solved");
    expect(result.stateVersion).toBe(5);
    expect(result.score).toEqual({
      completion: 50,
      safety: 20,
      efficiency: 12,
      recovery: 10,
      total: 92
    });
    expect(events.events).toHaveLength(11);
    expect(JSON.stringify(events.events)).not.toContain('"answer":"731"');
  });

  it("returns the exact cached result when an actionId is retried", () => {
    const { service, events } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    const command = {
      runId: started.runId,
      actionId: "move-once",
      expectedStateVersion: 0,
      destinationId: "gallery"
    };

    const first = service.move(command);
    const retried = service.move(command);

    expect(retried).toEqual(first);
    expect(events.events.filter((event) => event.tool === "move")).toHaveLength(1);
  });

  it("rejects a stale state version without changing state", () => {
    const { service, runs } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    service.move({
      runId: started.runId,
      actionId: "move-first",
      expectedStateVersion: 0,
      destinationId: "gallery"
    });

    let thrown: unknown;
    try {
      service.move({
        runId: started.runId,
        actionId: "move-stale",
        expectedStateVersion: 0,
        destinationId: "foyer"
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolQuestError);
    expect((thrown as ToolQuestError).code).toBe("VERSION_CONFLICT");
    expect(runs.find(started.runId)?.state.locationId).toBe("gallery");
  });

  it("isolates independent runs", () => {
    const { service, runs } = createTestHarness();
    const first = service.startRun({ roomId: "the-vault", seed: "same" });
    const second = service.startRun({ roomId: "the-vault", seed: "same" });

    service.move({
      runId: first.runId,
      actionId: "first-move",
      expectedStateVersion: 0,
      destinationId: "gallery"
    });

    expect(runs.find(first.runId)?.state.locationId).toBe("gallery");
    expect(runs.find(second.runId)?.state.locationId).toBe("foyer");
  });

  it("produces the same final state hash for the same seed and actions", () => {
    const firstHarness = createTestHarness();
    const secondHarness = createTestHarness();
    const first = firstHarness.service.startRun({
      roomId: "the-vault",
      seed: "repeatable"
    });
    const second = secondHarness.service.startRun({
      roomId: "the-vault",
      seed: "repeatable"
    });

    const firstResult = solveVault(firstHarness.service, first.runId);
    const secondResult = solveVault(secondHarness.service, second.runId);

    expect(firstResult.stateHash).toBe(secondResult.stateHash);
    expect(firstResult.score).toEqual(secondResult.score);
  });

  it("removes collected objects from the public view", () => {
    const { service } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    service.move({
      runId: started.runId,
      actionId: "to-gallery",
      expectedStateVersion: 0,
      destinationId: "gallery"
    });
    service.use({
      runId: started.runId,
      actionId: "collect-key",
      expectedStateVersion: 1,
      interactionId: "take_brass_key"
    });

    let thrown: unknown;
    try {
      service.inspect({ runId: started.runId, targetId: "brass_key" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolQuestError);
    expect((thrown as ToolQuestError).code).toBe("NOT_VISIBLE");
  });

  it("completes Signal Station with chained item and flag prerequisites", () => {
    const { service } = createTestHarness();
    const started = service.startRun({
      roomId: "signal-station",
      seed: "radio-check"
    });

    const result = solveSignalStation(service, started.runId);

    expect(result.status).toBe("solved");
    expect(result.stateVersion).toBe(8);
    expect(result.score).toEqual({
      completion: 50,
      safety: 20,
      efficiency: 13,
      recovery: 10,
      total: 93
    });
  });

  it("rejects antenna calibration until station power is restored", () => {
    const { service } = createTestHarness();
    const started = service.startRun({ roomId: "signal-station" });
    service.move({
      runId: started.runId,
      actionId: "to-control",
      expectedStateVersion: 0,
      destinationId: "control_room"
    });
    service.move({
      runId: started.runId,
      actionId: "to-rooftop",
      expectedStateVersion: 1,
      destinationId: "rooftop"
    });

    const result = service.use({
      runId: started.runId,
      actionId: "early-calibration",
      expectedStateVersion: 2,
      interactionId: "calibrate_antenna"
    });

    expect(result.stateVersion).toBe(2);
    expect(result.events[0]?.outcome).toBe("world_failure");
    expect(result.data).toEqual({
      applied: false,
      reason: "PRECONDITION_NOT_MET",
      requiredFlag: "station_powered"
    });
  });
});
