# ToolQuest

给工具调用 Agent 的确定性任务环境与实时评测控制台。

Agent 通过本地 MCP Server 探索、操作机关并提交答案；ToolQuest 负责维护环境、
记录公开工具轨迹、验证确定性并评分；开发者通过只读 Web 控制台观察过程和结果。
Agent 是操作者，ToolQuest 是环境与裁判，用户是测试的创建者与观察者。

[English](README.md)

## 项目特点

- 不依赖另一个大模型充当裁判；
- 房间状态、事件和评分均可确定性复现；
- 每个 runId 对应独立运行，避免状态串联；
- 使用 stateVersion 防止并发覆盖；
- 使用 actionId 保证同一动作安全重试；
- 原子持久化本地运行，服务重启后可恢复；
- 支持确定性重放校验和 Markdown 报告；
- 同时返回模型可读文本和结构化结果；
- 默认在本地记录经过脱敏的 JSONL 轨迹。

## 快速开始

需要 Node.js 20 或更高版本。

    npm install
    npm run check
    npm run build

在 Agent 的 MCP 客户端中配置 ToolQuest；Agent Host 会启动 MCP 写入进程：

    {
      "mcpServers": {
        "toolquest": {
          "command": "node",
          "args": ["D:/absolute/path/to/toolquest/dist/server.js"],
          "env": {
            "TOOLQUEST_STATE_DIR": "D:/absolute/path/to/toolquest/.toolquest/state"
          }
        }
      }
    }

在另一个终端使用相同状态目录启动只读观察台：

    npm run web

然后打开 `http://127.0.0.1:4310`。如果 MCP 与 Web 的工作目录不同，两边必须把
`TOOLQUEST_STATE_DIR` 设为同一个绝对路径。每个状态目录只运行一个 MCP 写入者。
完整 Windows 示例、Agent 指令、输入输出和排障见[评测指南](docs/evaluation-guide.md)。

## Agent 操作顺序

1. 调用 list_rooms 发现并选择挑战。
2. 使用 roomId 调用 start_run；建议同时提供 Agent 名称、模型等公开元数据和运行标签。
3. 使用返回的 runId 调用 look。
4. inspect 可见对象，获得线索和 interactionId。
5. 调用 move 或 use 时提供唯一 actionId 和最新 stateVersion。
6. 最终机关准备就绪并推导出答案后调用 submit。
7. 调用 replay_run 校验轨迹，调用 export_report 生成 Markdown 结果。

客户端或服务重启后，先调用 list_runs 找回近期 runId，再调用 get_run，并从返回的
stateVersion 和公共快照继续执行。

## Agent Evaluation Console

v0.5 的首页是只读 Agent 评测控制台。它从 MCP 写入的权威状态读取运行，自动发现
新测试，并通过 SSE 显示当前 Agent、模型、运行标签、公开环境快照、工具调用输入、
环境输出、调用间隔、状态版本与哈希。终态运行还会显示分项得分，支持确定性重放
验证和详细 Markdown 报告下载。概览指标仅统计最新 100 个运行，不是全量基准测试。

观察台不会调用 look、inspect 或其他游戏工具，因此不会改变运行或追加事件。浏览器
不公开隐藏房间定义、提交答案字段或动作指纹；公开元数据和标签中也不要填写秘密。
当前只记录已被环境接受的
调用和游戏世界失败；MCP 参数错误、延迟、Token 和成本尚未纳入事件轨迹。

人工调试界面保留为 Playground，但必须显式启动：

    npm run playground

随后访问 `http://127.0.0.1:4310/playground`。Playground 默认使用独立的状态和轨迹
目录。不要通过环境变量让 Playground 与 MCP 同时写入同一个状态目录。

## 十一个 MCP 工具

| 工具 | 作用 | 是否改变房间状态 |
| --- | --- | --- |
| list_rooms | 发现房间、难度和标准动作数 | 否 |
| list_runs | 发现近期持久化运行，可按状态筛选和限制数量 | 否 |
| start_run | 创建隔离的确定性运行 | 创建运行 |
| get_run | 获取持久化运行的公共快照 | 否 |
| replay_run | 从事件日志重建并校验运行 | 否 |
| export_report | 返回脱敏的 Markdown 评测报告 | 否 |
| look | 查看位置、对象、出口和背包 | 否 |
| inspect | 检查对象、读取线索和交互 | 否 |
| move | 移动到 look 返回的目的地 | 是 |
| use | 执行 inspect 返回的交互 | 可能 |
| submit | 提交最终答案并计算成绩 | 可能 |

完全相同的 actionId 重试会返回首次结果；同一 actionId 携带不同参数会被拒绝。
错误目的地、过期版本等调用错误会返回稳定错误码和 recoveryHint；物品不匹配、
前置条件未满足、答案错误等属于游戏世界结果，会正常写入事件轨迹。

## 运行持久化与轨迹

默认原子保存权威运行状态，并另外追加公共事件轨迹：

    .toolquest/state/<runId>.json
    .toolquest/runs/<runId>.jsonl

使用 TOOLQUEST_STATE_DIR 可以修改状态目录；设置 TOOLQUEST_DISABLE_STATE=1
会改用临时内存运行，设置 TOOLQUEST_DISABLE_TRACES=1 可以关闭公共轨迹。

状态文件属于服务端私有数据。幂等比对使用 SHA-256 参数摘要，公开动作参数仍会
记录在事件中；提交答案字段不以明文保存，对应的提交事件改为记录答案长度和结果。
运行发现只返回公共摘要；结构损坏的状态文件会被拒绝，不会返回部分数据。

## 开发验证

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run check

测试包含领域状态机、Observer 只读边界、跨服务 SSE、Playground 安全、Agent
元数据、Web API 用户流程、幂等与版本冲突、run 隔离、重启
发现与恢复、损坏状态拒绝、篡改检测重放、报告脱敏、MCP 工具契约，以及隔离状态
目录的真实 stdio 子进程通信。

## 内置房间

| 房间 ID | 难度 | 主要测试能力 |
| --- | --- | --- |
| the-vault | 入门 | 探索、组合线索、使用物品 |
| signal-station | 中级 | 多地点规划、消耗物品、链式前置条件 |

每个房间都会公布标准动作数，使不同复杂度场景的效率得分仍可比较。

## v0.5 范围

当前版本包含只读 Agent Evaluation Console、按运行 SSE 事件流、显式人工
Playground、公开 Agent 元数据、两个内置房间、十一个 MCP 工具、原子本地运行
持久化、确定性重放、详细脱敏报告、JSONL 轨迹和按房间校准的评分。

v0.5 不负责启动模型、保存 API Key、批量调度 Agent、记录私有思维链，或统计
Token 与模型成本。一个状态目录只支持一个 MCP/Playground 写入进程；远程托管、
鉴权、社区房间、多进程事务、批次对比和公开排行榜暂不包含。

当前评分仍是房间内启发式规则，其中安全分固定；它并不代表通用 Agent 能力。
页面显示的事件间隔不是单次工具调用延迟。

版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
