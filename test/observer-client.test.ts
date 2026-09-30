import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent, ToolQuestSuccess } from "../src/domain/types.js";
import { createTestHarness } from "./helpers.js";

// Logic-only harness: no browser, layout engine or external DOM dependency.
class NodeStub {
  public children: NodeStub[] = [];
  public dataset: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public classList = { add: vi.fn(), remove: vi.fn() };
  public textContent = "";
  public className = "";
  public hidden = false;
  public disabled = false;
  public value: string | number = "all";
  public open = false;
  public max = 0;
  public focus = vi.fn();
  public addEventListener = vi.fn();
  public constructor(public tag = "div") {}
  public append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  public replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  public setAttribute(name: string, value: string) { this.attributes[name] = value; }
  public querySelectorAll(tag: string): NodeStub[] {
    return this.children.flatMap((node) => [
      ...(node.tag === tag ? [node] : []), ...node.querySelectorAll(tag)
    ]);
  }
  public querySelector(tag: string) { return this.querySelectorAll(tag)[0]; }
}

class SourceStub {
  public closed = false;
  public readyState = 1;
  public listeners = new Map<string, (event: { data: string }) => void>();
  public constructor(public url: string) {}
  public addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  public close() { this.closed = true; this.readyState = 2; }
  public emit(name: string, data: unknown = {}) {
    this.listeners.get(name)?.({ data: JSON.stringify(data) });
  }
}

interface ObserverApp {
  state: {
    selectedRunId: string | null;
    current: ToolQuestSuccess | null;
    timeline: GameEvent[];
    verifications: Map<string, { eventSeq: number }>;
    bootstrapped: boolean;
  };
  bootstrap(): Promise<void>;
  selectRun(runId: string): Promise<void>;
  loadSelectedRun(): Promise<boolean>;
  refreshRuns(silent?: boolean): Promise<void>;
  verifyRun(): Promise<void>;
  downloadReport(): Promise<void>;
  renderRunList(): void;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

function setup(initial?: Promise<Response>) {
  const html = readFileSync(new URL("../web/observer.html", import.meta.url), "utf8");
  const nodes = new Map<string, NodeStub>();
  for (const match of html.matchAll(/id="([^"]+)"/g)) {
    nodes.set("#" + match[1], new NodeStub());
  }
  nodes.get("#stream-status")!.append(new NodeStub("strong"));
  const sources: SourceStub[] = [];
  const fetch = vi.fn<(path: string, options: { signal: AbortSignal }) => Promise<Response>>(
    () => Promise.resolve(json({ rooms: [], runs: [], capabilities: {} }))
  );
  if (initial) fetch.mockImplementationOnce(() => initial);
  const createObjectURL = vi.fn(() => "blob:test");
  const context = createContext({
    document: {
      querySelector: (selector: string) => {
        if (!nodes.has(selector)) throw new Error("Unknown selector " + selector);
        return nodes.get(selector);
      },
      createElement: (tag: string) => new NodeStub(tag),
      activeElement: null
    },
    fetch, AbortController, Blob, Error,
    URL: { createObjectURL, revokeObjectURL: vi.fn() },
    history: { replaceState: vi.fn() },
    location: { hash: "" },
    window: {
      setTimeout, clearTimeout, setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(), addEventListener: vi.fn()
    },
    EventSource: class extends SourceStub {
      constructor(url: string) { super(url); sources.push(this); }
    }
  });
  const script = readFileSync(new URL("../web/observer.js", import.meta.url), "utf8");
  const app = runInContext(script + "\n({state, bootstrap, selectRun, loadSelectedRun, refreshRuns, verifyRun, downloadReport, renderRunList})", context) as ObserverApp;
  return { app, fetch, nodes, sources, createObjectURL };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("observer client asynchronous state", () => {
  it("single-flights slow bootstrap requests and retries failed startup", async () => {
    const initial = deferred<Response>();
    const { app, fetch } = setup(initial.promise);
    const refresh1 = app.refreshRuns(true);
    const refresh2 = app.refreshRuns(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    initial.resolve(new Response("{}", { status: 503 }));
    await Promise.all([refresh1, refresh2]);
    expect(app.state.bootstrapped).toBe(false);
    await app.refreshRuns(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(app.state.bootstrapped).toBe(true);
  });

  it("times out hung requests so polling can retry", async () => {
    const { app, fetch } = setup(Promise.resolve(new Response("{}", { status: 503 })));
    await app.bootstrap();
    fetch.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("timeout")));
    }));
    const retry = app.refreshRuns(true);
    await vi.advanceTimersByTimeAsync(8001);
    await retry;
    expect(app.state.bootstrapped).toBe(false);
    await app.refreshRuns(true);
    expect(app.state.bootstrapped).toBe(true);
  });

  it("ignores delayed snapshots and old SSE events after a run switch", async () => {
    const { service } = createTestHarness();
    const a = service.startRun({ roomId: "the-vault" });
    const b = service.startRun({ roomId: "signal-station" });
    const { app, fetch, sources } = setup();
    await app.bootstrap();
    fetch.mockResolvedValueOnce(json(service.getRunObservation(a.runId)));
    await app.selectRun(a.runId);
    const sourceA = sources[0]!;
    const lateA = deferred<Response>();
    fetch.mockImplementationOnce(() => lateA.promise);
    const oldLoad = app.loadSelectedRun();
    const pendingB = deferred<Response>();
    fetch.mockImplementationOnce(() => pendingB.promise);
    const selectB = app.selectRun(b.runId);
    expect(sourceA.closed).toBe(true);
    sourceA.emit("run_event", service.look(a.runId).events[0]);
    expect(app.state.timeline).toEqual([]);
    pendingB.resolve(json(service.getRunObservation(b.runId)));
    await selectB;
    lateA.resolve(json(service.getRunObservation(a.runId)));
    await oldLoad;
    await vi.advanceTimersByTimeAsync(100);
    expect(app.state.current?.runId).toBe(b.runId);
    expect(app.state.timeline.every((event) => event.runId === b.runId)).toBe(true);
    expect(sources.at(-1)?.url).toBe("/api/runs/" + b.runId + "/events?after=1");
  });

  it("binds verification and report responses to their originating selection", async () => {
    const { service } = createTestHarness();
    const a = service.startRun({ roomId: "the-vault" });
    const b = service.startRun({ roomId: "signal-station" });
    const { app, fetch, nodes, createObjectURL } = setup();
    await app.bootstrap();
    fetch.mockResolvedValueOnce(json(service.getRunObservation(a.runId)));
    await app.selectRun(a.runId);
    const replay = deferred<Response>();
    const report = deferred<Response>();
    fetch.mockImplementationOnce(() => replay.promise).mockImplementationOnce(() => report.promise);
    const verifying = app.verifyRun();
    const reporting = app.downloadReport();
    fetch.mockResolvedValueOnce(json(service.getRunObservation(b.runId)));
    await app.selectRun(b.runId);
    replay.resolve(json(service.replayRun(a.runId)));
    report.resolve(json(service.exportReport(a.runId)));
    await Promise.all([verifying, reporting]);
    expect(app.state.verifications.has(b.runId)).toBe(false);
    expect(nodes.get("#replay-status")?.textContent).toBe("尚未验证");
    expect(nodes.get("#verify-button")?.disabled).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("preserves expanded events and verification while adding new events", async () => {
    const { service } = createTestHarness();
    const a = service.startRun({ roomId: "the-vault" });
    const { app, fetch, nodes } = setup();
    await app.bootstrap();
    fetch.mockResolvedValueOnce(json(service.getRunObservation(a.runId)));
    await app.selectRun(a.runId);
    const firstDetails = nodes.get("#timeline")!.querySelector("details")!;
    firstDetails.open = false;
    fetch.mockResolvedValueOnce(json(service.replayRun(a.runId)));
    await app.verifyRun();
    service.look(a.runId);
    fetch.mockResolvedValueOnce(json(service.getRunObservation(a.runId)));
    await app.loadSelectedRun();
    expect(nodes.get("#timeline")!.querySelector("details")).toBe(firstDetails);
    expect(firstDetails.open).toBe(false);
    expect(nodes.get("#timeline")!.children).toHaveLength(2);
    expect(nodes.get("#replay-status")?.textContent).toBe("验证通过");
    expect(nodes.get("#replay-detail")?.textContent).toContain("已有新事件");
  });

  it("single-flights list refreshes and restores connection status after recovery", async () => {
    const { service } = createTestHarness();
    const a = service.startRun({ roomId: "the-vault" });
    const { app, fetch, nodes, sources } = setup();
    await app.bootstrap();
    fetch.mockResolvedValueOnce(json(service.getRunObservation(a.runId)));
    await app.selectRun(a.runId);
    sources[0]!.emit("error");
    const pending = deferred<Response>();
    fetch.mockImplementationOnce(() => pending.promise);
    const before = fetch.mock.calls.length;
    const refresh1 = app.refreshRuns(true);
    const refresh2 = app.refreshRuns(true);
    expect(fetch.mock.calls.length).toBe(before + 1);
    pending.resolve(json(service.listRuns({ limit: 100 })));
    await Promise.all([refresh1, refresh2]);
    expect(nodes.get("#stream-status")?.className).toBe("stream-status live");
    const listItem = nodes.get("#run-list")!.children[0]!;
    expect(listItem.attributes["role"]).toBe("listitem");
    expect(listItem.children[0]?.tag).toBe("button");
    const button = listItem.children[0];
    app.renderRunList();
    expect(nodes.get("#run-list")!.children[0]!.children[0]).toBe(button);
  });
});
