# ToolQuest

给工具调用 Agent 玩的数字密室。

ToolQuest 将确定性的谜题房间暴露为本地 MCP Server。Agent 可以通过工具探索、
操作机关、提交答案；开发者则可以获得可复现的事件轨迹和确定性评分。

[English](README.md)

## 项目特点

- 不依赖另一个大模型充当裁判；
- 房间状态、事件和评分均可确定性复现；
- 每个 runId 对应独立运行，避免状态串联；
- 使用 stateVersion 防止并发覆盖；
- 使用 actionId 保证同一动作安全重试；
- 同时返回模型可读文本和结构化结果；
- 默认在本地记录经过脱敏的 JSONL 轨迹。

## 快速开始

需要 Node.js 20 或更高版本。

    npm install
    npm run check
    npm start

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

1. 调用 start_run，roomId 使用 the-vault。
2. 使用返回的 runId 调用 look。
3. inspect 可见对象，获得线索和 interactionId。
4. 调用 move 或 use 时提供唯一 actionId 和最新 stateVersion。
5. 打开保险库并推导出密码后调用 submit。

## 六个 MCP 工具

| 工具 | 作用 | 是否改变房间状态 |
| --- | --- | --- |
| start_run | 创建隔离的确定性运行 | 创建运行 |
| look | 查看位置、对象、出口和背包 | 否 |
| inspect | 检查对象、读取线索和交互 | 否 |
| move | 移动到 look 返回的目的地 | 是 |
| use | 执行 inspect 返回的交互 | 可能 |
| submit | 提交最终答案并计算成绩 | 可能 |

完全相同的 actionId 重试会返回首次结果；同一 actionId 携带不同参数会被拒绝。
错误目的地、过期版本等调用错误会返回稳定错误码和 recoveryHint；钥匙不匹配、
答案错误等属于游戏世界结果，会正常写入事件轨迹。

## 本地轨迹

默认写入：

    .toolquest/runs/<runId>.jsonl

设置 TOOLQUEST_DISABLE_TRACES=1 可以关闭磁盘轨迹。submit 的答案原文不会写入
公共事件输入。

## 开发验证

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run check

测试包含领域状态机、幂等与版本冲突、run 隔离、MCP 工具契约，以及真实 stdio
子进程通信。

## v0.1 范围

当前版本包含一个内置房间 The Vault、本地 stdio、内存运行、JSONL 轨迹和确定性
评分。暂不包含远程 HTTP、鉴权、崩溃恢复、回放 UI、社区房间加载或公开排行榜。

## License

MIT
