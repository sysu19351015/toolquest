# Agent evaluation quick start / Agent 评测接入指南

ToolQuest v0.5 has three roles: an external Agent chooses and calls tools; the MCP server owns the deterministic environment; the Web console observes public records without making moves. The Web console does **not** start a model for you.

## 1. Build and choose one record directory

From the repository root, run `npm ci` and `npm run build` with Node.js 20 or newer. Use one **absolute** state directory for the MCP server and observer; working directories can differ between clients.

Example MCP client configuration (replace both paths with yours):

```json
{
  "mcpServers": {
    "toolquest": {
      "command": "node",
      "args": ["/absolute/path/toolquest/dist/server.js"],
      "env": {
        "TOOLQUEST_STATE_DIR": "/absolute/path/toolquest/.toolquest/state"
      }
    }
  }
}
```

For Windows JSON paths, use `D:/projects/toolquest/...` or escaped backslashes. Configure your model in the external Agent client, not in ToolQuest. No model API key belongs in Agent metadata or run labels.

## 2. Open the read-only console

In a separate terminal, from the repository root:

```powershell
# Windows PowerShell: use the SAME absolute directory as the MCP client.
$env:TOOLQUEST_STATE_DIR = 'D:/projects/toolquest/.toolquest/state'
npm run start:web
```

```sh
# macOS / Linux
TOOLQUEST_STATE_DIR=/absolute/path/toolquest/.toolquest/state npm run start:web
```

Open `http://127.0.0.1:4310/`. An empty page is expected before the Agent calls `start_run`. The observer may start before or after the Agent and reads existing records on startup. It is local-only, not a remotely hosted service.

## 3. Give the Agent a task

Example task prompt:

> Use ToolQuest's MCP tools to list the available rooms, start one run, explore the environment, solve it, and submit your answer. Use the tool schemas and public environment observations. For state-changing actions, use the latest state version and a unique action ID. If an action fails, inspect the feedback and recover. Do not read ToolQuest source code or persisted files. When finished, retrieve the run and replay verification. Include your run ID in the final response.

An optional `start_run` input:

```json
{
  "roomId": "the-vault",
  "seed": "comparison-001",
  "agent": {
    "name": "My evaluation agent",
    "model": "your-model-name",
    "provider": "your-provider",
    "version": "experiment-1",
    "framework": "your-framework"
  },
  "label": "baseline"
}
```

All extra fields are optional; the MCP schema defaults `roomId` to `the-vault` if omitted. Old runs without Agent metadata remain readable. Metadata is caller-reported context, not verified identity. It does not affect the deterministic state hash.

## 4. Watch, verify, export

The console discovers runs automatically and shows:

- The latest 100 runs; status, terminal pass rate and average terminal score within that window.
- Public Agent metadata, current location, inventory, remaining attempts, state version and hash.
- An expandable event timeline with public tool inputs, environment outputs, world failures and event spacing.
- Terminal scoring, on-demand deterministic replay verification, and a downloadable Markdown report.

The Agent is the only writer. Web observation, verification and export do not append events or alter the score. SSE updates the selected run; snapshot polling also refreshes the list. During disconnection, the page retries. Verification shows which event it covered and asks for re-verification if newer events arrive.

Submitted answers and action fingerprints are redacted from public traces and reports. Other public inputs and metadata are intentionally shown. Do not put confidential information in `seed`, names or labels. Trace files are logs; `.toolquest/state` is authoritative storage.

## 5. Understand the result

This is a small, auditable tool-use testbed, not a comprehensive Agent ranking. The current score is a room-specific heuristic: completion up to 50, fixed safety 20, efficiency up to 15, recovery up to 15. A world failure and recovery can affect the recovery component; a high score does not certify general reasoning or security.

Elapsed time is the span between the first and last recorded event. Event spacing includes orchestration and waiting, not just model latency. v0.5 does not collect private chain-of-thought, tokens, monetary cost or MCP-level invocation errors. There is no built-in model runner, batch comparison or report archive. An active run has no final score and is excluded from terminal pass rate.

## Human Playground

For manual exploration, start `npm run playground` and visit `http://127.0.0.1:4310/playground`. Stop the other Web process first, or set `TOOLQUEST_WEB_PORT=4311` in that terminal to use a different port (PowerShell: `$env:TOOLQUEST_WEB_PORT = '4311'`).

Playground writes runs and is explicitly separate from the observer. By default it uses `.toolquest/playground-state` and `.toolquest/playground-runs`; records identify the operator as `Human Playground`. Clear any inherited `TOOLQUEST_STATE_DIR` override when you want that default isolation. Do not point an enabled Playground and an MCP writer at the same directory at the same time. Multiple observers are safe; multiple writers are not supported.

## 排查常见问题

- **Agent 在运行，网页却没有记录**：确认两边 `TOOLQUEST_STATE_DIR` 是同一个绝对路径，且没有关闭持久化。刷新网页；不要把 trace 日志目录当作状态目录。
- **看不到“开始测试”按钮**：这是预期行为。由外部 Agent 调用 `start_run`；网页是只读观察台。人工体验请单独启动 Playground。
- **未记录 Agent / 模型**：旧记录或者调用方未传入可选元数据。工具调用与重放仍可使用。
- **事件流离线**：确认本机服务仍在运行，状态目录可读取。页面会重连并用快照轮询补齐；无须重新创建运行。
- **得分/时长与预期不同**：先看上述计分和时间口径，不要把事件间隔当作模型延迟或把固定安全分当作安全评测结论。
- **想测试真实模型**：在支持 MCP 的外部 Agent 客户端接入 ToolQuest，然后发送上述任务。浏览器本身不会调用模型。
