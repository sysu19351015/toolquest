import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return (
    isObject(value) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function isAgentMetadata(value: unknown): boolean {
  if (!isObject(value) || !isBoundedString(value["name"], 80)) {
    return false;
  }
  const allowed = new Set(["name", "model", "provider", "version", "framework"]);
  if (!Object.keys(value).every((key) => allowed.has(key))) {
    return false;
  }
  return (
    (value["model"] === undefined || isBoundedString(value["model"], 120)) &&
    (value["provider"] === undefined || isBoundedString(value["provider"], 80)) &&
    (value["version"] === undefined || isBoundedString(value["version"], 80)) &&
    (value["framework"] === undefined || isBoundedString(value["framework"], 80))
  );
}

function isRunState(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value["roomId"] === "string" &&
    typeof value["roomVersion"] === "string" &&
    typeof value["seed"] === "string" &&
    ["active", "solved", "failed"].includes(String(value["status"])) &&
    typeof value["locationId"] === "string" &&
    isStringArray(value["inventory"]) &&
    isBooleanRecord(value["flags"]) &&
    isNonNegativeInteger(value["attempts"]) &&
    typeof value["startedAt"] === "string"
  );
}

function isGameEvent(value: unknown, runId: string, eventSeq: number): boolean {
  if (!isObject(value)) {
    return false;
  }
  return (
    value["runId"] === runId &&
    value["eventSeq"] === eventSeq &&
    isNonNegativeInteger(value["stateVersion"]) &&
    typeof value["stateHash"] === "string" &&
    ["start_run", "look", "inspect", "move", "use", "submit"].includes(
      String(value["tool"])
    ) &&
    typeof value["at"] === "string" &&
    ["success", "world_failure"].includes(String(value["outcome"])) &&
    typeof value["message"] === "string" &&
    isObject(value["input"]) &&
    isObject(value["data"])
  );
}

function isCachedAction(value: unknown, runId: string): boolean {
  if (!isObject(value) || !/^[a-f0-9]{64}$/.test(String(value["fingerprint"]))) {
    return false;
  }
  const result = value["result"];
  return (
    isObject(result) &&
    result["ok"] === true &&
    result["runId"] === runId &&
    isNonNegativeInteger(result["eventSeq"]) &&
    isNonNegativeInteger(result["stateVersion"]) &&
    typeof result["stateHash"] === "string" &&
    ["active", "solved", "failed"].includes(String(result["status"])) &&
    typeof result["message"] === "string" &&
    isObject(result["data"]) &&
    Array.isArray(result["events"])
  );
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
    !isRunState(record["state"]) ||
    !isNonNegativeInteger(record["stateVersion"]) ||
    !isNonNegativeInteger(record["eventSeq"]) ||
    !Array.isArray(record["events"]) ||
    !isObject(record["actions"]) ||
    (record["agent"] !== undefined && !isAgentMetadata(record["agent"])) ||
    (record["label"] !== undefined && !isBoundedString(record["label"], 120)) ||
    record["eventSeq"] !== record["events"].length ||
    !record["events"].every((event, index) =>
      isGameEvent(event, expectedRunId, index + 1)
    ) ||
    !Object.values(record["actions"]).every((action) =>
      isCachedAction(action, expectedRunId)
    )
  ) {
    throw new Error("Malformed ToolQuest run record.");
  }

  const events = record["events"] as unknown[];
  const finalEvent = events.at(-1);
  if (
    finalEvent === undefined ||
    !isObject(finalEvent) ||
    finalEvent["stateVersion"] !== record["stateVersion"]
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

  public list(): RunRecord[] {
    let entries: string[];
    try {
      entries = readdirSync(this.directory);
    } catch (error) {
      if (isObject(error) && error["code"] === "ENOENT") {
        return [];
      }
      throw error;
    }

    return entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .filter((runId) => SAFE_RUN_ID.test(runId))
      .map((runId) => this.find(runId))
      .filter((record): record is RunRecord => record !== undefined);
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
    try {
      writeFileSync(temporary, `${JSON.stringify(envelope)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
      renameSync(temporary, destination);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  private pathFor(runId: string): string {
    return join(this.directory, `${runId}.json`);
  }
}
