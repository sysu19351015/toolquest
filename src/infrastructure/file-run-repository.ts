import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { RunRepository } from "../application/ports.js";
import type { RunRecord } from "../domain/types.js";

const SAFE_RUN_ID = /^run_[a-zA-Z0-9-]+$/;
const STORAGE_VERSION = 1;

interface StoredRunEnvelope {
  storageVersion: typeof STORAGE_VERSION;
  record: RunRecord;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope(serialized: string, expectedRunId: string): RunRecord {
  const parsed: unknown = JSON.parse(serialized);
  if (
    !isObject(parsed) ||
    parsed["storageVersion"] !== STORAGE_VERSION ||
    !isObject(parsed["record"])
  ) {
    throw new Error("Unsupported or malformed ToolQuest run state.");
  }

  const record = parsed["record"];
  if (
    record["runId"] !== expectedRunId ||
    !isObject(record["state"]) ||
    typeof record["stateVersion"] !== "number" ||
    typeof record["eventSeq"] !== "number" ||
    !Array.isArray(record["events"]) ||
    !isObject(record["actions"])
  ) {
    throw new Error("Malformed ToolQuest run record.");
  }

  return structuredClone(record) as unknown as RunRecord;
}

export class FileRunRepository implements RunRepository {
  public constructor(private readonly directory: string) {}

  public find(runId: string): RunRecord | undefined {
    if (!SAFE_RUN_ID.test(runId)) {
      return undefined;
    }

    const path = this.pathFor(runId);
    try {
      return parseEnvelope(readFileSync(path, "utf8"), runId);
    } catch (error) {
      if (
        isObject(error) &&
        error["code"] === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  public save(record: RunRecord): void {
    if (!SAFE_RUN_ID.test(record.runId)) {
      throw new Error("Refusing to persist an unsafe ToolQuest run ID.");
    }

    const destination = this.pathFor(record.runId);
    mkdirSync(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    const envelope: StoredRunEnvelope = {
      storageVersion: STORAGE_VERSION,
      record: structuredClone(record)
    };
    writeFileSync(temporary, `${JSON.stringify(envelope)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    renameSync(temporary, destination);
  }

  private pathFor(runId: string): string {
    return join(this.directory, `${runId}.json`);
  }
}
