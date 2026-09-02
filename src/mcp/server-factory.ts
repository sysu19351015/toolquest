import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RunService } from "../application/run-service.js";
import { createDefaultRunService } from "../composition.js";
import { presentError, presentSuccess } from "./presenter.js";
import {
  InspectInputSchema,
  LookInputSchema,
  MoveInputSchema,
  StartRunInputSchema,
  SubmitInputSchema,
  ToolEnvelopeSchema,
  UseInputSchema
} from "./schemas.js";

function handle(operation: () => ReturnType<RunService["look"]>): CallToolResult {
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
    { name: "toolquest", version: "0.1.0" },
    {
      instructions:
        "ToolQuest is a deterministic escape-room testbed. Start with start_run, then call look. Use IDs exactly as returned. Mutating tools require a unique actionId and the latest stateVersion. Calls affect only the virtual room."
    }
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
