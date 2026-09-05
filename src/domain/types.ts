export type RunStatus = "active" | "solved" | "failed";

export type EventOutcome = "success" | "world_failure";

export type RoomDifficulty = "starter" | "intermediate" | "advanced";

export interface AgentMetadata {
  name: string;
  model?: string;
  provider?: string;
  version?: string;
  framework?: string;
}

export type GameToolName =
  | "start_run"
  | "look"
  | "inspect"
  | "move"
  | "use"
  | "submit";

export interface RoomExit {
  id: string;
  label: string;
  to: string;
  description: string;
}

export interface LocationDefinition {
  id: string;
  name: string;
  description: string;
  exits: RoomExit[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
}

export interface ObjectDefinition {
  id: string;
  name: string;
  description: string;
  details: string;
  locationId: string;
  interactionIds: string[];
  hiddenWhenFlag?: string;
}

export type InteractionEffect =
  | {
      type: "take_item";
      itemId: string;
      takenFlag: string;
    }
  | {
      type: "set_flag";
      flag: string;
      value: boolean;
      requiredItemId?: string;
      requiredFlag?: string;
      consumeItem?: boolean;
    };

export interface InteractionDefinition {
  id: string;
  title: string;
  description: string;
  targetId: string;
  locationId: string;
  successMessage: string;
  effect: InteractionEffect;
}

export interface RoomDefinition {
  id: string;
  title: string;
  version: string;
  difficulty: RoomDifficulty;
  parActions: number;
  introduction: string;
  initialLocationId: string;
  requiredSubmitLocationId: string;
  requiredSubmitFlag?: string;
  answer: string;
  maxAttempts: number;
  locations: Record<string, LocationDefinition>;
  items: Record<string, ItemDefinition>;
  objects: Record<string, ObjectDefinition>;
  interactions: Record<string, InteractionDefinition>;
}

export interface RoomSummary {
  id: string;
  title: string;
  version: string;
  difficulty: RoomDifficulty;
  parActions: number;
  introduction: string;
}

export interface RunSummary {
  runId: string;
  room: {
    id: string;
    title: string;
    version: string;
  };
  status: RunStatus;
  stateVersion: number;
  eventSeq: number;
  stateHash: string;
  startedAt: string;
  agent?: AgentMetadata;
  label?: string;
  score?: ScoreBreakdown;
}

export interface GameState {
  roomId: string;
  roomVersion: string;
  seed: string;
  status: RunStatus;
  locationId: string;
  inventory: string[];
  flags: Record<string, boolean>;
  attempts: number;
  startedAt: string;
}

export interface GameEvent {
  runId: string;
  eventSeq: number;
  stateVersion: number;
  stateHash: string;
  tool: GameToolName;
  at: string;
  outcome: EventOutcome;
  message: string;
  input: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface ScoreBreakdown {
  completion: number;
  safety: number;
  efficiency: number;
  recovery: number;
  total: number;
}

export interface ToolQuestSuccess {
  ok: true;
  runId: string;
  eventSeq: number;
  stateVersion: number;
  stateHash: string;
  status: RunStatus;
  message: string;
  data: Record<string, unknown>;
  events: GameEvent[];
  score?: ScoreBreakdown;
}

export interface ToolQuestCatalogSuccess {
  ok: true;
  message: string;
  data: {
    rooms: RoomSummary[];
  };
  events: [];
}

export interface ToolQuestRunListSuccess {
  ok: true;
  message: string;
  data: {
    runs: RunSummary[];
  };
  events: [];
}

export type ToolQuestResult =
  | ToolQuestSuccess
  | ToolQuestCatalogSuccess
  | ToolQuestRunListSuccess;

export interface CachedAction {
  fingerprint: string;
  result: ToolQuestSuccess;
}

export interface RunRecord {
  runId: string;
  state: GameState;
  stateVersion: number;
  eventSeq: number;
  events: GameEvent[];
  actions: Record<string, CachedAction>;
  agent?: AgentMetadata;
  label?: string;
}

export interface DomainActionResult {
  state: GameState;
  changed: boolean;
  outcome: EventOutcome;
  message: string;
  data: Record<string, unknown>;
}
