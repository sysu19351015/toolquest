#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createToolQuestServer } from "./mcp/server-factory.js";

const server = createToolQuestServer();
const transport = new StdioServerTransport();
let closing = false;

async function shutdown(exitCode: number): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  try {
    await server.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[toolquest] Failed to close MCP server: " + message);
    exitCode = 1;
  }
  process.exitCode = exitCode;
}

process.once("SIGINT", () => {
  void shutdown(0);
});
process.once("SIGTERM", () => {
  void shutdown(0);
});

try {
  await server.connect(transport);
} catch (error) {
  const message = error instanceof Error ? error.stack : String(error);
  console.error("[toolquest] MCP server failed to start: " + message);
  await shutdown(1);
}
