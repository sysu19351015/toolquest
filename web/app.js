const $ = (selector) => document.querySelector(selector);
const landingView = $("#landing-view");
const gameView = $("#game-view");
const roomGrid = $("#room-grid");
const roomCount = $("#room-count");
const resumeSection = $("#resume-section");
const runList = $("#run-list");
const toast = $("#toast");

const state = {
  csrfToken: "",
  rooms: [],
  runs: [],
  current: null,
  snapshot: null,
  timeline: [],
  inspection: null
};

const copy = {
  rooms: {
    "the-vault": {
      title: "古老金库",
      introduction: "你被困在一座古老天文台中。找到三位数密码，解开金库大门。"
    },
    "signal-station": {
      title: "风暴信号站",
      introduction: "暴风雨让远方的信号站陷入沉寂。恢复电力、校准天线并发送三位数紧急代码。"
    }
  },
  locations: {
    foyer: ["天文台前厅", "冰冷星光落在石碑上，一条通道向东延伸。"],
    gallery: ["月相长廊", "银色月相图下放着一把黄铜钥匙，通道向西和向北延伸。"],
    vault: ["金库前室", "北墙被带数字转盘的金库门占据，南面通往月相长廊。"],
    entry_hall: ["信号站门厅", "雨点敲打百叶窗，褪色的求救告示挂在工坊与控制室门旁。"],
    workshop: ["维修工坊", "墙边堆满无线电零件，工作台上放着频率表和陶瓷保险丝。"],
    control_room: ["控制室", "失去电力的仪表围绕着断路器面板，楼梯通向屋顶天线。"],
    rooftop: ["屋顶天线", "狂风掠过平台，天线控制台与发射键盘等待着重新启动。"]
  },
  objects: {
    stone_tablet: ["石碑", "一块布满星形符号的风化石碑。", "仍可辨认的一行写着：“星辰以七开始。”第一位数字是 7。"],
    moon_chart: ["月相图", "绘有一排排银色月亮的图表。", "图上共有三十一轮银月，旁边写着：“让月亮完成密码。”最后两位数字是 31。"],
    brass_key: ["黄铜钥匙", "月相图下的一把小钥匙。", "钥匙上刻着一颗七角星。"],
    vault_door: ["金库门", "带钥匙孔和三位数字转盘的锁门。", "转盘接受三位数字，但必须先用钥匙打开机械锁。"],
    distress_notice: ["求救告示", "一张被雨水浸染的紧急通信告示。", "告示写着：“紧急代码以桅杆上红灯的数量开始：八。”第一位数字是 8。"],
    frequency_chart: ["频率表", "沿海无线电保留频道图表。", "频道 21 被圈出，旁边写着：“所有紧急代码都以救援频道结束。”最后两位数字是 21。"],
    ceramic_fuse: ["陶瓷保险丝", "维修台上一枚完好的保险丝。", "标签显示它与信号站主断路器面板完全匹配。"],
    breaker_panel: ["断路器面板", "主断路器留着一个空保险丝插槽。", "必须安装兼容的陶瓷保险丝，信号站才能为天线供电。"],
    antenna_console: ["天线控制台", "发射键盘旁的校准转轮。", "只有恢复信号站电力后，才能运行天线校准程序。"]
  },
  interactions: {
    take_brass_key: ["拿起黄铜钥匙", "把钥匙放进随身物品。"],
    unlock_vault: ["打开金库机械锁", "把黄铜钥匙插入金库门。"],
    take_ceramic_fuse: ["拿起陶瓷保险丝", "把完好的保险丝放进随身物品。"],
    restore_station_power: ["恢复信号站电力", "把陶瓷保险丝装进断路器面板。"],
    calibrate_antenna: ["校准天线", "运行已通电的天线校准程序。"]
  },
  items: {
    brass_key: ["黄铜钥匙", "刻有七角星的小钥匙。"],
    ceramic_fuse: ["陶瓷保险丝", "适用于主断路器的高压保险丝。"]
  }
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function difficultyLabel(value) {
  return { starter: "入门", intermediate: "进阶", advanced: "高阶" }[value] ?? value;
}

function statusLabel(value) {
  return { active: "进行中", solved: "成功逃脱", failed: "挑战失败" }[value] ?? value;
}

function roomText(roomId, field, fallback) {
  return copy.rooms[roomId]?.[field] ?? fallback;
}

function tupleText(group, id, index, fallback) {
  return copy[group][id]?.[index] ?? fallback;
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}) };
  if (options.method === "POST") headers["X-ToolQuest-Token"] = state.csrfToken;
  const response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "请求失败，请稍后重试");
  return result;
}

function actionId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}:${suffix}`;
}

function createRoomCard(room, index) {
  const article = element("article", "room-card");
  article.dataset.index = String(index + 1).padStart(2, "0");
  const meta = element("div", "room-meta");
  meta.append(element("span", "", `ROOM ${article.dataset.index}`), element("span", "difficulty", difficultyLabel(room.difficulty)));
  const title = element("h3", "", roomText(room.id, "title", room.title));
  const intro = element("p", "", roomText(room.id, "introduction", room.introduction));
  const actions = element("div", "room-actions");
  const par = element("span", "par", `标准动作 ${room.parActions}`);
  const button = element("button", "primary-button", "开始挑战 →");
  button.type = "button";
  button.addEventListener("click", () => startRun(room, button));
  actions.append(par, button);
  article.append(meta, title, intro, actions);
  return article;
}

function renderRooms() {
  roomCount.textContent = `${state.rooms.length} 个房间可用`;
  roomGrid.replaceChildren(...state.rooms.map(createRoomCard));
}

function renderRuns() {
  resumeSection.hidden = state.runs.length === 0;
  if (state.runs.length === 0) return;
  runList.replaceChildren(
    ...state.runs.slice(0, 6).map((run) => {
      const item = element("article", "run-item");
      const summary = element("div");
      summary.append(
        element("strong", "", roomText(run.room.id, "title", run.room.title)),
        element("span", "", `${statusLabel(run.status)} · ${new Date(run.startedAt).toLocaleString("zh-CN")}`)
      );
      const button = element("button", "ghost-button", run.status === "active" ? "继续 →" : "查看结果 →");
      button.type = "button";
      button.addEventListener("click", () => openRun(run.runId));
      item.append(summary, button);
      return item;
    })
  );
}

async function startRun(room, button) {
  button.disabled = true;
  button.textContent = "正在开启…";
  try {
    const result = await api("/api/runs", {
      method: "POST",
      body: JSON.stringify({ roomId: room.id })
    });
    await openRun(result.runId);
    showToast(`${roomText(room.id, "title", room.title)} 已开启，记录保存在本机`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法开始挑战");
  } finally {
    button.disabled = false;
    button.textContent = "开始挑战 →";
  }
}

async function refreshTimeline() {
  const result = await api(`/api/runs/${state.current.runId}/timeline`);
  state.timeline = result.data.timeline;
  renderTimeline();
}

async function openRun(runId) {
  try {
    const [run, timeline] = await Promise.all([
      api(`/api/runs/${runId}`),
      api(`/api/runs/${runId}/timeline`)
    ]);
    state.current = run;
    state.snapshot = run.data.snapshot;
    state.timeline = timeline.data.timeline;
    state.inspection = null;
    landingView.hidden = true;
    gameView.hidden = false;
    history.replaceState(null, "", `#run=${runId}`);
    renderGame();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法恢复运行");
  }
}

function leaveRun() {
  state.current = null;
  state.snapshot = null;
  state.inspection = null;
  gameView.hidden = true;
  landingView.hidden = false;
  history.replaceState(null, "", location.pathname);
  bootstrap();
}

function updateCurrent(result, snapshot) {
  state.current = { ...state.current, ...result };
  if (snapshot) state.snapshot = snapshot;
}

function feedbackMessage(result) {
  const event = result.events?.[0];
  const reason = result.data?.reason;
  if (result.data?.correct === true) return "密码正确，出口已经打开。你成功逃脱了！";
  if (reason === "WRONG_LOCATION") return "这里还不能提交答案，请先前往最终机关。";
  if (reason === "PRECONDITION_NOT_MET") return "还有前置机关没有完成。继续调查环境。";
  if (reason === "WRONG_ITEM") return "这个物品无法完成该操作。";
  if (reason === "ITEM_MISSING") return "你还没有拿到操作所需的物品。";
  if (event?.tool === "move") return `已前往${tupleText("locations", result.data?.destination?.id, 0, result.data?.destination?.name ?? "新区域")}。`;
  if (event?.tool === "use" && result.data?.applied) return "操作成功，房间状态已经改变。";
  if (event?.tool === "inspect") return "线索已加入调查笔记。";
  if (event?.tool === "look") return "你重新观察了当前环境。";
  return result.message;
}

function showFeedback(result) {
  const box = $("#event-feedback");
  box.hidden = false;
  box.className = `event-feedback ${result.events?.[0]?.outcome === "world_failure" ? "warning" : "success"}`;
  box.textContent = feedbackMessage(result);
}

async function perform(action, payload, button) {
  if (!state.current || state.current.status !== "active") return;
  if (button) button.disabled = true;
  try {
    const result = await api(`/api/runs/${state.current.runId}/${action}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showFeedback(result);
    if (action === "look") {
      updateCurrent(result, result.data);
      renderGame();
      await refreshTimeline();
    } else {
      await openRun(state.current.runId);
      if (result.events?.[0]?.outcome === "world_failure") showFeedback(result);
    }
    return result;
  } catch (error) {
    showToast(error instanceof Error ? error.message : "操作失败");
  } finally {
    if (button) button.disabled = false;
  }
}

async function inspectObject(targetId, button) {
  if (button) button.disabled = true;
  try {
    const result = await api(`/api/runs/${state.current.runId}/inspect`, {
      method: "POST",
      body: JSON.stringify({ targetId })
    });
    state.inspection = result.data;
    updateCurrent(result);
    renderInspection();
    showFeedback(result);
    await refreshTimeline();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法检查该对象");
  } finally {
    if (button) button.disabled = false;
  }
}

function renderGame() {
  const snapshot = state.snapshot;
  if (!state.current || !snapshot) return;
  const room = state.current.data.room;
  const locationData = snapshot.location;
  const roomDefinition = state.rooms.find((candidate) => candidate.id === room.id);
  $("#game-room-title").textContent = roomText(room.id, "title", room.title);
  $("#game-status").textContent = statusLabel(state.current.status);
  $("#game-status").className = `status-pill ${state.current.status}`;
  $("#location-name").textContent = tupleText("locations", locationData.id, 0, locationData.name);
  $("#location-description").textContent = tupleText("locations", locationData.id, 1, locationData.description);
  $("#location-number").textContent = String(Object.keys(copy.locations).indexOf(locationData.id) + 1).padStart(2, "0");
  $("#state-version").textContent = String(state.current.stateVersion);
  $("#attempts-left").textContent = String(snapshot.attemptsRemaining);
  $("#event-count").textContent = String(state.current.eventSeq);
  $("#object-count").textContent = String(snapshot.objects.length);
  $("#exit-count").textContent = String(snapshot.exits.length);

  const objectNodes = snapshot.objects.map((object) => {
    const button = element("button", "object-card");
    button.type = "button";
    button.append(
      element("span", "object-symbol", "◇"),
      element("strong", "", tupleText("objects", object.id, 0, object.name)),
      element("small", "", tupleText("objects", object.id, 1, object.description))
    );
    button.disabled = state.current.status !== "active";
    button.addEventListener("click", () => inspectObject(object.id, button));
    return button;
  });
  $("#object-list").replaceChildren(...objectNodes);

  const exitNodes = snapshot.exits.map((exit) => {
    const button = element("button", "exit-button");
    button.type = "button";
    button.append(
      element("span", "", tupleText("locations", exit.destinationId, 0, exit.label)),
      element("strong", "", "前往 →")
    );
    button.disabled = state.current.status !== "active";
    button.addEventListener("click", () => perform("move", {
      destinationId: exit.destinationId,
      expectedStateVersion: state.current.stateVersion,
      actionId: actionId("move")
    }, button));
    return button;
  });
  $("#exit-list").replaceChildren(...exitNodes);

  const inventory = snapshot.inventory.map((item) => {
    const chip = element("span", "inventory-chip");
    chip.title = tupleText("items", item.id, 1, item.description);
    chip.textContent = tupleText("items", item.id, 0, item.name);
    return chip;
  });
  $("#inventory-list").replaceChildren(...(inventory.length ? inventory : [element("span", "empty-chip", "暂无物品")]));
  $("#look-button").disabled = state.current.status !== "active";
  $("#answer-input").disabled = state.current.status !== "active";
  $("#answer-form").querySelector("button").disabled = state.current.status !== "active";
  renderInspection();
  renderTimeline();
  renderTerminal(roomDefinition);
}

function renderInspection() {
  const empty = $("#inspection-empty");
  const content = $("#inspection-content");
  if (!state.inspection) {
    empty.hidden = false;
    content.hidden = true;
    return;
  }
  const target = state.inspection.target;
  empty.hidden = true;
  content.hidden = false;
  $("#inspection-title").textContent = tupleText("objects", target.id, 0, target.name);
  $("#inspection-details").textContent = tupleText("objects", target.id, 2, target.details);
  const nodes = state.inspection.interactions.map((interaction) => {
    const card = element("div", "interaction-card");
    card.append(
      element("strong", "", tupleText("interactions", interaction.id, 0, interaction.title)),
      element("p", "", tupleText("interactions", interaction.id, 1, interaction.description))
    );
    const requiredItem = interaction.requiredItemId;
    const inventoryHasItem = !requiredItem || state.snapshot.inventory.some((item) => item.id === requiredItem);
    const button = element("button", "secondary-button", inventoryHasItem ? "执行操作" : `需要${tupleText("items", requiredItem, 0, requiredItem)}`);
    button.type = "button";
    button.disabled = !inventoryHasItem || state.current.status !== "active";
    button.addEventListener("click", () => perform("use", {
      interactionId: interaction.id,
      ...(requiredItem ? { itemId: requiredItem } : {}),
      expectedStateVersion: state.current.stateVersion,
      actionId: actionId("use")
    }, button));
    card.append(button);
    return card;
  });
  $("#interaction-list").replaceChildren(...(nodes.length ? nodes : [element("span", "empty-chip", "这里没有可执行操作") ]));
}

function renderTimeline() {
  if (!state.timeline) return;
  const labels = { start_run: "开始挑战", look: "观察环境", inspect: "检查对象", move: "移动", use: "操作机关", submit: "提交答案" };
  $("#timeline-list").replaceChildren(
    ...[...state.timeline].reverse().map((event) => {
      const item = element("article", `timeline-item ${event.outcome}`);
      item.append(
        element("span", "timeline-seq", String(event.eventSeq).padStart(2, "0")),
        element("strong", "", labels[event.tool] ?? event.tool),
        element("p", "", event.outcome === "world_failure" ? "操作未生效，状态保持安全。" : `状态版本 ${event.stateVersion}`),
        element("time", "", new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
      );
      return item;
    })
  );
}

function renderTerminal(room) {
  if (state.current.status === "active") return;
  const box = $("#event-feedback");
  box.hidden = false;
  box.className = `event-feedback terminal ${state.current.status}`;
  const total = state.current.score?.total ?? 0;
  box.replaceChildren(
    element("strong", "", state.current.status === "solved" ? "挑战完成" : "本次挑战结束"),
    element("span", "", state.current.status === "solved" ? `${roomText(room?.id, "title", room?.title ?? "房间")} 已成功破解 · ${total} 分` : "尝试次数已用完，你可以返回并重新开始。")
  );
}

async function verifyRun() {
  try {
    const result = await api(`/api/runs/${state.current.runId}/replay`);
    const replay = result.data.replay;
    showToast(replay.valid ? `验证通过：${replay.verifiedEvents} 个事件完全一致` : `发现 ${replay.mismatches.length} 处不一致`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法验证运行");
  }
}

async function downloadReport() {
  try {
    const result = await api(`/api/runs/${state.current.runId}/report`);
    const blob = new Blob([result.data.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.fileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast("评测报告已生成");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法生成报告");
  }
}

async function bootstrap() {
  try {
    const result = await api("/api/bootstrap");
    state.csrfToken = result.csrfToken;
    state.rooms = result.rooms;
    state.runs = result.runs;
    renderRooms();
    renderRuns();
    const hashRun = location.hash.match(/^#run=(run_[a-zA-Z0-9-]+)$/)?.[1];
    if (hashRun && state.current?.runId !== hashRun) await openRun(hashRun);
  } catch (error) {
    roomCount.textContent = "连接失败";
    const card = element("div", "error-card", `${error instanceof Error ? error.message : "无法加载房间"}，请刷新页面重试。`);
    roomGrid.replaceChildren(card);
  }
}

$("#back-button").addEventListener("click", leaveRun);
$("#look-button").addEventListener("click", (event) => perform("look", {}, event.currentTarget));
$("#verify-button").addEventListener("click", verifyRun);
$("#report-button").addEventListener("click", downloadReport);
$("#answer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#answer-input");
  const answer = input.value.trim();
  if (!answer) return;
  await perform("submit", {
    answer,
    expectedStateVersion: state.current.stateVersion,
    actionId: actionId("submit")
  }, event.submitter);
  input.value = "";
});

bootstrap();
