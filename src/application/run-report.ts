import type { ReplayReport } from "../domain/replay.js";
import type {
  RoomDefinition,
  RunRecord,
  ScoreBreakdown
} from "../domain/types.js";

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function createRunReport(
  room: RoomDefinition,
  record: RunRecord,
  replay: ReplayReport,
  score?: ScoreBreakdown
): string {
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
    ""
  ];

  if (score !== undefined) {
    lines.push(
      "## Score",
      "",
      "| Completion | Safety | Efficiency | Recovery | Total |",
      "| ---: | ---: | ---: | ---: | ---: |",
      `| ${score.completion} | ${score.safety} | ${score.efficiency} | ${score.recovery} | ${score.total} |`,
      ""
    );
  }

  lines.push(
    "## Timeline",
    "",
    "| Seq | Tool | Outcome | State version | Message |",
    "| ---: | --- | --- | ---: | --- |",
    ...record.events.map(
      (event) =>
        `| ${event.eventSeq} | ${event.tool} | ${event.outcome} | ${event.stateVersion} | ${cell(event.message)} |`
    )
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
