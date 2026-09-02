export type ToolQuestErrorCode =
  | "ROOM_NOT_FOUND"
  | "RUN_NOT_FOUND"
  | "RUN_TERMINAL"
  | "NOT_VISIBLE"
  | "INVALID_DESTINATION"
  | "UNKNOWN_INTERACTION"
  | "VERSION_CONFLICT"
  | "ACTION_ID_CONFLICT";

export class ToolQuestError extends Error {
  public constructor(
    public readonly code: ToolQuestErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly recoveryHint: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ToolQuestError";
  }
}

export function isToolQuestError(error: unknown): error is ToolQuestError {
  return error instanceof ToolQuestError;
}
