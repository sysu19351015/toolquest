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
    const looked = recoveredService.look(started.runId);

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
