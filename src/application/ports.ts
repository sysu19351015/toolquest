import type {
  GameEvent,
  RoomDefinition,
  RoomSummary,
  RunRecord
} from "../domain/types.js";

export interface RoomCatalog {
  find(roomId: string): RoomDefinition | undefined;
  list(): RoomSummary[];
}

export interface RunRepository {
  find(runId: string): RunRecord | undefined;
  save(record: RunRecord): void;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  createRunId(): string;
  createSeed(): string;
}

export interface EventSink {
  append(event: GameEvent): void;
}
