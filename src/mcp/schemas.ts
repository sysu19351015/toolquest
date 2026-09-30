import { z } from "zod";

const RunIdSchema = z
  .string()
  .min(8)
  .max(80)
  .regex(/^run_[a-zA-Z0-9-]+$/, "Invalid ToolQuest runId.");

const ActionIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z0-9._:-]+$/,
    "actionId may contain letters, numbers, dot, underscore, colon, and dash."
  );

const IdentifierSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid ToolQuest identifier.");

const CommandFields = {
  runId: RunIdSchema.describe("Opaque run ID returned by start_run."),
  actionId: ActionIdSchema.describe(
    "Unique idempotency key for this action. Reuse only when retrying the exact same action."
  ),
  expectedStateVersion: z
    .number()
    .int()
    .nonnegative()
    .describe("Latest stateVersion observed from a previous ToolQuest result.")
};

export const ListRoomsInputSchema = z.object({}).strict();

export const ListRunsInputSchema = z
  .object({
    status: z
      .enum(["active", "solved", "failed"])
      .optional()
      .describe("Optional run status filter."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum number of newest runs to return (1-100).")
  })
  .strict();

export const AgentMetadataSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe("Human-readable name of the Agent under evaluation."),
    model: z.string().trim().min(1).max(120).optional(),
    provider: z.string().trim().min(1).max(80).optional(),
    version: z.string().trim().min(1).max(80).optional(),
    framework: z.string().trim().min(1).max(80).optional()
  })
  .strict()
  .describe("Optional public identity for the Agent under evaluation. Never include secrets or prompts.");

export const StartRunInputSchema = z
  .object({
    roomId: IdentifierSchema.default("the-vault").describe(
      "Room to start. Call list_rooms to discover the available room IDs."
    ),
    seed: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe("Optional deterministic seed for reproducing this run."),
    agent: AgentMetadataSchema.optional(),
    label: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("Optional public label for grouping or identifying this evaluation run.")
  })
  .strict();

export const LookInputSchema = z
  .object({
    runId: RunIdSchema.describe("Opaque run ID returned by start_run.")
  })
  .strict();

export const RunQueryInputSchema = LookInputSchema;

export const InspectInputSchema = z
  .object({
    runId: RunIdSchema.describe("Opaque run ID returned by start_run."),
    targetId: IdentifierSchema.describe(
      "ID of an object returned by the latest look result."
    )
  })
  .strict();

export const MoveInputSchema = z
  .object({
    ...CommandFields,
    destinationId: IdentifierSchema.describe(
      "destinationId returned by the latest look result."
    )
  })
  .strict();

export const UseInputSchema = z
  .object({
    ...CommandFields,
    interactionId: IdentifierSchema.describe(
      "Interaction ID returned by inspect."
    ),
    itemId: IdentifierSchema.optional().describe(
      "Optional inventory item ID to use for the interaction."
    )
  })
  .strict();

export const SubmitInputSchema = z
  .object({
    ...CommandFields,
    answer: z
      .string()
      .min(1)
      .max(128)
      .describe("Candidate answer for the room's final challenge.")
  })
  .strict();

const EventSchema = z
  .object({
    runId: z.string(),
    eventSeq: z.number().int().nonnegative(),
    stateVersion: z.number().int().nonnegative(),
    stateHash: z.string(),
    tool: z.enum([
      "start_run",
      "look",
      "inspect",
      "move",
      "use",
      "submit"
    ]),
    at: z.string(),
    outcome: z.enum(["success", "world_failure"]),
    message: z.string(),
    input: z.record(z.string(), z.unknown()),
    data: z.record(z.string(), z.unknown())
  })
  .strict();

const ScoreSchema = z
  .object({
    completion: z.number().int(),
    safety: z.number().int(),
    efficiency: z.number().int(),
    recovery: z.number().int(),
    total: z.number().int()
  })
  .strict();

export const ToolEnvelopeSchema = z
  .object({
    ok: z.boolean(),
    runId: z.string().optional(),
    eventSeq: z.number().int().nonnegative().optional(),
    stateVersion: z.number().int().nonnegative().optional(),
    stateHash: z.string().optional(),
    status: z.enum(["active", "solved", "failed"]).optional(),
    message: z.string(),
    data: z.record(z.string(), z.unknown()),
    events: z.array(EventSchema),
    score: ScoreSchema.optional(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    recoveryHint: z.string().optional(),
    correlationId: z.string().optional()
  })
  .strict();
