import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultRunService } from "../src/composition.js";
import { FileRunRepository } from "../src/infrastructure/file-run-repository.js";
import { solveVault } from "./helpers.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "toolquest-state-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("FileRunRepository", () => {
  it("loads, observes, replays and resumes a fixed pre-metadata v0.4-format record", () => {
    const stateDirectory = temporaryDirectory();
    const legacy = readFileSync(new URL("./fixtures/v04-run.json", import.meta.url), "utf8");
    const path = join(stateDirectory, "run_legacy-v04.json");
    writeFileSync(path, legacy, "utf8");
    const service = createDefaultRunService({ stateDirectory, persistTraces: false });
    const run = service.getRunObservation("run_legacy-v04");
    expect(run.stateHash).toBe("038f03c6");
    expect(run.data["agent"]).toBeUndefined();
    expect(run.data["timeline"]).toHaveLength(1);
    expect(service.replayRun(run.runId).data["replay"]).toMatchObject({ valid: true });
    expect(service.exportReport(run.runId).data["content"]).toContain("Agent: Not recorded");
    expect(readFileSync(path, "utf8")).toBe(legacy);
    expect(service.look(run.runId).eventSeq).toBe(2);
  });

  it("recovers an active run after the service is recreated", () => {
    const stateDirectory = temporaryDirectory();
    const firstService = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const started = firstService.startRun({
      roomId: "the-vault",
      seed: "restart-test"
    });
    firstService.move({
      runId: started.runId,
      actionId: "before-restart",
      expectedStateVersion: 0,
      destinationId: "gallery"
    });

    const recoveredService = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const snapshot = recoveredService.getRun(started.runId);
    const discovered = recoveredService.listRuns({ limit: 20 });
    const looked = recoveredService.look(started.runId);

    expect(discovered.data.runs).toEqual([
      expect.objectContaining({
        runId: started.runId,
        status: "active",
        stateVersion: 1,
        eventSeq: 2
      })
    ]);
    expect(snapshot.stateVersion).toBe(1);
    expect(snapshot.eventSeq).toBe(2);
    expect(looked.stateVersion).toBe(1);
    expect(looked.eventSeq).toBe(3);
    const location = looked.data["location"];
    expect(typeof location).toBe("object");
    expect((location as { id?: unknown }).id).toBe("gallery");
    expect(readdirSync(stateDirectory)).toEqual([`${started.runId}.json`]);
    expect(readFileSync(join(stateDirectory, `${started.runId}.json`), "utf8"))
      .not.toContain(".tmp");
    expect(
      readFileSync(join(stateDirectory, `${started.runId}.json`), "utf8")
    ).not.toContain("\"agent\"");
  });

  it("persists optional Agent metadata across service restarts", () => {
    const stateDirectory = temporaryDirectory();
    const firstService = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const started = firstService.startRun({
      roomId: "the-vault",
      agent: {
        name: "Persistent Agent",
        model: "model-p",
        framework: "test-host"
      },
      label: "restart-observer"
    });
    const recoveredService = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });

    const recovered = recoveredService.getRun(started.runId);
    expect(recovered.data["agent"]).toEqual({
      name: "Persistent Agent",
      model: "model-p",
      framework: "test-host"
    });
    expect(recovered.data["label"]).toBe("restart-observer");
  });

  it("rejects malformed or unknown Agent metadata fields", () => {
    const stateDirectory = temporaryDirectory();
    const service = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const started = service.startRun({ roomId: "the-vault" });
    const path = join(stateDirectory, `${started.runId}.json`);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as {
      record: Record<string, unknown>;
    };
    envelope.record["agent"] = {
      name: "Agent",
      apiKey: "must-not-be-accepted"
    };
    writeFileSync(path, JSON.stringify(envelope), "utf8");

    expect(() => new FileRunRepository(stateDirectory).find(started.runId)).toThrow(
      "Malformed ToolQuest run record."
    );
  });

  it("rejects malformed persisted state instead of returning partial data", () => {
    const stateDirectory = temporaryDirectory();
    const runId = "run_corrupted";
    writeFileSync(
      join(stateDirectory, `${runId}.json`),
      JSON.stringify({ storageVersion: 1, record: { runId } }),
      "utf8"
    );
    const repository = new FileRunRepository(stateDirectory);

    expect(() => repository.find(runId)).toThrow(
      "Malformed ToolQuest run record."
    );
  });

  it("rejects structurally inconsistent event sequences", () => {
    const stateDirectory = temporaryDirectory();
    const service = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const started = service.startRun({ roomId: "the-vault" });
    const path = join(stateDirectory, `${started.runId}.json`);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as {
      record: { events: Array<{ eventSeq: number }> };
    };
    envelope.record.events[0]!.eventSeq = 9;
    writeFileSync(path, JSON.stringify(envelope), "utf8");

    expect(() => new FileRunRepository(stateDirectory).list()).toThrow(
      "Malformed ToolQuest run record."
    );
  });

  it("returns an empty list before the state directory exists", () => {
    const parent = temporaryDirectory();
    const repository = new FileRunRepository(join(parent, "not-created"));

    expect(repository.list()).toEqual([]);
  });

  it("persists action digests without storing the submitted answer", () => {
    const stateDirectory = temporaryDirectory();
    const service = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const started = service.startRun({ roomId: "the-vault" });
    solveVault(service, started.runId);

    const stored = readFileSync(
      join(stateDirectory, `${started.runId}.json`),
      "utf8"
    );

    expect(stored).not.toContain("731");
    expect(stored).toMatch(/[a-f0-9]{64}/);
  });
});
