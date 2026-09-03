import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  statSync
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { RunService } from "../application/run-service.js";
import { createDefaultRunService } from "../composition.js";
import { isToolQuestError } from "../domain/errors.js";
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

export interface ToolQuestWebServerOptions {
  service?: RunService;
  staticDirectory?: string;
  csrfToken?: string;
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

export function createToolQuestWebServer(
  options: ToolQuestWebServerOptions = {}
): ReturnType<typeof createServer> {
  const service = options.service ?? createDefaultRunService();
  const staticDirectory =
    options.staticDirectory ?? fileURLToPath(new URL("../../web", import.meta.url));
  const csrfToken = options.csrfToken ?? randomUUID();

  return createServer(async (request, response) => {
    applySecurityHeaders(response);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    try {
      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        sendJson(response, 200, {
          ok: true,
          csrfToken,
          rooms: service.listRooms().data.rooms,
          runs: service.listRuns({ limit: 12 }).data.runs
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
        if (!requireToken(request, response, csrfToken)) return;
        const input = StartRunInputSchema.parse(await readJson(request));
        sendJson(response, 201, service.startRun(input));
        return;
      }

      const runRoute = url.pathname.match(
        /^\/api\/runs\/(run_[a-zA-Z0-9-]+)(?:\/(look|inspect|move|use|submit|timeline|replay|report))?$/
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
        if (request.method === "GET" && action === "replay") {
          sendJson(response, 200, service.replayRun(runId));
          return;
        }
        if (request.method === "GET" && action === "report") {
          sendJson(response, 200, service.exportReport(runId));
          return;
        }
        if (request.method === "POST" && action !== undefined) {
          if (!requireToken(request, response, csrfToken)) return;
          const body = withRunId(await readJson(request), runId);
          const result = (() => {
            switch (action) {
              case "look":
                return service.look(LookInputSchema.parse(body).runId);
              case "inspect":
                return service.inspect(InspectInputSchema.parse(body));
              case "move":
                return service.move(MoveInputSchema.parse(body));
              case "use":
                return service.use(UseInputSchema.parse(body));
              case "submit":
                return service.submit(SubmitInputSchema.parse(body));
              default:
                throw new Error("METHOD_NOT_ALLOWED");
            }
          })();
          sendJson(response, 200, result);
          return;
        }
      }

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        serveAsset(response, staticDirectory, "index.html");
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
  const server = createToolQuestWebServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`ToolQuest Web is ready at http://127.0.0.1:${port}`);
  });
}
