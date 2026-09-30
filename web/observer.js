const $ = (selector) => document.querySelector(selector);

const state = {
  rooms: [],
  runs: [],
  selectedRunId: null,
  current: null,
  timeline: [],
  eventSource: null,
  refreshTimer: null,
  eventRefreshTimer: null,
  generation: 0,
  detailsPromise: null,
  listPromise: null,
  listSignature: "",
  renderedRunId: null,
  renderedEvents: 0,
  verifications: new Map(),
  verifyingRunId: null,
  bootstrapPromise: null,
  bootstrapped: false
};

const roomNames = {
  "the-vault": "静默金库",
  "signal-station": "失联信号站"
};

const toolLabels = {
  start_run: "START",
  look: "LOOK",
  inspect: "INSPECT",
  move: "MOVE",
  use: "USE",
  submit: "SUBMIT"
};

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

async function api(path) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" }, signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "无法读取运行数据");
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function statusLabel(status) {
  return { active: "进行中", solved: "已完成", failed: "未通过" }[status] ?? "未知";
}

function roomLabel(room) {
  return roomNames[room?.id] ?? room?.title ?? "未知任务";
}

function agentLabel(run) {
  if (!run?.agent) return "Agent 信息未记录";
  return [run.agent.name, run.agent.model].filter(Boolean).join(" · ");
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0s";
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function timelineDuration(events) {
  if (events.length < 2) return 0;
  const first = Date.parse(events[0].at);
  const last = Date.parse(events.at(-1).at);
  return Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, last - first) : 0;
}

function pretty(value) {
  if (value === undefined || value === null) return "—";
  const keys = typeof value === "object" ? Object.keys(value) : [];
  if (keys.length === 0) return "{}";
  return JSON.stringify(value, null, 2);
}

function renderMetrics() {
  const terminal = state.runs.filter((run) => run.status !== "active");
  const solved = terminal.filter((run) => run.status === "solved");
  const scored = terminal.filter((run) => Number.isFinite(run.score?.total));
  const average = scored.length
    ? Math.round(scored.reduce((sum, run) => sum + run.score.total, 0) / scored.length)
    : null;
  $("#metric-total").textContent = String(state.runs.length);
  $("#metric-active").textContent = String(state.runs.filter((run) => run.status === "active").length);
  $("#metric-pass").textContent = terminal.length ? `${Math.round((solved.length / terminal.length) * 100)}%` : "—";
  $("#metric-score").textContent = average === null ? "—" : String(average);
}

function filteredRuns() {
  const filter = $("#status-filter").value;
  return filter === "all" ? state.runs : state.runs.filter((run) => run.status === filter);
}

function renderRunList() {
  const runs = filteredRuns();
  const signature = JSON.stringify([runs, state.selectedRunId]);
  if (state.listSignature === signature) return;
  state.listSignature = signature;
  const focusedRun = document.activeElement?.dataset?.runId;
  $("#run-count").textContent = String(runs.length);
  $("#run-list-empty").hidden = runs.length > 0;
  const nodes = runs.map((run) => {
    const button = element("button", "run-button");
    button.type = "button";
    button.dataset.runId = run.runId;
    button.setAttribute("aria-current", String(run.runId === state.selectedRunId));
    const top = element("span", "run-button-top");
    top.append(
      element("strong", "", roomLabel(run.room)),
      element("span", `mini-status ${run.status}`, statusLabel(run.status))
    );
    const meta = element("span", "run-button-meta");
    meta.append(
      element("span", "run-button-agent", agentLabel(run)),
      element("span", "", `#${run.eventSeq}`)
    );
    button.append(top, element("small", "", run.runId), meta);
    button.addEventListener("click", () => selectRun(run.runId));
    const item = element("div");
    item.setAttribute("role", "listitem");
    item.append(button);
    return item;
  });
  $("#run-list").replaceChildren(...nodes);
  if (focusedRun) {
    [...$("#run-list").querySelectorAll("button")].find(
      (button) => button.dataset.runId === focusedRun
    )?.focus();
  }
}

function setStreamStatus(mode, text) {
  const status = $("#stream-status");
  status.className = `stream-status ${mode}`;
  status.querySelector("strong").textContent = text;
}

function renderScore(score) {
  $("#score-total").textContent = score ? String(score.total) : "—";
  if (!score) {
    $("#score-bars").replaceChildren(element("p", "", "运行结束后生成评分。"));
    return;
  }
  const dimensions = [
    ["完成", "completion", 50],
    ["安全", "safety", 20],
    ["效率", "efficiency", 15],
    ["恢复", "recovery", 15]
  ];
  const rows = dimensions.map(([label, key, maximum]) => {
    const row = element("div", "score-row");
    const track = element("progress", "score-track");
    track.max = maximum;
    track.value = Math.max(0, Math.min(maximum, score[key]));
    track.setAttribute("aria-label", label);
    row.append(element("span", "", label), track, element("span", "", String(score[key])));
    return row;
  });
  $("#score-bars").replaceChildren(...rows);
}

function renderWorld(snapshot) {
  $("#world-location").textContent = snapshot?.location?.name ?? snapshot?.location?.id ?? "—";
  $("#world-description").textContent = snapshot?.location?.description ?? "暂无公开环境描述。";
  $("#attempts-label").textContent = `剩余尝试 ${snapshot?.attemptsRemaining ?? "—"}`;
  const inventory = Array.isArray(snapshot?.inventory) ? snapshot.inventory : [];
  const chips = inventory.length
    ? inventory.map((item) => element("span", "", item.name ?? item.id ?? String(item)))
    : [element("span", "", "空")];
  $("#world-inventory").replaceChildren(...chips);
}

function renderTimeline() {
  $("#trace-summary").textContent = `${state.timeline.length} 个已记录事件`;
  if (state.renderedRunId !== state.selectedRunId ||
      state.renderedEvents > state.timeline.length) {
    $("#timeline").replaceChildren();
    state.renderedRunId = state.selectedRunId;
    state.renderedEvents = 0;
  }
  const offset = state.renderedEvents;
  const nodes = state.timeline.slice(offset).map((event, relativeIndex) => {
    const index = offset + relativeIndex;
    const article = element("article", `event-card ${event.outcome}`);
    const details = element("details");
    if (index === state.timeline.length - 1) details.open = true;
    const summary = element("summary");
    summary.append(
      element("span", "event-seq", `#${String(event.eventSeq).padStart(2, "0")}`),
      element("span", "event-tool", toolLabels[event.tool] ?? event.tool),
      element("span", "event-message", event.message),
      element("time", "event-time", new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false }))
    );
    const body = element("div", "event-detail");
    const grid = element("div", "event-detail-grid");
    const input = element("div");
    input.append(element("span", "", "公开输入"), element("pre", "", pretty(event.input)));
    const output = element("div");
    output.append(element("span", "", "环境输出"), element("pre", "", pretty(event.data)));
    grid.append(input, output);
    const facts = element("div", "event-facts");
    const previous = state.timeline[index - 1];
    const gap = previous ? Math.max(0, Date.parse(event.at) - Date.parse(previous.at)) : 0;
    facts.append(
      element("span", "", `结果 ${event.outcome}`),
      element("span", "", `状态版本 ${event.stateVersion}`),
      element("span", "", `间隔 ${formatDuration(gap)}`),
      element("span", "", `哈希 ${event.stateHash}`)
    );
    body.append(grid, facts);
    details.append(summary, body);
    article.append(details);
    return article;
  });
  $("#timeline").append(...nodes);
  state.renderedEvents = state.timeline.length;
}

function renderRun() {
  const run = state.current;
  if (!run) {
    $("#workspace-empty").hidden = false;
    $("#run-detail").hidden = true;
    $("#verify-button").disabled = true;
    $("#report-button").disabled = true;
    $("#agent-name").textContent = "尚未选择";
    $("#agent-model").textContent = "—";
    $("#agent-provider").textContent = "—";
    $("#run-label").textContent = "—";
    renderScore(null);
    renderVerification();
    return;
  }
  const room = run.data.room;
  const agent = run.data.agent;
  $("#workspace-empty").hidden = true;
  $("#run-detail").hidden = false;
  $("#run-id").textContent = run.runId;
  $("#run-title").textContent = roomLabel(room);
  $("#run-agent").textContent = agent ? `${agent.name}${agent.model ? ` · ${agent.model}` : ""}` : "Agent 信息未记录";
  const status = $("#run-status");
  status.className = `status-badge ${run.status}`;
  status.textContent = statusLabel(run.status);
  $("#run-events").textContent = String(run.eventSeq);
  $("#run-version").textContent = String(run.stateVersion);
  $("#run-duration").textContent = formatDuration(timelineDuration(state.timeline));
  $("#run-hash").textContent = run.stateHash;
  renderWorld(run.data.snapshot);
  renderTimeline();
  $("#agent-name").textContent = agent?.name ?? "未记录 Agent";
  $("#agent-model").textContent = agent?.model ?? "—";
  $("#agent-provider").textContent = agent?.provider ?? "—";
  $("#run-label").textContent = run.data.label ?? "—";
  renderScore(run.score);
  $("#verify-button").disabled = state.verifyingRunId === run.runId;
  $("#report-button").disabled = false;
  renderVerification();
}

function renderVerification() {
  const saved = state.verifications.get(state.selectedRunId);
  $("#replay-status").textContent = saved
    ? (saved.replay.valid ? "验证通过" : "发现不一致")
    : "尚未验证";
  $("#replay-detail").textContent = saved
    ? "已验证至事件 #" + saved.eventSeq + "，" + saved.replay.verifiedEvents +
      "/" + saved.replay.totalEvents + " 个事件一致。" +
      (saved.eventSeq < (state.current?.eventSeq ?? 0) ? "已有新事件，请重新验证。" : "")
    : "选择运行后，重建公开事件并验证最终状态。";
}

async function loadSelectedRun() {
  if (!state.selectedRunId) return false;
  if (state.detailsPromise) return state.detailsPromise;
  const runId = state.selectedRunId;
  const generation = state.generation;
  const pending = (async () => {
    try {
      const run = await api("/api/runs/" + runId + "/observation");
      if (generation !== state.generation || runId !== state.selectedRunId) return false;
      if (run.runId !== runId || run.eventSeq < (state.current?.eventSeq ?? 0)) return false;
      state.current = run;
      state.timeline = run.data.timeline;
      renderRun();
      $("#event-announcement").textContent = "运行 " + runId +
        "，已记录 " + run.eventSeq + " 个事件，" + statusLabel(run.status);
      return true;
    } catch (error) {
      if (generation === state.generation) {
        showToast(error instanceof Error ? error.message : "无法读取运行");
      }
      return false;
    }
  })();
  state.detailsPromise = pending;
  try {
    return await pending;
  } finally {
    if (state.detailsPromise === pending) state.detailsPromise = null;
  }
}

function closeEventSource() {
  state.eventSource?.close();
  state.eventSource = null;
  window.clearTimeout(state.eventRefreshTimer);
  state.eventRefreshTimer = null;
}

function connectRunEvents() {
  closeEventSource();
  if (!state.selectedRunId) return;
  if (typeof EventSource === "undefined") {
    setStreamStatus("live", "快照轮询模式");
    return;
  }
  const runId = state.selectedRunId;
  const generation = state.generation;
  setStreamStatus("connecting", "正在连接事件流");
  const after = state.timeline.at(-1)?.eventSeq ?? 0;
  const source = new EventSource(`/api/runs/${state.selectedRunId}/events?after=${after}`);
  state.eventSource = source;
  const isCurrent = () => state.eventSource === source &&
    state.selectedRunId === runId && state.generation === generation;
  source.addEventListener("open", () => {
    if (isCurrent()) setStreamStatus("live", "事件流已连接");
  });
  source.addEventListener("run_event", (message) => {
    if (!isCurrent()) return;
    try {
      const event = JSON.parse(message.data);
      if (event.runId !== runId) return;
      setStreamStatus("live", "事件流已连接");
      if (event.eventSeq <= (state.current?.eventSeq ?? 0)) return;
      if (state.eventRefreshTimer !== null) return;
      state.eventRefreshTimer = window.setTimeout(async () => {
        state.eventRefreshTimer = null;
        if (!isCurrent()) return;
        await loadSelectedRun();
        if (isCurrent()) await refreshRuns(true);
      }, 50);
    } catch {
      setStreamStatus("offline", "事件解析失败，正在恢复快照");
    }
  });
  source.addEventListener("observer_error", () => {
    if (isCurrent()) setStreamStatus("offline", "运行暂不可用，正在重试读取");
  });
  source.addEventListener("error", () => {
    if (isCurrent()) setStreamStatus("offline", "事件流正在重连");
  });
}

async function selectRun(runId) {
  if (runId === state.selectedRunId && state.current) return;
  closeEventSource();
  const generation = ++state.generation;
  state.selectedRunId = runId;
  state.current = null;
  state.timeline = [];
  state.detailsPromise = null;
  state.verifyingRunId = null;
  history.replaceState(null, "", `#run=${runId}`);
  renderRunList();
  renderRun();
  setStreamStatus("connecting", "正在读取运行");
  const loaded = await loadSelectedRun();
  if (generation === state.generation && loaded) connectRunEvents();
}

async function refreshRuns(silent = false) {
  if (!state.bootstrapped) return bootstrap();
  if (state.listPromise) return state.listPromise;
  const pending = refreshRunList(silent);
  state.listPromise = pending;
  try {
    return await pending;
  } finally {
    if (state.listPromise === pending) state.listPromise = null;
  }
}

async function refreshRunList(silent) {
  try {
    const result = await api("/api/runs?limit=100");
    state.runs = result.data.runs;
    renderMetrics();
    renderRunList();
    if (!state.selectedRunId && state.runs.length) {
      const hashRun = location.hash.match(/^#run=(run_[a-zA-Z0-9-]+)$/)?.[1];
      await selectRun(state.runs.some((run) => run.runId === hashRun) ? hashRun : state.runs[0].runId);
      return;
    }
    const selected = state.runs.find((run) => run.runId === state.selectedRunId);
    if (state.selectedRunId && (!silent || !state.current ||
        (selected && selected.eventSeq > state.current.eventSeq))) {
      const loaded = await loadSelectedRun();
      if (loaded && !state.eventSource) connectRunEvents();
    }
    if (!state.selectedRunId) setStreamStatus("live", "正在监听新运行");
    else if (state.eventSource?.readyState === 1) setStreamStatus("live", "事件流已连接");
    else if (!state.eventSource && state.current) setStreamStatus("live", "快照轮询模式");
    else if (state.eventSource) setStreamStatus("connecting", "事件流正在重连");
    if (!silent) showToast("运行列表已刷新");
  } catch (error) {
    setStreamStatus("offline", "无法读取运行目录");
    if (!silent) showToast(error instanceof Error ? error.message : "刷新失败");
  }
}

async function verifyRun() {
  if (!state.current) return;
  const runId = state.selectedRunId;
  const generation = state.generation;
  state.verifyingRunId = runId;
  const button = $("#verify-button");
  button.disabled = true;
  try {
    const result = await api("/api/runs/" + runId + "/replay");
    if (generation !== state.generation || state.selectedRunId !== runId) return;
    const replay = result.data.replay;
    state.verifications.set(runId, { eventSeq: result.eventSeq, replay });
    renderVerification();
  } catch (error) {
    if (generation === state.generation) showToast(error instanceof Error ? error.message : "验证失败");
  } finally {
    if (generation === state.generation) {
      state.verifyingRunId = null;
      button.disabled = !state.current;
    }
  }
}

async function downloadReport() {
  if (!state.current) return;
  const runId = state.selectedRunId;
  const generation = state.generation;
  try {
    const result = await api("/api/runs/" + runId + "/report");
    if (generation !== state.generation) return;
    const blob = new Blob([result.data.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.fileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast("评测报告已生成");
  } catch (error) {
    if (generation === state.generation) showToast(error instanceof Error ? error.message : "报告生成失败");
  }
}

async function bootstrap() {
  if (state.bootstrapPromise) return state.bootstrapPromise;
  const pending = loadBootstrap();
  state.bootstrapPromise = pending;
  try {
    return await pending;
  } finally {
    if (state.bootstrapPromise === pending) state.bootstrapPromise = null;
  }
}

async function loadBootstrap() {
  try {
    const result = await api("/api/bootstrap");
    state.rooms = result.rooms;
    state.runs = result.runs;
    state.bootstrapped = true;
    $("#playground-link").hidden = result.capabilities?.playground !== true;
    renderMetrics();
    renderRunList();
    if (state.runs.length) {
      const hashRun = location.hash.match(/^#run=(run_[a-zA-Z0-9-]+)$/)?.[1];
      await selectRun(state.runs.some((run) => run.runId === hashRun) ? hashRun : state.runs[0].runId);
    } else {
      setStreamStatus("live", "正在监听新运行");
    }
  } catch (error) {
    setStreamStatus("offline", "观察服务不可用");
    showToast(error instanceof Error ? error.message : "观察服务不可用");
  }
}

$("#status-filter").addEventListener("change", renderRunList);
$("#refresh-button").addEventListener("click", () => refreshRuns(false));
$("#verify-button").addEventListener("click", verifyRun);
$("#report-button").addEventListener("click", downloadReport);
window.addEventListener("beforeunload", () => {
  closeEventSource();
  window.clearInterval(state.refreshTimer);
});

bootstrap();
state.refreshTimer = window.setInterval(() => refreshRuns(true), 1500);
