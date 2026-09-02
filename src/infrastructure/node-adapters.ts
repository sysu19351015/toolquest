import { randomUUID } from "node:crypto";
import type {
  Clock,
  EventSink,
  IdGenerator
} from "../application/ports.js";
import type { GameEvent } from "../domain/types.js";

export class SystemClock implements Clock {
  public now(): string {
    return new Date().toISOString();
  }
}

export class NodeIdGenerator implements IdGenerator {
  public createRunId(): string {
    return `run_${randomUUID()}`;
  }

  public createSeed(): string {
    return randomUUID();
  }
}

export class NoopEventSink implements EventSink {
  public append(_event: GameEvent): void {
    // Intentionally empty.
  }
}
