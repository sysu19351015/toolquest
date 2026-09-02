import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RunService } from "../application/run-service.js";
import { createDefaultRunService } from "../composition.js";
import type { ToolQuestResult } from "../domain/types.js";
import { presentError, presentSuccess } from "./presenter.js";
import {
  InspectInputSchema,
  ListRoomsInputSchema,
  LookInputSchema,
  MoveInputSchema,
  RunQueryInputSchema,
  StartRunInputSchema,
  SubmitInputSchema,
  ToolEnvelopeSchema,
  UseInputSchema
} from "./schemas.js";

function handle(operation: () => ToolQuestResult): CallToolResult {
  try {
    return presentSuccess(operation());
  } catch (error) {
    return presentError(error);
  }
}

export function createToolQuestServer(
  service: RunService = createDefaultRunService()
): McpServer {
  const server = new McpServer(
    { name: "toolquest", version: "0.3.0" },
    {
      instructions:
        "ToolQuest is a deterministic escape-room testbed with persistent runs. Call list_rooms to discover challenges, then start_run and look. Use get_run to resume after a client or server restart. Mutating tools require a unique actionId and the latest stateVersion. Calls affect only the virtual room."
    }
  );

  server.registerTool(
    "list_rooms",
    {
      title: "List ToolQuest Rooms",
      description:
        "Discover all built-in rooms with their IDs, versions, difficulty, introductions, and par action counts. This does not create or change a run.",
      inputSchema: ListRoomsInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    () => handle(() => service.listRooms())
  );

  server.registerTool(
    "start_run",
    {
      title: "Start ToolQuest Run",
      description:
        "Create an isolated deterministic escape-room run. Returns an opaque runId, initial stateVersion, room introduction, and next-step guidance.",
      inputSchema: StartRunInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    (args) => handle(() => service.startRun(args))
  );

  server.registerTool(
    "get_run",
    {
      title: "Get ToolQuest Run",
      description:
        "Resume a persisted run by reading its public current snapshot, status, stateVersion, stateHash, event count, and score when terminal. This does not append an event.",
      inputSchema: RunQueryInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    ({ runId }) => handle(() => service.getRun(runId))
  );

  server.registerTool(
    "replay_run",
    {
      title: "Replay ToolQuest Run",
      description:
        "Deterministically rebuild a run from its redacted event log and verify every stateVersion, stateHash, outcome, and final state. This does not change the run.",
      inputSchema: RunQueryInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    ({ runId }) => handle(() => service.replayRun(runId))
  );

  server.registerTool(
    "export_report",
    {
      title: "Export ToolQuest Run Report",
      description:
        "Generate a Markdown benchmark report containing run metadata, score, replay verification, and a redacted event timeline. Returns content without writing a file.",
      inputSchema: RunQueryInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    ({ runId }) => handle(() => service.exportReport(runId))
  );

  server.registerTool(
    "look",
    {
      title: "Look Around",
      description:
        "Read the current room, visible object IDs, destination IDs, inventory, and attempts remaining. This does not change virtual world state.",
      inputSchema: LookInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    ({ runId }) => handle(() => service.look(runId))
  );

  server.registerTool(
    "inspect",
    {
      title: "Inspect Object",
      description:
        "Inspect one visible object by targetId. Returns clues and valid interaction IDs without changing virtual world state.",
      inputSchema: InspectInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    (args) => handle(() => service.inspect(args))
  );

  server.registerTool(
    "move",
    {
      title: "Move",
      description:
        "Move to a destinationId returned by look. This changes virtual room state. Provide a unique actionId and the latest expectedStateVersion; exact retries with the same actionId are safe.",
      inputSchema: MoveInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    (args) => handle(() => service.move(args))
  );

  server.registerTool(
    "use",
    {
      title: "Use Interaction",
      description:
        "Perform an interactionId returned by inspect, optionally with an inventory itemId. This changes only virtual room state and is protected by actionId and stateVersion.",
      inputSchema: UseInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    (args) => handle(() => service.use(args))
  );

  server.registerTool(
    "submit",
    {
      title: "Submit Room Answer",
      description:
        "Submit a candidate answer to the final room challenge. Incorrect answers may consume an attempt; a correct answer ends the run and returns a deterministic score.",
      inputSchema: SubmitInputSchema,
      outputSchema: ToolEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    (args) => handle(() => service.submit(args))
  );

  return server;
}
