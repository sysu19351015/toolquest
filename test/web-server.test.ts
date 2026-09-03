import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createToolQuestWebServer } from "../src/web/server.js";
import { createTestHarness } from "./helpers.js";

const servers: Server[] = [];

async function startWebServer(): Promise<{ baseUrl: string; token: string }> {
  const server = createToolQuestWebServer({
    service: createTestHarness().service,
    csrfToken: "test-token"
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
          server.close((error) => (error === undefined ? resolve() : reject(error)));
        })
    )
  );
});

describe("ToolQuest Web server", () => {
  it("serves the interface with local-only security headers", async () => {
    const { baseUrl } = await startWebServer();

    const response = await fetch(baseUrl);
    const content = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(content).toContain("ToolQuest · 数字密室");
  });

  it("requires the page token before creating or changing a run", async () => {
    const { baseUrl } = await startWebServer();

    const rejected = await post(baseUrl, "/api/runs", "wrong-token", {
      roomId: "the-vault"
    });
    const body = (await rejected.json()) as { code?: unknown };

    expect(rejected.status).toBe(403);
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("supports discovery, play, recovery, replay, and report APIs", async () => {
    const { baseUrl, token } = await startWebServer();
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
    const started = (await startedResponse.json()) as { runId: string };
    expect(startedResponse.status).toBe(201);

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
});
