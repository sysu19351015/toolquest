# ToolQuest

给工具调用 Agent 玩的数字密室。

ToolQuest 为本地 MCP Server提供解谜游戏。Agent 可以通过工具探索、
操作机关、提交答案；开发者则可以获得可复现的事件轨迹和确定性评分。

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
    npm start

非技术用户可以直接启动可视化界面：

    npm run web

然后打开 `http://127.0.0.1:4310`。房间选择、调查、移动、操作机关、提交答案和
查看成绩都可以通过按钮完成，运行数据只保存在本机。

常见 MCP 客户端配置如下，请换成当前机器上的绝对路径：

    {
      "mcpServers": {
        "toolquest": {
          "command": "node",
          "args": ["D:/absolute/path/to/toolquest/dist/server.js"]
        }
      }
    }

## Agent 操作顺序

1. 调用 list_rooms 发现并选择挑战。
2. 使用选定的 roomId 调用 start_run。
3. 使用返回的 runId 调用 look。
4. inspect 可见对象，获得线索和 interactionId。
5. 调用 move 或 use 时提供唯一 actionId 和最新 stateVersion。
6. 最终机关准备就绪并推导出答案后调用 submit。
7. 调用 replay_run 校验轨迹，调用 export_report 生成 Markdown 结果。

客户端或服务重启后，先调用 list_runs 找回近期 runId，再调用 get_run，并从返回的
stateVersion 和公共快照继续执行。

## 可视化界面

v0.4 使用与 MCP 完全相同的 RunService 提供本地浏览器体验。玩家可以选择房间、
检查可见对象、移动、使用随身物品、提交答案、恢复历史运行、查看公共事件时间线、
验证确定性重放并下载脱敏报告。两个内置房间均提供中文界面文案。

浏览器不会收到隐藏房间定义或答案明文。Web 服务只监听 `127.0.0.1`，限制请求体
大小，并为每个改变状态的请求验证当前页面专属令牌。

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

状态文件属于服务端私有数据。动作参数仅保存为 SHA-256 幂等摘要，提交答案不会以
明文写入；公共 JSONL 只记录答案长度和结果。运行发现只返回公共摘要；结构损坏的
状态文件会被拒绝，不会返回部分数据。

## 开发验证

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run check

测试包含领域状态机、Web API 安全与用户流程、幂等与版本冲突、run 隔离、重启
发现与恢复、损坏状态拒绝、篡改检测重放、报告脱敏、MCP 工具契约，以及隔离状态
目录的真实 stdio 子进程通信。

## 内置房间

| 房间 ID | 难度 | 主要测试能力 |
| --- | --- | --- |
| the-vault | 入门 | 探索、组合线索、使用物品 |
| signal-station | 中级 | 多地点规划、消耗物品、链式前置条件 |

每个房间都会公布标准动作数，使不同复杂度场景的效率得分仍可比较。

## v0.4 范围

当前版本包含响应式本地 Web 界面、两个内置房间、十一个 MCP 工具、原子本地运行
持久化、重启发现与恢复、确定性事件重放、脱敏 Markdown 报告、JSONL 轨迹和按
房间校准的评分。一个状态目录只支持一个服务进程。远程托管、鉴权、社区房间、
多进程事务和公开排行榜暂不包含。

版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
