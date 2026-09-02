import type {
  Clock,
  EventSink,
  IdGenerator
} from "../src/application/ports.js";
import { RunService } from "../src/application/run-service.js";
import type { GameEvent } from "../src/domain/types.js";
import { BuiltInRoomCatalog } from "../src/infrastructure/built-in-room-catalog.js";
import { InMemoryRunRepository } from "../src/infrastructure/in-memory-run-repository.js";

class TestClock implements Clock {
  private tick = 0;

  public now(): string {
    const date = new Date(Date.UTC(2026, 8, 2, 0, 0, this.tick));
    this.tick += 1;
    return date.toISOString();
  }
}

class TestIds implements IdGenerator {
  private nextRun = 1;
  private nextSeed = 1;

  public createRunId(): string {
    const id = String(this.nextRun).padStart(8, "0");
    this.nextRun += 1;
    return "run_" + id;
  }

  public createSeed(): string {
    const seed = "seed-" + this.nextSeed;
    this.nextSeed += 1;
    return seed;
  }
}

export class MemoryEventSink implements EventSink {
  public readonly events: GameEvent[] = [];

  public append(event: GameEvent): void {
    this.events.push(structuredClone(event));
  }
}

export function createTestHarness() {
  const runs = new InMemoryRunRepository();
  const events = new MemoryEventSink();
  const service = new RunService({
    rooms: new BuiltInRoomCatalog(),
    runs,
    clock: new TestClock(),
    ids: new TestIds(),
    events
  });
  return { service, runs, events };
}

export function solveVault(service: RunService, runId: string) {
  service.look(runId);
  service.inspect({ runId, targetId: "stone_tablet" });
  service.move({
    runId,
    actionId: "move-gallery",
    expectedStateVersion: 0,
    destinationId: "gallery"
  });
  service.inspect({ runId, targetId: "moon_chart" });
  service.inspect({ runId, targetId: "brass_key" });
  service.use({
    runId,
    actionId: "take-key",
    expectedStateVersion: 1,
    interactionId: "take_brass_key"
  });
  service.move({
    runId,
    actionId: "move-vault",
    expectedStateVersion: 2,
    destinationId: "vault"
  });
  service.inspect({ runId, targetId: "vault_door" });
  service.use({
    runId,
    actionId: "unlock-vault",
    expectedStateVersion: 3,
    interactionId: "unlock_vault",
    itemId: "brass_key"
  });
  return service.submit({
    runId,
    actionId: "submit-code",
    expectedStateVersion: 4,
    answer: "731"
  });
}

export function solveSignalStation(service: RunService, runId: string) {
  service.look(runId);
  service.inspect({ runId, targetId: "distress_notice" });
  service.move({
    runId,
    actionId: "move-workshop",
    expectedStateVersion: 0,
    destinationId: "workshop"
  });
  service.inspect({ runId, targetId: "frequency_chart" });
  service.inspect({ runId, targetId: "ceramic_fuse" });
  service.use({
    runId,
    actionId: "take-fuse",
    expectedStateVersion: 1,
    interactionId: "take_ceramic_fuse"
  });
  service.move({
    runId,
    actionId: "return-entry",
    expectedStateVersion: 2,
    destinationId: "entry_hall"
  });
  service.move({
    runId,
    actionId: "move-control",
    expectedStateVersion: 3,
    destinationId: "control_room"
  });
  service.inspect({ runId, targetId: "breaker_panel" });
  service.use({
    runId,
    actionId: "restore-power",
    expectedStateVersion: 4,
    interactionId: "restore_station_power",
    itemId: "ceramic_fuse"
  });
  service.move({
    runId,
    actionId: "move-rooftop",
    expectedStateVersion: 5,
    destinationId: "rooftop"
  });
  service.inspect({ runId, targetId: "antenna_console" });
  service.use({
    runId,
    actionId: "calibrate",
    expectedStateVersion: 6,
    interactionId: "calibrate_antenna"
  });
  return service.submit({
    runId,
    actionId: "transmit-code",
    expectedStateVersion: 7,
    answer: "821"
  });
}
