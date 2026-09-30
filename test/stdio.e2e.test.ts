import {
  StdioClientTransport,
  getDefaultEnvironment
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { join, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createDefaultRunService } from "../src/composition.js";
import { createToolQuestWebServer } from "../src/web/server.js";
import type { ToolQuestSuccess } from "../src/domain/types.js";

function envelope(structuredContent: unknown): Record<string, unknown> {
  return typeof structuredContent === "object" &&
    structuredContent !== null &&
    !Array.isArray(structuredContent)
    ? (structuredContent as Record<string, unknown>)
    : {};
}

describe("stdio server", () => {
  it("observes a real MCP subprocess through Web SSE, final score, replay and report", async () => {
    const projectRoot = resolve(import.meta.dirname, "..");
    const stateDirectory = mkdtempSync(join(tmpdir(), "toolquest-mcp-observer-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(projectRoot, "dist", "server.js")],
      cwd: projectRoot,
      env: {
        ...getDefaultEnvironment(), TOOLQUEST_DISABLE_TRACES: "1",
        TOOLQUEST_DISABLE_STATE: "0", TOOLQUEST_STATE_DIR: stateDirectory
      },
      stderr: "pipe"
    });
    const client = new Client({ name: "scripted-observer-smoke", version: "0.5.0" });
    const observer = createDefaultRunService({ stateDirectory, persistTraces: false });
    const web = createToolQuestWebServer({ service: observer, eventPollIntervalMs: 10 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      await new Promise<void>((done) => web.listen(0, "127.0.0.1", done));
      await client.connect(transport);
      const started = await client.callTool({
        name: "start_run",
        arguments: {
          roomId: "the-vault", seed: "stdio-observer",
          agent: { name: "Scripted MCP smoke", model: "no-llm" }, label: "e2e"
        }
      });
      const runId = envelope(started.structuredContent)["runId"] as string;
      const baseUrl = "http://127.0.0.1:" + (web.address() as AddressInfo).port;
      const response = await fetch(baseUrl + "/api/runs/" + runId + "/events?after=1", {
        signal: controller.signal
      });
      let stateVersion = 0;
      let eventSeq = 1;
      for (const [name, args] of [
        ["move", { destinationId: "gallery" }],
        ["use", { interactionId: "take_brass_key" }],
        ["move", { destinationId: "vault" }],
        ["use", { interactionId: "unlock_vault", itemId: "brass_key" }],
        ["submit", { answer: "731" }]
      ] as const) {
        const result = await client.callTool({
          name, arguments: { ...args, runId, expectedStateVersion: stateVersion, actionId: "e2e-" + eventSeq }
        });
        expect(result.isError).not.toBe(true);
        const content = envelope(result.structuredContent);
        stateVersion = content["stateVersion"] as number;
        eventSeq = content["eventSeq"] as number;
      }
      const reader = response.body!.getReader();
      let payload = "";
      while (!payload.includes("id: " + eventSeq + "\n")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        payload += new TextDecoder().decode(chunk.value as Uint8Array);
      }
      await reader.cancel();
      expect(payload).toContain('"tool":"submit"');
      expect(payload).not.toContain('"answer":');
      expect(payload).not.toContain("fingerprint");
      const observed = await (await fetch(baseUrl + "/api/runs/" + runId + "/observation")).json() as ToolQuestSuccess;
      expect(observed.status).toBe("solved");
      expect(observed.score?.completion).toBe(50);
      expect(observed.data["agent"]).toMatchObject({ name: "Scripted MCP smoke" });
      expect(observed.data["timeline"]).toHaveLength(eventSeq);
      const replay = await (await fetch(baseUrl + "/api/runs/" + runId + "/replay")).json() as ToolQuestSuccess;
      expect(replay.data["replay"]).toMatchObject({ valid: true });
      const report = await (await fetch(baseUrl + "/api/runs/" + runId + "/report")).json() as ToolQuestSuccess;
      expect(report.data["content"]).toContain("Agent: Scripted MCP smoke");
      expect(report.data["content"]).not.toContain("731");
      expect(observer.getRun(runId).eventSeq).toBe(eventSeq);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await client.close();
      web.closeAllConnections();
      await new Promise<void>((done) => web.close(() => done()));
      rmSync(stateDirectory, { recursive: true, force: true });
    }
  }, 10000);

  it("starts as a real subprocess and completes MCP discovery and calls", async () => {
    const projectRoot = resolve(import.meta.dirname, "..");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(projectRoot, "dist", "server.js")],
      cwd: projectRoot,
      env: {
        ...getDefaultEnvironment(),
        TOOLQUEST_DISABLE_TRACES: "1",
        TOOLQUEST_DISABLE_STATE: "1"
      },
      stderr: "pipe"
    });
    const client = new Client({ name: "toolquest-stdio-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(11);
      expect(tools.tools.some((tool) => tool.name === "list_rooms")).toBe(true);
      expect(tools.tools.some((tool) => tool.name === "list_runs")).toBe(true);
      expect(tools.tools.some((tool) => tool.name === "get_run")).toBe(true);
      expect(tools.tools.some((tool) => tool.name === "replay_run")).toBe(true);
      expect(tools.tools.some((tool) => tool.name === "export_report")).toBe(
        true
      );

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
