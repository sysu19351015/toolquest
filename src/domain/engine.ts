import { ToolQuestError } from "./errors.js";
import type {
  DomainActionResult,
  GameEvent,
  GameState,
  InteractionDefinition,
  ObjectDefinition,
  RoomDefinition,
  ScoreBreakdown
} from "./types.js";

function cloneState(state: GameState): GameState {
  return {
    ...state,
    inventory: [...state.inventory],
    flags: { ...state.flags }
  };
}

function locationFor(room: RoomDefinition, locationId: string) {
  const location = room.locations[locationId];
  if (location === undefined) {
    throw new Error(`Room ${room.id} references unknown location ${locationId}.`);
  }
  return location;
}

function visibleObjects(
  room: RoomDefinition,
  state: GameState
): ObjectDefinition[] {
  return Object.values(room.objects).filter(
    (object) =>
      object.locationId === state.locationId &&
      (object.hiddenWhenFlag === undefined ||
        state.flags[object.hiddenWhenFlag] !== true)
  );
}

function visibleObject(
  room: RoomDefinition,
  state: GameState,
  targetId: string
): ObjectDefinition {
  const object = visibleObjects(room, state).find(
    (candidate) => candidate.id === targetId
  );
  if (object === undefined) {
    throw new ToolQuestError(
      "NOT_VISIBLE",
      `Target '${targetId}' is not visible from the current location.`,
      true,
      "Call look and choose one of the returned object IDs."
    );
  }
  return object;
}

function interactionFor(
  room: RoomDefinition,
  interactionId: string
): InteractionDefinition {
  const interaction = room.interactions[interactionId];
  if (interaction === undefined) {
    throw new ToolQuestError(
      "UNKNOWN_INTERACTION",
      `Interaction '${interactionId}' does not exist.`,
      true,
      "Inspect a visible object and choose one of its returned interaction IDs."
    );
  }
  return interaction;
}

export function createInitialState(
  room: RoomDefinition,
  seed: string,
  startedAt: string
): GameState {
  return {
    roomId: room.id,
    roomVersion: room.version,
    seed,
    status: "active",
    locationId: room.initialLocationId,
    inventory: [],
    flags: {},
    attempts: 0,
    startedAt
  };
}

export function lookAround(
  room: RoomDefinition,
  state: GameState
): DomainActionResult {
  const location = locationFor(room, state.locationId);
  const objects = visibleObjects(room, state).map((object) => ({
    id: object.id,
    name: object.name,
    description: object.description
  }));
  const exits = location.exits.map((exit) => ({
    id: exit.id,
    label: exit.label,
    destinationId: exit.to,
    description: exit.description
  }));
  const inventory = state.inventory.map((itemId) => {
    const item = room.items[itemId];
    return {
      id: itemId,
      name: item?.name ?? itemId,
      description: item?.description ?? "Unknown item"
    };
  });

  return {
    state,
    changed: false,
    outcome: "success",
    message: `${location.name}: ${location.description}`,
    data: {
      room: { id: room.id, title: room.title },
      location: {
        id: location.id,
        name: location.name,
        description: location.description
      },
      objects,
      exits,
      inventory,
      attemptsRemaining: Math.max(0, room.maxAttempts - state.attempts)
    }
  };
}

export function inspectObject(
  room: RoomDefinition,
  state: GameState,
  targetId: string
): DomainActionResult {
  const object = visibleObject(room, state, targetId);
  const interactions = object.interactionIds.map((interactionId) => {
    const interaction = interactionFor(room, interactionId);
    const requiredItemId =
      interaction.effect.type === "set_flag"
        ? interaction.effect.requiredItemId
        : undefined;
    const requiredFlag =
      interaction.effect.type === "set_flag"
        ? interaction.effect.requiredFlag
        : undefined;
    return {
      id: interaction.id,
      title: interaction.title,
      description: interaction.description,
      ...(requiredItemId === undefined ? {} : { requiredItemId }),
      ...(requiredFlag === undefined ? {} : { requiredFlag })
    };
  });

  return {
    state,
    changed: false,
    outcome: "success",
    message: object.details,
    data: {
      target: {
        id: object.id,
        name: object.name,
        description: object.description,
        details: object.details
      },
      interactions
    }
  };
}

export function performMove(
  room: RoomDefinition,
  state: GameState,
  destinationId: string
): DomainActionResult {
  const location = locationFor(room, state.locationId);
  const exit = location.exits.find((candidate) => candidate.to === destinationId);
  if (exit === undefined) {
    throw new ToolQuestError(
      "INVALID_DESTINATION",
      `Destination '${destinationId}' is not reachable from ${location.name}.`,
      true,
      "Call look and use one of the returned destinationId values."
    );
  }

  const nextState = cloneState(state);
  nextState.locationId = destinationId;
  const destination = locationFor(room, destinationId);

  return {
    state: nextState,
    changed: true,
    outcome: "success",
    message: `You move to ${destination.name}. ${destination.description}`,
    data: {
      moved: true,
      from: location.id,
      destination: {
        id: destination.id,
        name: destination.name
      }
    }
  };
}

export function performUse(
  room: RoomDefinition,
  state: GameState,
  interactionId: string,
  itemId?: string
): DomainActionResult {
  const interaction = interactionFor(room, interactionId);
  visibleObject(room, state, interaction.targetId);

  if (interaction.locationId !== state.locationId) {
    throw new ToolQuestError(
      "NOT_VISIBLE",
      `Interaction '${interactionId}' is not available here.`,
      true,
      "Call look, move to the correct location, then inspect the target again."
    );
  }

  const nextState = cloneState(state);
  const { effect } = interaction;

  if (effect.type === "take_item") {
    if (state.inventory.includes(effect.itemId)) {
      return {
        state,
        changed: false,
        outcome: "world_failure",
        message: "You already have that item.",
        data: { applied: false, reason: "ITEM_ALREADY_TAKEN" }
      };
    }
    nextState.inventory.push(effect.itemId);
    nextState.flags[effect.takenFlag] = true;
  } else {
    if (state.flags[effect.flag] === effect.value) {
      return {
        state,
        changed: false,
        outcome: "world_failure",
        message: "That interaction has already been completed.",
        data: { applied: false, reason: "ALREADY_APPLIED" }
      };
    }

    if (effect.requiredItemId !== undefined) {
      if (itemId !== effect.requiredItemId) {
        return {
          state,
          changed: false,
          outcome: "world_failure",
          message: `This interaction requires itemId '${effect.requiredItemId}'.`,
          data: {
            applied: false,
            reason: "WRONG_ITEM",
            requiredItemId: effect.requiredItemId
          }
        };
      }
      if (!state.inventory.includes(effect.requiredItemId)) {
        return {
          state,
          changed: false,
          outcome: "world_failure",
          message: "You do not have the required item.",
          data: {
            applied: false,
            reason: "ITEM_MISSING",
            requiredItemId: effect.requiredItemId
          }
        };
      }
    }

    if (
      effect.requiredFlag !== undefined &&
      state.flags[effect.requiredFlag] !== true
    ) {
      return {
        state,
        changed: false,
        outcome: "world_failure",
        message: "A required room condition has not been completed yet.",
        data: {
          applied: false,
          reason: "PRECONDITION_NOT_MET",
          requiredFlag: effect.requiredFlag
        }
      };
    }

    nextState.flags[effect.flag] = effect.value;
    if (effect.consumeItem === true && effect.requiredItemId !== undefined) {
      nextState.inventory = nextState.inventory.filter(
        (candidate) => candidate !== effect.requiredItemId
      );
    }
  }

  return {
    state: nextState,
    changed: true,
    outcome: "success",
    message: interaction.successMessage,
    data: {
      applied: true,
      interactionId,
      inventory: [...nextState.inventory]
    }
  };
}

export function performSubmit(
  room: RoomDefinition,
  state: GameState,
  answer: string
): DomainActionResult {
  if (state.locationId !== room.requiredSubmitLocationId) {
    return {
      state,
      changed: false,
      outcome: "world_failure",
      message: "You must reach the final challenge location before submitting.",
      data: {
        correct: false,
        submitted: false,
        reason: "WRONG_LOCATION"
      }
    };
  }

  if (
    room.requiredSubmitFlag !== undefined &&
    state.flags[room.requiredSubmitFlag] !== true
  ) {
    return {
      state,
      changed: false,
      outcome: "world_failure",
      message: "The final challenge mechanism is not ready yet.",
      data: {
        correct: false,
        submitted: false,
        reason: "PRECONDITION_NOT_MET"
      }
    };
  }

  const nextState = cloneState(state);
  if (answer === room.answer) {
    nextState.status = "solved";
    return {
      state: nextState,
      changed: true,
      outcome: "success",
      message: "The answer is accepted. The exit opens. You escaped!",
      data: { correct: true, submitted: true }
    };
  }

  nextState.attempts += 1;
  const attemptsRemaining = Math.max(0, room.maxAttempts - nextState.attempts);
  if (attemptsRemaining === 0) {
    nextState.status = "failed";
  }

  return {
    state: nextState,
    changed: true,
    outcome: "world_failure",
    message:
      attemptsRemaining === 0
        ? "The final attempt fails and the room locks permanently."
        : `The code is incorrect. ${attemptsRemaining} attempt(s) remain.`,
    data: {
      correct: false,
      submitted: true,
      attemptsRemaining
    }
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "null" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

export function fingerprint(value: unknown): string {
  return canonicalize(value);
}

export function hashGameState(state: GameState): string {
  const input = canonicalize(state);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function calculateScore(
  status: GameState["status"],
  events: GameEvent[],
  parActions = 7
): ScoreBreakdown {
  const actions = events.filter((event) => event.tool !== "start_run");
  const failures = actions.filter(
    (event) => event.outcome === "world_failure"
  ).length;
  const completion = status === "solved" ? 50 : 0;
  const safety = 20;
  const efficiency =
    status === "solved"
      ? Math.max(0, 15 - Math.max(0, actions.length - parActions))
      : 0;
  const recovery =
    status === "solved" ? (failures > 0 ? 15 : 10) : 0;

  return {
    completion,
    safety,
    efficiency,
    recovery,
    total: completion + safety + efficiency + recovery
  };
}
