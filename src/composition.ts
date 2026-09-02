import { resolve } from "node:path";
import { RunService } from "./application/run-service.js";
import { BuiltInRoomCatalog } from "./infrastructure/built-in-room-catalog.js";
import { InMemoryRunRepository } from "./infrastructure/in-memory-run-repository.js";
import { JsonlEventSink } from "./infrastructure/jsonl-event-sink.js";
import {
  NodeIdGenerator,
  NoopEventSink,
  SystemClock
} from "./infrastructure/node-adapters.js";

export interface DefaultRunServiceOptions {
  persistTraces?: boolean;
  traceDirectory?: string;
}

export function createDefaultRunService(
  options: DefaultRunServiceOptions = {}
): RunService {
  const persistTraces =
    options.persistTraces ?? process.env.TOOLQUEST_DISABLE_TRACES !== "1";
  const events = persistTraces
    ? new JsonlEventSink(
        options.traceDirectory ??
          resolve(process.cwd(), ".toolquest", "runs")
      )
    : new NoopEventSink();

  return new RunService({
    rooms: new BuiltInRoomCatalog(),
    runs: new InMemoryRunRepository(),
    clock: new SystemClock(),
    ids: new NodeIdGenerator(),
    events
  });
}
