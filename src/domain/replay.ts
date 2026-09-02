import {
  createInitialState,
  fingerprint,
  hashGameState,
  inspectObject,
  lookAround,
  performMove,
  performSubmit,
  performUse
} from "./engine.js";
import type {
  DomainActionResult,
  GameEvent,
  GameState,
  RoomDefinition,
  RunRecord
} from "./types.js";

export interface ReplayMismatch {
  eventSeq?: number;
  code: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ReplayReport {
  valid: boolean;
  verifiedEvents: number;
  totalEvents: number;
  finalStateHash: string;
  recordedStateHash: string;
  mismatches: ReplayMismatch[];
}

function stringField(
  value: Record<string, unknown>,
  key: string
): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`Replay input '${key}' is missing or invalid.`);
  }
  return field;
}

function replayOperation(
  room: RoomDefinition,
  state: GameState,
  event: GameEvent
): DomainActionResult {
  switch (event.tool) {
    case "look":
      return lookAround(room, state);
    case "inspect":
      return inspectObject(room, state, stringField(event.input, "targetId"));
    case "move":
      return performMove(
        room,
        state,
        stringField(event.input, "destinationId")
      );
    case "use": {
      const itemId = event.input["itemId"];
      if (itemId !== undefined && typeof itemId !== "string") {
        throw new Error("Replay input 'itemId' is invalid.");
      }
      return performUse(
        room,
        state,
        stringField(event.input, "interactionId"),
        itemId
      );
    }
    case "submit": {
      const replayAnswer =
        event.data["correct"] === true
          ? room.answer
          : `${room.answer}:known-incorrect`;
      return performSubmit(room, state, replayAnswer);
    }
    case "start_run":
      throw new Error("start_run may appear only as the first replay event.");
  }
}

function compare(
  mismatches: ReplayMismatch[],
  eventSeq: number,
  code: string,
  message: string,
  expected: unknown,
  actual: unknown
): void {
  if (fingerprint(expected) !== fingerprint(actual)) {
    mismatches.push({
      eventSeq,
      code,
      message,
      expected,
      actual
    });
  }
}

export function replayRunRecord(
  room: RoomDefinition,
  record: RunRecord
): ReplayReport {
  const mismatches: ReplayMismatch[] = [];
  const first = record.events[0];
  if (first === undefined || first.tool !== "start_run") {
    return {
      valid: false,
      verifiedEvents: 0,
      totalEvents: record.events.length,
      finalStateHash: "",
      recordedStateHash: hashGameState(record.state),
      mismatches: [
        {
          code: "MISSING_START_EVENT",
          message: "The replay log must begin with start_run."
        }
      ]
    };
  }

  let replaySeed: string;
  try {
    replaySeed = stringField(first.input, "seed");
  } catch (error) {
    return {
      valid: false,
      verifiedEvents: 0,
      totalEvents: record.events.length,
      finalStateHash: "",
      recordedStateHash: hashGameState(record.state),
      mismatches: [
        {
          eventSeq: first.eventSeq,
          code: "INVALID_START_EVENT",
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  let state = createInitialState(room, replaySeed, first.at);
  let stateVersion = 0;
  let verifiedEvents = 0;

  for (const [index, event] of record.events.entries()) {
    const before = mismatches.length;
    const expectedSeq = index + 1;
    compare(
      mismatches,
      event.eventSeq,
      "EVENT_SEQUENCE_MISMATCH",
      "eventSeq is not contiguous.",
      expectedSeq,
      event.eventSeq
    );
    compare(
      mismatches,
      event.eventSeq,
      "RUN_ID_MISMATCH",
      "The event belongs to a different run.",
      record.runId,
      event.runId
    );
    if (index === 0) {
      compare(
        mismatches,
        event.eventSeq,
        "ROOM_ID_MISMATCH",
        "The start event references a different room.",
        room.id,
        event.input["roomId"]
      );
    }

    let outcome: GameEvent["outcome"] = "success";
    let message = room.introduction;
    if (index > 0) {
      try {
        const result = replayOperation(room, state, event);
        state = result.state;
        stateVersion += result.changed ? 1 : 0;
        outcome = result.outcome;
        message = result.message;
      } catch (error) {
        mismatches.push({
          eventSeq: event.eventSeq,
          code: "REPLAY_OPERATION_FAILED",
          message: error instanceof Error ? error.message : String(error)
        });
        break;
      }
    }

    const stateHash = hashGameState(state);
    compare(
      mismatches,
      event.eventSeq,
      "STATE_VERSION_MISMATCH",
      "The replayed stateVersion differs from the recorded version.",
      stateVersion,
      event.stateVersion
    );
    compare(
      mismatches,
      event.eventSeq,
      "STATE_HASH_MISMATCH",
      "The replayed state hash differs from the recorded hash.",
      stateHash,
      event.stateHash
    );
    compare(
      mismatches,
      event.eventSeq,
      "OUTCOME_MISMATCH",
      "The replayed outcome differs from the recorded outcome.",
      outcome,
      event.outcome
    );
    compare(
      mismatches,
      event.eventSeq,
      "MESSAGE_MISMATCH",
      "The replayed message differs from the recorded message.",
      message,
      event.message
    );
    if (mismatches.length === before) {
      verifiedEvents += 1;
    }
  }

  const finalStateHash = hashGameState(state);
  const recordedStateHash = hashGameState(record.state);
  compare(
    mismatches,
    record.eventSeq,
    "FINAL_STATE_MISMATCH",
    "The replayed final state differs from the persisted run state.",
    record.state,
    state
  );
  compare(
    mismatches,
    record.eventSeq,
    "FINAL_EVENT_SEQUENCE_MISMATCH",
    "The persisted eventSeq differs from the event log length.",
    record.events.length,
    record.eventSeq
  );
  compare(
    mismatches,
    record.eventSeq,
    "FINAL_STATE_VERSION_MISMATCH",
    "The persisted stateVersion differs from the replayed version.",
    stateVersion,
    record.stateVersion
  );

  return {
    valid: mismatches.length === 0,
    verifiedEvents,
    totalEvents: record.events.length,
    finalStateHash,
    recordedStateHash,
    mismatches
  };
}
