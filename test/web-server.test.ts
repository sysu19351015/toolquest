import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunObserver } from "../src/application/run-service.js";
import { createDefaultRunService } from "../src/composition.js";
import {
  createToolQuestWebServer,
  type ToolQuestWebMode
} from "../src/web/server.js";
import { createTestHarness, solveVault } from "./helpers.js";

const servers: Server[] = [];
const directories: string[] = [];

async function startWebServer(
  mode: ToolQuestWebMode = "observer",
  service: RunObserver = createTestHarness().service,
  eventPollIntervalMs = 20
): Promise<{ baseUrl: string; token: string }> {
  const server = createToolQuestWebServer({
    service,
    csrfToken: "test-token",
    mode,
    eventPollIntervalMs
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: "test-token"
  };
}

async function post(
  baseUrl: string,
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ToolQuest-Token": token
    },
    body: JSON.stringify(body)
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error === undefined ? resolve() : reject(error)));
        })
    )
  );
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ToolQuest Web server", () => {
  it("accepts a read-only service and rejects every write without adding events", async () => {
    const { service, runs, events } = createTestHarness();
    const started = service.startRun({ roomId: "the-vault" });
    const before = runs.find(started.runId);
    const observer: RunObserver = {
      listRooms: () => service.listRooms(),
      listRuns: (input) => service.listRuns(input),
      getRun: (id) => service.getRun(id),
      getRunObservation: (id) => service.getRunObservation(id),
      getRunTimeline: (id) => service.getRunTimeline(id),
      replayRun: (id) => service.replayRun(id),
      exportReport: (id) => service.exportReport(id)
    };
    const { baseUrl, token } = await startWebServer("observer", observer);
    for (const action of ["look", "inspect", "move", "use", "submit"]) {
      expect((await post(baseUrl, `/api/runs/${started.runId}/${action}`, token, {})).status).toBe(405);
    }
    for (const action of ["observation", "timeline", "replay", "report"]) {
      expect((await fetch(`${baseUrl}/api/runs/${started.runId}/${action}`)).status).toBe(200);
    }
    expect(events.events).toHaveLength(1);
    expect(runs.find(started.runId)).toEqual(before);
    expect(() => createToolQuestWebServer({ service: observer, mode: "playground" })).toThrow("command service");
  });

  it("rejects foreign origins and hostile Host headers before disclosing data", async () => {
    const { baseUrl } = await startWebServer();
    for (const headers of [
      { Origin: "https://example.invalid" },
      { Host: "example.invalid" },
      { Host: "127.0.0.1:1" },
      { "Sec-Fetch-Site": "cross-site" }
    ]) {
      // Native fetch may rewrite Host; send literal headers at the HTTP layer.
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(baseUrl + "/api/bootstrap", { headers }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        request.once("error", reject);
        request.end();
      });
      expect(status, JSON.stringify(headers)).toBe(403);
    }
    expect((await fetch(`${baseUrl}/api/bootstrap`, { headers: { Origin: baseUrl } })).status).toBe(200);
  });

  it("rejects invalid or future stream cursors and missing runs without losing availability", async () => {
    const { service } = createTestHarness();
    const run = service.startRun({ roomId: "the-vault" });
    const { baseUrl } = await startWebServer("observer", service);
    for (const cursor of ["-1", "1.5", "NaN", "2", "9007199254740992"]) {
      expect((await fetch(`${baseUrl}/api/runs/${run.runId}/events?after=${cursor}`)).status).toBe(400);
    }
    expect((await fetch(`${baseUrl}/api/runs/run_missing/events`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/bootstrap`)).status).toBe(200);
  });

  it("uses Last-Event-ID on reconnect and never streams answers or action digests", async () => {
    const { service } = createTestHarness();
    const run = service.startRun({ roomId: "the-vault" });
    solveVault(service, run.runId);
    const { baseUrl } = await startWebServer("observer", service);
    const response = await fetch(`${baseUrl}/api/runs/${run.runId}/events?after=1`, {
      headers: { "Last-Event-ID": "9" }, signal: AbortSignal.timeout(2000)
    });
    const reader = response.body!.getReader();
    let payload = "";
    try {
      while (!payload.includes(": observer-ready")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        payload += new TextDecoder().decode(chunk.value as Uint8Array);
      }
      expect(payload.match(/^id: \d+$/gm)).toEqual(["id: 10", "id: 11"]);
      expect(payload).toContain('"answerLength":3');
      expect(payload).not.toContain('"answer":');
      expect(payload).not.toContain("731");
      expect(payload).not.toContain("fingerprint");
      expect(payload).not.toContain('"actions":');
    } finally {
      await reader.cancel();
    }
  });

  it("stops observing after disconnect and ends streams when data becomes unavailable", async () => {
    const { service } = createTestHarness();
    const run = service.startRun({ roomId: "the-vault" });
    const timeline = vi.spyOn(service, "getRunTimeline");
    const { baseUrl } = await startWebServer("observer", service, 10);
    const response = await fetch(`${baseUrl}/api/runs/${run.runId}/events`, { signal: AbortSignal.timeout(2000) });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const calls = timeline.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(timeline).toHaveBeenCalledTimes(calls);

    const retry = await fetch(`${baseUrl}/api/runs/${run.runId}/events?after=1`, { signal: AbortSignal.timeout(2000) });
    timeline.mockImplementation(() => { throw new Error("Private filesystem detail"); });
    const payload = await retry.text();
    expect(payload).toContain("event: observer_error");
    expect(payload).not.toContain("Private filesystem detail");
    timeline.mockRestore();
  });

  it("serves the interface with local-only security headers", async () => {
    const { baseUrl } = await startWebServer();

    const response = await fetch(baseUrl);
    const content = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(content).toContain("Agent Evaluation Console");
  });

  it("defaults to a read-only observer without exposing a write token", async () => {
    const { baseUrl } = await startWebServer();
    const bootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`);
    const bootstrap = (await bootstrapResponse.json()) as {
      csrfToken?: unknown;
      capabilities?: { playground?: unknown };
    };
    const rejected = await post(baseUrl, "/api/runs", "test-token", {
      roomId: "the-vault"
    });
    const body = (await rejected.json()) as { code?: unknown };

    expect(bootstrap.csrfToken).toBeUndefined();
    expect(bootstrap.capabilities?.playground).toBe(false);
    expect(rejected.status).toBe(405);
    expect(body.code).toBe("READ_ONLY_OBSERVER");
  });

  it("requires the page token before creating or changing a run", async () => {
    const { baseUrl } = await startWebServer("playground");

    const rejected = await post(baseUrl, "/api/runs", "wrong-token", {
      roomId: "the-vault"
    });
    const body = (await rejected.json()) as { code?: unknown };

    expect(rejected.status).toBe(403);
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("supports discovery, play, recovery, replay, and report APIs", async () => {
    const { baseUrl, token } = await startWebServer("playground");
    const bootstrap = (await (await fetch(`${baseUrl}/api/bootstrap`)).json()) as {
      rooms: unknown[];
      runs: unknown[];
    };
    expect(bootstrap.rooms).toHaveLength(2);
    expect(bootstrap.runs).toEqual([]);

    const startedResponse = await post(baseUrl, "/api/runs", token, {
      roomId: "the-vault",
      seed: "web-test"
    });
    const started = (await startedResponse.json()) as { runId: string; data: { agent: { name: string } } };
    expect(startedResponse.status).toBe(201);
    expect(started.data.agent.name).toBe("Human Playground");

    const inspectedResponse = await post(
      baseUrl,
      `/api/runs/${started.runId}/inspect`,
      token,
      { targetId: "stone_tablet" }
    );
    const inspected = (await inspectedResponse.json()) as {
      data: { target: { id: string } };
    };
    expect(inspected.data.target.id).toBe("stone_tablet");

    const recovered = (await (
      await fetch(`${baseUrl}/api/runs/${started.runId}`)
    ).json()) as { data: { snapshot: { location: { id: string } } } };
    expect(recovered.data.snapshot.location.id).toBe("foyer");

    const timeline = (await (
      await fetch(`${baseUrl}/api/runs/${started.runId}/timeline`)
    ).json()) as { data: { timeline: unknown[] } };
    expect(timeline.data.timeline).toHaveLength(2);

    const replay = (await (
      await fetch(`${baseUrl}/api/runs/${started.runId}/replay`)
    ).json()) as { data: { replay: { valid: boolean } } };
    expect(replay.data.replay.valid).toBe(true);

    const report = (await (
      await fetch(`${baseUrl}/api/runs/${started.runId}/report`)
    ).json()) as { data: { content: string } };
    expect(report.data.content).toContain("# ToolQuest Run Report");
    expect(report.data.content).not.toContain("731");
  });

  it("streams events written by a separate Agent service sharing the state directory", async () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), "toolquest-observer-"));
    directories.push(stateDirectory);
    const agentService = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const observerService = createDefaultRunService({
      persistRuns: true,
      stateDirectory,
      persistTraces: false
    });
    const started = agentService.startRun({
      roomId: "the-vault",
      seed: "observer-test",
      agent: {
        name: "Evaluation Agent",
        model: "test-model",
        provider: "local"
      },
      label: "sse-contract"
    });
    const { baseUrl } = await startWebServer("observer", observerService, 15);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await fetch(
        `${baseUrl}/api/runs/${started.runId}/events?after=1`,
        { signal: controller.signal }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Expected an SSE response body.");

      agentService.look(started.runId);
      const decoder = new TextDecoder();
      let payload = "";
      while (!payload.includes("event: run_event")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        payload += decoder.decode(chunk.value as Uint8Array, { stream: true });
      }

      expect(payload).toContain("id: 2");
      expect(payload).toContain("\"eventSeq\":2");
      expect(payload).toContain("\"tool\":\"look\"");
      const listed = (await (
        await fetch(`${baseUrl}/api/runs?limit=10`)
      ).json()) as {
        data: { runs: Array<{ agent?: { name?: string }; label?: string }> };
      };
      expect(listed.data.runs[0]?.agent?.name).toBe("Evaluation Agent");
      expect(listed.data.runs[0]?.label).toBe("sse-contract");
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  });
});
