import {
  calculateScore,
  createInitialState,
  fingerprint,
  hashGameState,
  inspectObject,
  lookAround,
  performMove,
  performSubmit,
  performUse
} from "../domain/engine.js";
import { ToolQuestError } from "../domain/errors.js";
import type {
  DomainActionResult,
  GameEvent,
  GameState,
  RoomDefinition,
  RunRecord,
  ToolQuestSuccess
} from "../domain/types.js";
import type {
  Clock,
  EventSink,
  IdGenerator,
  RoomCatalog,
  RunRepository
} from "./ports.js";

export interface StartRunInput {
  roomId: string;
  seed?: string;
}

export interface InspectInput {
  runId: string;
  targetId: string;
}

export interface CommandInput {
  runId: string;
  actionId: string;
  expectedStateVersion: number;
}

export interface MoveInput extends CommandInput {
  destinationId: string;
}

export interface UseInput extends CommandInput {
  interactionId: string;
  itemId?: string;
}

export interface SubmitInput extends CommandInput {
  answer: string;
}

export interface RunServiceDependencies {
  rooms: RoomCatalog;
  runs: RunRepository;
  clock: Clock;
  ids: IdGenerator;
  events: EventSink;
  onTraceError?: (error: unknown, event: GameEvent) => void;
}

export class RunService {
  private readonly onTraceError: (error: unknown, event: GameEvent) => void;

  public constructor(private readonly dependencies: RunServiceDependencies) {
    this.onTraceError =
      dependencies.onTraceError ??
      ((error, event) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[toolquest] Could not persist trace event ${event.eventSeq} for ${event.runId}: ${message}`
        );
      });
  }

  public listRooms() {
    return this.dependencies.rooms.list();
  }

  public startRun(input: StartRunInput): ToolQuestSuccess {
    const room = this.dependencies.rooms.find(input.roomId);
    if (room === undefined) {
      const availableRooms = this.dependencies.rooms.list();
      throw new ToolQuestError(
        "ROOM_NOT_FOUND",
        `Room '${input.roomId}' is not available.`,
        true,
        "Choose one of the available room IDs.",
        { availableRooms }
      );
    }

    const runId = this.dependencies.ids.createRunId();
    const seed =
      input.seed === undefined || input.seed.length === 0
        ? this.dependencies.ids.createSeed()
        : input.seed;
    const at = this.dependencies.clock.now();
    const state = createInitialState(room, seed, at);
    const stateHash = hashGameState(state);
    const event: GameEvent = {
      runId,
      eventSeq: 1,
      stateVersion: 0,
      stateHash,
      tool: "start_run",
      at,
      outcome: "success",
      message: room.introduction,
      input: { roomId: room.id, seed },
      data: {
        room: { id: room.id, title: room.title, version: room.version }
      }
    };
    const result: ToolQuestSuccess = {
      ok: true,
      runId,
      eventSeq: event.eventSeq,
      stateVersion: event.stateVersion,
      stateHash,
      status: state.status,
      message: room.introduction,
      data: {
        room: { id: room.id, title: room.title, version: room.version },
        seed,
        nextStep: "Call look with this runId."
      },
      events: [event]
    };
    const record: RunRecord = {
      runId,
      state,
      stateVersion: 0,
      eventSeq: 1,
      events: [event],
      actions: {}
    };

    this.dependencies.runs.save(record);
    this.appendTrace(event);
    return result;
  }

  public look(runId: string): ToolQuestSuccess {
    return this.executeRead(runId, "look", {}, (room, state) =>
      lookAround(room, state)
    );
  }

  public inspect(input: InspectInput): ToolQuestSuccess {
    return this.executeRead(
      input.runId,
      "inspect",
      { targetId: input.targetId },
      (room, state) => inspectObject(room, state, input.targetId)
    );
  }

  public move(input: MoveInput): ToolQuestSuccess {
    return this.executeCommand(
      "move",
      input,
      { destinationId: input.destinationId },
      { destinationId: input.destinationId },
      (room, state) => performMove(room, state, input.destinationId)
    );
  }

  public use(input: UseInput): ToolQuestSuccess {
    const itemFields =
      input.itemId === undefined ? {} : { itemId: input.itemId };
    return this.executeCommand(
      "use",
      input,
      { interactionId: input.interactionId, ...itemFields },
      { interactionId: input.interactionId, ...itemFields },
      (room, state) =>
        performUse(room, state, input.interactionId, input.itemId)
    );
  }

  public submit(input: SubmitInput): ToolQuestSuccess {
    return this.executeCommand(
      "submit",
      input,
      { answer: input.answer },
      { answerLength: input.answer.length },
      (room, state) => performSubmit(room, state, input.answer)
    );
  }

  private executeRead(
    runId: string,
    tool: "look" | "inspect",
    publicInput: Record<string, unknown>,
    operation: (room: RoomDefinition, state: GameState) => DomainActionResult
  ): ToolQuestSuccess {
    const record = this.requireRun(runId);
    const room = this.requireRoom(record.state.roomId);
    const domainResult = operation(room, record.state);
    const nextEventSeq = record.eventSeq + 1;
    const stateHash = hashGameState(record.state);
    const event: GameEvent = {
      runId,
      eventSeq: nextEventSeq,
      stateVersion: record.stateVersion,
      stateHash,
      tool,
      at: this.dependencies.clock.now(),
      outcome: domainResult.outcome,
      message: domainResult.message,
      input: publicInput,
      data: domainResult.data
    };
    const result = this.successResult(
      record.state,
      record.stateVersion,
      event,
      domainResult
    );

    this.dependencies.runs.save({
      ...record,
      eventSeq: nextEventSeq,
      events: [...record.events, event]
    });
    this.appendTrace(event);
    return result;
  }

  private executeCommand(
    tool: "move" | "use" | "submit",
    command: CommandInput,
    privateInput: Record<string, unknown>,
    publicInput: Record<string, unknown>,
    operation: (room: RoomDefinition, state: GameState) => DomainActionResult
  ): ToolQuestSuccess {
    const record = this.requireRun(command.runId);
    const actionFingerprint = fingerprint({
      tool,
      expectedStateVersion: command.expectedStateVersion,
      ...privateInput
    });
    const cached = record.actions[command.actionId];
    if (cached !== undefined) {
      if (cached.fingerprint !== actionFingerprint) {
        throw new ToolQuestError(
          "ACTION_ID_CONFLICT",
          `actionId '${command.actionId}' was already used with different arguments.`,
          false,
          "Generate a new actionId for a different action."
        );
      }
      return structuredClone(cached.result);
    }

    if (record.state.status !== "active") {
      throw new ToolQuestError(
        "RUN_TERMINAL",
        `Run '${record.runId}' is already ${record.state.status}.`,
        false,
        "Start a new run to continue playing.",
        { status: record.state.status }
      );
    }
    if (command.expectedStateVersion !== record.stateVersion) {
      throw new ToolQuestError(
        "VERSION_CONFLICT",
        `Expected state version ${command.expectedStateVersion}, but the current version is ${record.stateVersion}.`,
        true,
        "Call look, then retry with the returned stateVersion and a new actionId.",
        { currentStateVersion: record.stateVersion }
      );
    }

    const room = this.requireRoom(record.state.roomId);
    const domainResult = operation(room, record.state);
    const nextStateVersion =
      record.stateVersion + (domainResult.changed ? 1 : 0);
    const nextEventSeq = record.eventSeq + 1;
    const stateHash = hashGameState(domainResult.state);
    const event: GameEvent = {
      runId: record.runId,
      eventSeq: nextEventSeq,
      stateVersion: nextStateVersion,
      stateHash,
      tool,
      at: this.dependencies.clock.now(),
      outcome: domainResult.outcome,
      message: domainResult.message,
      input: { actionId: command.actionId, ...publicInput },
      data: domainResult.data
    };
    const allEvents = [...record.events, event];
    const result = this.successResult(
      domainResult.state,
      nextStateVersion,
      event,
      domainResult,
      allEvents
    );
    const nextRecord: RunRecord = {
      ...record,
      state: domainResult.state,
      stateVersion: nextStateVersion,
      eventSeq: nextEventSeq,
      events: allEvents,
      actions: {
        ...record.actions,
        [command.actionId]: {
          fingerprint: actionFingerprint,
          result
        }
      }
    };

    this.dependencies.runs.save(nextRecord);
    this.appendTrace(event);
    return result;
  }

  private successResult(
    state: GameState,
    stateVersion: number,
    event: GameEvent,
    domainResult: DomainActionResult,
    allEvents?: GameEvent[]
  ): ToolQuestSuccess {
    const score =
      state.status === "active"
        ? undefined
        : calculateScore(state.status, allEvents ?? [event]);
    return {
      ok: true,
      runId: event.runId,
      eventSeq: event.eventSeq,
      stateVersion,
      stateHash: event.stateHash,
      status: state.status,
      message: domainResult.message,
      data: domainResult.data,
      events: [event],
      ...(score === undefined ? {} : { score })
    };
  }

  private requireRun(runId: string): RunRecord {
    const record = this.dependencies.runs.find(runId);
    if (record === undefined) {
      throw new ToolQuestError(
        "RUN_NOT_FOUND",
        "The requested run does not exist or is no longer available.",
        true,
        "Call start_run and use the returned runId."
      );
    }
    return record;
  }

  private requireRoom(roomId: string): RoomDefinition {
    const room = this.dependencies.rooms.find(roomId);
    if (room === undefined) {
      throw new ToolQuestError(
        "ROOM_NOT_FOUND",
        `Room '${roomId}' is not available.`,
        false,
        "The run cannot continue because its room definition is missing."
      );
    }
    return room;
  }

  private appendTrace(event: GameEvent): void {
    try {
      this.dependencies.events.append(event);
    } catch (error) {
      this.onTraceError(error, event);
    }
  }
}
