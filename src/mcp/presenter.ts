import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isToolQuestError } from "../domain/errors.js";
import type { ToolQuestSuccess } from "../domain/types.js";

export function presentSuccess(result: ToolQuestSuccess): CallToolResult {
  const structuredContent = { ...result };
  return {
    content: [{ type: "text", text: result.message }],
    structuredContent
  };
}

export function presentError(error: unknown): CallToolResult {
  if (isToolQuestError(error)) {
    const structuredContent = {
      ok: false,
      message: error.message,
      data: error.details,
      events: [],
      code: error.code,
      retryable: error.retryable,
      recoveryHint: error.recoveryHint
    };
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            "[" +
            error.code +
            "] " +
            error.message +
            " Recovery: " +
            error.recoveryHint
        }
      ],
      structuredContent
    };
  }

  const correlationId = randomUUID();
  const diagnostic = error instanceof Error ? error.stack : String(error);
  console.error(
    "[toolquest] Internal error " + correlationId + ": " + diagnostic
  );
  const structuredContent = {
    ok: false,
    message: "ToolQuest encountered an internal error.",
    data: {},
    events: [],
    code: "INTERNAL_ERROR",
    retryable: false,
    recoveryHint:
      "Check the ToolQuest server stderr log and retry only after the server is healthy.",
    correlationId
  };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          "[INTERNAL_ERROR] ToolQuest encountered an internal error. Correlation ID: " +
          correlationId
      }
    ],
    structuredContent
  };
}
