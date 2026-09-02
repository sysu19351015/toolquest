import { describe, expect, it } from "vitest";
import { ToolQuestError } from "../src/domain/errors.js";
import { createTestHarness, solveVault } from "./helpers.js";

describe("RunService", () => {
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
});
