import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToolQuestServer } from "../src/mcp/server-factory.js";
import { createTestHarness } from "./helpers.js";

function envelope(structuredContent: unknown): Record<string, unknown> {
  return typeof structuredContent === "object" &&
    structuredContent !== null &&
    !Array.isArray(structuredContent)
    ? (structuredContent as Record<string, unknown>)
    : {};
}

describe("ToolQuest MCP contract", () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    server = createToolQuestServer(createTestHarness().service);
    client = new Client({ name: "toolquest-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("exposes exactly the ten stable tools with schemas and annotations", async () => {
    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name)).toEqual([
      "list_rooms",
      "start_run",
      "get_run",
      "replay_run",
      "export_report",
      "look",
      "inspect",
      "move",
      "use",
      "submit"
    ]);
    for (const tool of listed.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema?.type).toBe("object");
      expect(tool.annotations?.openWorldHint).toBe(false);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
    expect(
      listed.tools.find((tool) => tool.name === "look")?.annotations
        ?.readOnlyHint
    ).toBe(true);
    expect(
      listed.tools.find((tool) => tool.name === "move")?.annotations
        ?.readOnlyHint
    ).toBe(false);
  });

  it("inspects, replays, and reports a run without mutating it", async () => {
    const started = await client.callTool({
      name: "start_run",
      arguments: { roomId: "the-vault", seed: "inspection-test" }
    });
    const startEnvelope = envelope(started.structuredContent);
    const runId = startEnvelope["runId"];

    const inspected = await client.callTool({
      name: "get_run",
      arguments: { runId }
    });
    const replayed = await client.callTool({
      name: "replay_run",
      arguments: { runId }
    });
    const reported = await client.callTool({
      name: "export_report",
      arguments: { runId }
    });
    const inspectedEnvelope = envelope(inspected.structuredContent);
    const replayEnvelope = envelope(replayed.structuredContent);
    const replayData = envelope(replayEnvelope["data"]);
    const replay = envelope(replayData["replay"]);
    const reportEnvelope = envelope(reported.structuredContent);
    const reportData = envelope(reportEnvelope["data"]);

    expect(inspectedEnvelope["eventSeq"]).toBe(1);
    expect(inspectedEnvelope["events"]).toEqual([]);
    expect(replay["valid"]).toBe(true);
    expect(reportData["format"]).toBe("markdown");
    expect(reportData["content"]).toContain("# ToolQuest Run Report");
  });

  it("discovers rooms without creating a run", async () => {
    const listed = await client.callTool({
      name: "list_rooms",
      arguments: {}
    });
    const result = envelope(listed.structuredContent);
    const data = envelope(result["data"]);

    expect(listed.isError).not.toBe(true);
    expect(result["ok"]).toBe(true);
    expect(result["events"]).toEqual([]);
    expect(data["rooms"]).toEqual([
      expect.objectContaining({ id: "the-vault", difficulty: "starter" }),
      expect.objectContaining({
        id: "signal-station",
        difficulty: "intermediate"
      })
    ]);
  });

  it("returns structured content that can drive the next tool call", async () => {
    const started = await client.callTool({
      name: "start_run",
      arguments: { roomId: "the-vault", seed: "mcp-test" }
    });
    const startEnvelope = envelope(started.structuredContent);
    expect(startEnvelope["ok"]).toBe(true);
    expect(startEnvelope["stateVersion"]).toBe(0);
    expect(typeof startEnvelope["runId"]).toBe("string");

    const looked = await client.callTool({
      name: "look",
      arguments: { runId: startEnvelope["runId"] }
    });
    const lookEnvelope = envelope(looked.structuredContent);
    expect(looked.isError).not.toBe(true);
    expect(lookEnvelope["ok"]).toBe(true);
    const lookData = envelope(lookEnvelope["data"]);
    const location = envelope(lookData["location"]);
    expect(location["id"]).toBe("foyer");
  });

  it("maps domain failures to recoverable MCP tool errors", async () => {
    const result = await client.callTool({
      name: "look",
      arguments: { runId: "run_does-not-exist" }
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        code: "RUN_NOT_FOUND",
        retryable: true
      })
    );
  });
});
