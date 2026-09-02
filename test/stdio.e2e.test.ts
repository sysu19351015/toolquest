import {
  StdioClientTransport,
  getDefaultEnvironment
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function envelope(structuredContent: unknown): Record<string, unknown> {
  return typeof structuredContent === "object" &&
    structuredContent !== null &&
    !Array.isArray(structuredContent)
    ? (structuredContent as Record<string, unknown>)
    : {};
}

describe("stdio server", () => {
  it("starts as a real subprocess and completes MCP discovery and calls", async () => {
    const projectRoot = resolve(import.meta.dirname, "..");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(projectRoot, "dist", "server.js")],
      cwd: projectRoot,
      env: {
        ...getDefaultEnvironment(),
        TOOLQUEST_DISABLE_TRACES: "1"
      },
      stderr: "pipe"
    });
    const client = new Client({ name: "toolquest-stdio-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(6);

      const started = await client.callTool({
        name: "start_run",
        arguments: { roomId: "the-vault", seed: "stdio-test" }
      });
      const startEnvelope = envelope(started.structuredContent);
      expect(started.isError).not.toBe(true);
      expect(startEnvelope["status"]).toBe("active");

      const looked = await client.callTool({
        name: "look",
        arguments: { runId: startEnvelope["runId"] }
      });
      const lookEnvelope = envelope(looked.structuredContent);
      const lookData = envelope(lookEnvelope["data"]);
      const location = envelope(lookData["location"]);
      expect(location["id"]).toBe("foyer");
    } finally {
      await client.close();
    }
  });
});
