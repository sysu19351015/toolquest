import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EventSink } from "../application/ports.js";
import type { GameEvent } from "../domain/types.js";

const SAFE_RUN_ID = /^run_[a-zA-Z0-9-]+$/;

export class JsonlEventSink implements EventSink {
  public constructor(private readonly directory: string) {}

  public append(event: GameEvent): void {
    if (!SAFE_RUN_ID.test(event.runId)) {
      throw new Error("Refusing to create a trace for an unsafe run ID.");
    }
    mkdirSync(this.directory, { recursive: true });
    appendFileSync(
      join(this.directory, `${event.runId}.jsonl`),
      `${JSON.stringify(event)}\n`,
      { encoding: "utf8" }
    );
  }
}
