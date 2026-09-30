import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  statSync
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import type { RunObserver, RunService } from "../application/run-service.js";
import { createDefaultRunService } from "../composition.js";
import { isToolQuestError } from "../domain/errors.js";
import type { GameEvent, ToolQuestSuccess } from "../domain/types.js";
import {
  InspectInputSchema,
  ListRunsInputSchema,
  LookInputSchema,
  MoveInputSchema,
  StartRunInputSchema,
  SubmitInputSchema,
  UseInputSchema
} from "../mcp/schemas.js";

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_PORT = 4310;
const DEFAULT_EVENT_POLL_INTERVAL_MS = 500;

export type ToolQuestWebMode = "observer" | "playground";

export interface ToolQuestWebServerOptions {
  service?: RunObserver;
  staticDirectory?: string;
  csrfToken?: string;
  mode?: ToolQuestWebMode;
  eventPollIntervalMs?: number;
}

function supportsPlayground(service: RunObserver): service is RunService {
  const candidate = service as Partial<RunService>;
  return (
    typeof candidate.startRun === "function" &&
    typeof candidate.look === "function" &&
    typeof candidate.inspect === "function" &&
    typeof candidate.move === "function" &&
    typeof candidate.use === "function" &&
    typeof candidate.submit === "function"
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function isLocalRequest(request: IncomingMessage): boolean {
  try {
    const host = new URL("http://" + (request.headers.host ?? ""));
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host.hostname)) return false;
    if (host.username || host.password || host.pathname !== "/") return false;
    if (Number(host.port || 80) !== request.socket.localPort) return false;
    const origin = request.headers.origin;
    return (
      request.headers["sec-fetch-site"] !== "cross-site" &&
      (origin === undefined || origin === host.origin)
    );
  } catch {
    return false;
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendError(response: ServerResponse, error: unknown): void {
  if (isToolQuestError(error)) {
    sendJson(response, error.code.endsWith("NOT_FOUND") ? 404 : 409, {
      ok: false,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      recoveryHint: error.recoveryHint,
      details: error.details
    });
    return;
  }
  const requestError = error instanceof Error ? error.message : "";
  const statusCode = requestError === "REQUEST_TOO_LARGE" ? 413 : 400;
  sendJson(response, statusCode, {
    ok: false,
    code: statusCode === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST",
    message:
      statusCode === 413
        ? "The request body is too large."
        : "The request could not be understood."
  });
}

function contentType(path: string): string {
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".jpg")) return "image/jpeg";
  return "text/html; charset=utf-8";
}

function requireToken(request: IncomingMessage, response: ServerResponse, token: string): boolean {
  if (request.headers["x-toolquest-token"] === token) {
    return true;
  }
  sendJson(response, 403, {
    ok: false,
    code: "INVALID_TOKEN",
    message: "Refresh the page and try again."
  });
  return false;
}

function requirePlayground(response: ServerResponse, mode: ToolQuestWebMode): boolean {
  if (mode === "playground") return true;
  sendJson(response, 405, {
    ok: false,
    code: "READ_ONLY_OBSERVER",
    message: "The evaluation console is read-only. Start explicit Playground mode for human actions."
  });
  return false;
}

function withRunId(body: unknown, runId: string): Record<string, unknown> {
  return {
    ...(typeof body === "object" && body !== null && !Array.isArray(body)
      ? body
      : {}),
    runId
  };
}

function serveAsset(response: ServerResponse, directory: string, asset: string): void {
  const path = join(directory, asset);
  if (!existsSync(path) || !statSync(path).isFile()) {
    sendJson(response, 404, { ok: false, code: "NOT_FOUND", message: "Not found." });
    return;
  }
  response.writeHead(200, { "Content-Type": contentType(path) });
  createReadStream(path).pipe(response);
}

function timelineFrom(result: ToolQuestSuccess): GameEvent[] {
  const timeline = result.data["timeline"];
  return Array.isArray(timeline) ? (timeline as GameEvent[]) : [];
}

function eventCursor(request: IncomingMessage, url: URL): number {
  // EventSource retains the initial query on reconnect; the header is newer.
  const raw = request.headers["last-event-id"] ?? url.searchParams.get("after");
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("INVALID_CURSOR");
  }
  return parsed;
}

function streamRunEvents(
  response: ServerResponse,
  service: RunObserver,
  runId: string,
  initialCursor: number,
  pollIntervalMs: number
): void {
  const initial = timelineFrom(service.getRunTimeline(runId));
  if (initialCursor > (initial.at(-1)?.eventSeq ?? 0)) {
    throw new Error("INVALID_CURSOR");
  }
  let cursor = initialCursor;
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const writePending = (events: GameEvent[]): void => {
    if (response.destroyed || response.writableNeedDrain) return;
    for (const event of events) {
      if (event.eventSeq <= cursor) continue;
      const accepted = response.write(
        "id: " + event.eventSeq + "\nevent: run_event\ndata: " +
        JSON.stringify(event) + "\n\n"
      );
      cursor = event.eventSeq;
      if (!accepted) break;
    }
  };

  writePending(initial);
  response.write(": observer-ready\n\n");
  const poll = setInterval(() => {
    try {
      writePending(timelineFrom(service.getRunTimeline(runId)));
    } catch {
      response.write("event: observer_error\n");
      response.write('data: {"message":"Run data is temporarily unavailable."}\n\n');
      response.end();
    }
  }, pollIntervalMs);
  const heartbeat = setInterval(() => {
    if (!response.destroyed && !response.writableNeedDrain) {
      response.write(": heartbeat\n\n");
    }
  }, 15_000);
  const cleanup = (): void => {
    clearInterval(poll);
    clearInterval(heartbeat);
  };
  response.once("close", cleanup);
  response.once("finish", cleanup);
}

export function createToolQuestWebServer(
  options: ToolQuestWebServerOptions = {}
): ReturnType<typeof createServer> {
  const mode = options.mode ?? "observer";
  const service = options.service ?? createDefaultRunService(
    mode === "playground"
      ? {
          stateDirectory: process.env.TOOLQUEST_STATE_DIR ??
            resolve(process.cwd(), ".toolquest", "playground-state"),
          traceDirectory: resolve(process.cwd(), ".toolquest", "playground-runs")
        }
      : {}
  );
  const playgroundService = supportsPlayground(service) ? service : undefined;
  if (mode === "playground" && playgroundService === undefined) {
    throw new Error("Playground mode requires a game command service.");
  }
  const staticDirectory =
    options.staticDirectory ?? fileURLToPath(new URL("../../web", import.meta.url));
  const csrfToken = options.csrfToken ?? randomUUID();
  const eventPollIntervalMs =
    options.eventPollIntervalMs ?? DEFAULT_EVENT_POLL_INTERVAL_MS;
  if (!Number.isFinite(eventPollIntervalMs) || eventPollIntervalMs < 5) {
    throw new Error("Event polling interval must be at least 5 milliseconds.");
  }

  return createServer(async (request, response) => {
    applySecurityHeaders(response);
    if (!isLocalRequest(request)) {
      sendJson(response, 403, {
        ok: false, code: "FOREIGN_ORIGIN", message: "Use the local ToolQuest origin."
      });
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        sendJson(response, 200, {
          ok: true,
          mode,
          capabilities: {
            liveEvents: true,
            playground: mode === "playground"
          },
          ...(mode === "playground" ? { csrfToken } : {}),
          rooms: service.listRooms().data.rooms,
          runs: service.listRuns({ limit: 100 }).data.runs
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/runs") {
        const input = ListRunsInputSchema.parse({
          ...(url.searchParams.has("status")
            ? { status: url.searchParams.get("status") }
            : {}),
          ...(url.searchParams.has("limit")
            ? { limit: Number(url.searchParams.get("limit")) }
            : {})
        });
        sendJson(response, 200, service.listRuns(input));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runs") {
        if (!requirePlayground(response, mode)) return;
        if (playgroundService === undefined) {
          throw new Error("PLAYGROUND_SERVICE_UNAVAILABLE");
        }
        if (!requireToken(request, response, csrfToken)) return;
        const input = StartRunInputSchema.parse(await readJson(request));
        sendJson(response, 201, playgroundService.startRun({
          ...input,
          agent: { name: "Human Playground", framework: "browser" },
          label: input.label ?? "manual-baseline"
        }));
        return;
      }

      const runRoute = url.pathname.match(
        /^\/api\/runs\/(run_[a-zA-Z0-9-]+)(?:\/(look|inspect|move|use|submit|timeline|replay|report|events|observation))?$/
      );
      if (runRoute !== null) {
        const runId = runRoute[1];
        const action = runRoute[2];
        if (runId === undefined) {
          throw new Error("INVALID_RUN_ID");
        }
        if (request.method === "GET" && action === undefined) {
          sendJson(response, 200, service.getRun(runId));
          return;
        }
        if (request.method === "GET" && action === "timeline") {
          sendJson(response, 200, service.getRunTimeline(runId));
          return;
        }
        if (request.method === "GET" && action === "observation") {
          sendJson(response, 200, service.getRunObservation(runId));
          return;
        }
        if (request.method === "GET" && action === "replay") {
          sendJson(response, 200, service.replayRun(runId));
          return;
        }
        if (request.method === "GET" && action === "report") {
          sendJson(response, 200, service.exportReport(runId));
          return;
        }
        if (request.method === "GET" && action === "events") {
          streamRunEvents(
            response,
            service,
            runId,
            eventCursor(request, url),
            eventPollIntervalMs
          );
          return;
        }
        if (request.method === "POST" && action !== undefined) {
          if (!requirePlayground(response, mode)) return;
          if (playgroundService === undefined) {
            throw new Error("PLAYGROUND_SERVICE_UNAVAILABLE");
          }
          if (!requireToken(request, response, csrfToken)) return;
          const body = withRunId(await readJson(request), runId);
          const result = (() => {
            switch (action) {
              case "look":
                return playgroundService.look(LookInputSchema.parse(body).runId);
              case "inspect":
                return playgroundService.inspect(InspectInputSchema.parse(body));
              case "move":
                return playgroundService.move(MoveInputSchema.parse(body));
              case "use":
                return playgroundService.use(UseInputSchema.parse(body));
              case "submit":
                return playgroundService.submit(SubmitInputSchema.parse(body));
              default:
                throw new Error("METHOD_NOT_ALLOWED");
            }
          })();
          sendJson(response, 200, result);
          return;
        }
      }

      if (request.method === "GET" && ["/", "/index.html", "/observer.html"].includes(url.pathname)) {
        serveAsset(response, staticDirectory, "observer.html");
        return;
      }
      if (request.method === "GET" && url.pathname === "/playground") {
        serveAsset(response, staticDirectory, "index.html");
        return;
      }
      if (request.method === "GET" && url.pathname === "/observer.css") {
        serveAsset(response, staticDirectory, "observer.css");
        return;
      }
      if (request.method === "GET" && url.pathname === "/observer.js") {
        serveAsset(response, staticDirectory, "observer.js");
        return;
      }
      if (request.method === "GET" && url.pathname === "/styles.css") {
        serveAsset(response, staticDirectory, "styles.css");
        return;
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        serveAsset(response, staticDirectory, "app.js");
        return;
      }
      if (request.method === "GET" && url.pathname === "/og.jpg") {
        serveAsset(response, staticDirectory, "og.jpg");
        return;
      }

      sendJson(response, 404, { ok: false, code: "NOT_FOUND", message: "Not found." });
    } catch (error) {
      sendError(response, error);
    }
  });
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parsePort(process.env.TOOLQUEST_WEB_PORT);
  const mode: ToolQuestWebMode = process.argv.includes("--playground")
    ? "playground"
    : "observer";
  const server = createToolQuestWebServer({ mode });
  server.listen(port, "127.0.0.1", () => {
    console.log(`ToolQuest ${mode} is ready at http://127.0.0.1:${port}`);
  });
}
