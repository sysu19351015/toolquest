import { resolve } from "node:path";
import { RunService } from "./application/run-service.js";
import { BuiltInRoomCatalog } from "./infrastructure/built-in-room-catalog.js";
import { FileRunRepository } from "./infrastructure/file-run-repository.js";
import { InMemoryRunRepository } from "./infrastructure/in-memory-run-repository.js";
import { JsonlEventSink } from "./infrastructure/jsonl-event-sink.js";
import {
  NodeIdGenerator,
  NoopEventSink,
  SystemClock
} from "./infrastructure/node-adapters.js";

export interface DefaultRunServiceOptions {
  persistRuns?: boolean;
  stateDirectory?: string;
  persistTraces?: boolean;
  traceDirectory?: string;
}

export function createDefaultRunService(
  options: DefaultRunServiceOptions = {}
): RunService {
  const persistTraces =
    options.persistTraces ?? process.env.TOOLQUEST_DISABLE_TRACES !== "1";
  const persistRuns =
    options.persistRuns ?? process.env.TOOLQUEST_DISABLE_STATE !== "1";
  const events = persistTraces
    ? new JsonlEventSink(
        options.traceDirectory ??
          resolve(process.cwd(), ".toolquest", "runs")
      )
    : new NoopEventSink();
  const runs = persistRuns
    ? new FileRunRepository(
        options.stateDirectory ??
          process.env.TOOLQUEST_STATE_DIR ??
          resolve(process.cwd(), ".toolquest", "state")
      )
    : new InMemoryRunRepository();

  return new RunService({
    rooms: new BuiltInRoomCatalog(),
    runs,
    clock: new SystemClock(),
    ids: new NodeIdGenerator(),
    events
  });
}
