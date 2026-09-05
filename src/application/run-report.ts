import type { ReplayReport } from "../domain/replay.js";
import type {
  RoomDefinition,
  RunRecord,
  ScoreBreakdown
} from "../domain/types.js";

function cell(value: string): string {
  return inline(value).replaceAll("|", "\\|");
}

function inline(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function durationLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  return minutes + "m " + String(seconds % 60).padStart(2, "0") + "s";
}

export function createRunReport(
  room: RoomDefinition,
  record: RunRecord,
  replay: ReplayReport,
  score?: ScoreBreakdown
): string {
  const startedAt = Date.parse(record.events[0]?.at ?? record.state.startedAt);
  const finishedAt = Date.parse(
    record.events.at(-1)?.at ?? record.state.startedAt
  );
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? Math.max(0, finishedAt - startedAt)
      : 0;
  const successfulEvents = record.events.filter(
    (event) => event.outcome === "success"
  ).length;
  const worldFailures = record.events.length - successfulEvents;
  const toolCalls = new Map<string, number>();
  for (const event of record.events) {
    toolCalls.set(event.tool, (toolCalls.get(event.tool) ?? 0) + 1);
  }
  const lines = [
    "# ToolQuest Run Report",
    "",
    `- Run ID: \`${record.runId}\``,
    `- Room: ${room.title} (\`${room.id}\` v${room.version})`,
    `- Status: ${record.state.status}`,
    `- State version: ${record.stateVersion}`,
    `- Recorded events: ${record.eventSeq}`,
    `- Final state hash: \`${replay.recordedStateHash}\``,
    `- Replay verification: ${replay.valid ? "passed" : "failed"} (${replay.verifiedEvents}/${replay.totalEvents} events)`,
    "",
    "## Agent context",
    "",
    `- Agent: ${record.agent === undefined ? "Not recorded" : inline(record.agent.name)}`,
    `- Model: ${record.agent?.model === undefined ? "Not recorded" : inline(record.agent.model)}`,
    `- Provider: ${record.agent?.provider === undefined ? "Not recorded" : inline(record.agent.provider)}`,
    `- Version: ${record.agent?.version === undefined ? "Not recorded" : inline(record.agent.version)}`,
    `- Framework: ${record.agent?.framework === undefined ? "Not recorded" : inline(record.agent.framework)}`,
    `- Run label: ${record.label === undefined ? "Not recorded" : inline(record.label)}`,
    "",
    "## Run metrics",
    "",
    `- Duration between first and last recorded event: ${durationLabel(durationMs)}`,
    `- Successful events: ${successfulEvents}`,
    `- World failures: ${worldFailures}`,
    `- Tool calls: ${[...toolCalls.entries()]
      .map(([tool, count]) => `${tool}=${count}`)
      .join(", ")}`,
    ""
  ];

  if (score !== undefined) {
    lines.push(
      "## Score",
      "",
      "| Completion | Safety | Efficiency | Recovery | Total |",
      "| ---: | ---: | ---: | ---: | ---: |",
      `| ${score.completion} | ${score.safety} | ${score.efficiency} | ${score.recovery} | ${score.total} |`,
      "",
      "> Room-specific heuristic, not a general Agent ranking. Safety is currently fixed at 20; event spacing is not model latency.",
      ""
    );
  }

  lines.push(
    "## Timeline",
    "",
    "| Seq | Tool | Outcome | State version | Public input | Message |",
    "| ---: | --- | --- | ---: | --- | --- |",
    ...record.events.map(
      (event) =>
        `| ${event.eventSeq} | ${event.tool} | ${event.outcome} | ${event.stateVersion} | ${cell(JSON.stringify(event.input))} | ${cell(event.message)} |`
    )
  );

  lines.push(
    "",
    "> ToolQuest records accepted environment calls and world failures. Adapter-level invocation errors, private chain-of-thought, token usage, and model cost are not collected in v0.5."
  );

  if (replay.mismatches.length > 0) {
    lines.push(
      "",
      "## Replay mismatches",
      "",
      ...replay.mismatches.map(
        (mismatch) =>
          `- ${mismatch.code}${mismatch.eventSeq === undefined ? "" : ` at event ${mismatch.eventSeq}`}: ${mismatch.message}`
      )
    );
  }

  return `${lines.join("\n")}\n`;
}
