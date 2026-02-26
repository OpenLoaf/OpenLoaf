# AI Elements 工具渲染测试 Prompt

## 使用方法
将下面的 prompt 发送给 AI 对话，观察各工具的渲染效果。

## 可自然触发的工具（8/12）

| # | 工具 | 触发方式 |
|---|------|---------|
| 5 | ShellTool (Terminal + Snippet) | shell-command |
| 6 | ShellTool (StackTrace) | shell 输出包含错误堆栈 |
| 8 | ShellTool (TestResults) | shell 运行测试命令 |
| 9 | WriteFileTool (Copy) | apply-patch |
| 10 | EnvFileTool | read-file on .env |
| 11 | ExecCommandTool (Sandbox) | exec-command |
| 12 | WidgetTool (JSXPreview) | generate-widget |
| 4 | Confirmation | generate-widget 自带 needsApproval |

## 无法自然触发的工具（4/12）

| # | 工具 | 原因 | 测试方式 |
|---|------|------|---------|
| 1 | PlanTool (isStreaming fix) | update-plan 已注释 | 需取消注释或手动编辑历史 |
| 2 | PlanStepList (key fix) | 同上 | 同上 |
| 3 | SubAgentTool (Agent) | sub-agent 已注释 | 需取消注释或手动编辑历史 |
| 4 | Confirmation (Accepted/Rejected) | 需要审批后状态 | 在 generate-widget 审批后观察 |

---

## 测试 Prompt（一次性发送）

```
请按顺序执行以下任务，每个任务都必须调用对应的工具，不要跳过：

1. 读取项目根目录的 .env 文件（如果不存在就读取 .env.example 或任意 .env* 文件）
2. 用 shell-command 执行：echo "Hello from shell" && ls -la package.json
3. 用 shell-command 执行一个会产生错误的 Node.js 命令：node -e "function foo() { throw new TypeError('test error message'); } function bar() { foo(); } bar();"
4. 用 shell-command 执行项目的测试命令（如果有的话）：pnpm vitest run --reporter=verbose 2>&1 | head -50
5. 用 exec-command 启动一个交互式命令：echo "interactive session test" && sleep 1 && echo "done"
6. 创建一个临时测试文件 /tmp/openloaf-tool-test.txt，内容为 "Tool rendering test"
7. 生成一个简单的时钟 Widget，显示当前时间

每个任务完成后简要说明结果，然后继续下一个。
```

---

## 补充测试（手动编辑历史数据）

对于无法自然触发的工具，可以在对话历史的 message parts 中手动插入以下 mock 数据：

### update-plan (PlanTool)
```json
{
  "type": "tool-invocation",
  "toolName": "update-plan",
  "toolCallId": "test-plan-001",
  "state": "output-available",
  "input": {
    "actionName": "同步当前计划",
    "mode": "full",
    "explanation": "测试计划渲染",
    "plan": [
      { "step": "读取配置文件", "status": "completed" },
      { "step": "分析依赖关系", "status": "completed" },
      { "step": "生成代码变更", "status": "in_progress" },
      { "step": "运行测试验证", "status": "pending" },
      { "step": "提交变更", "status": "pending" }
    ]
  },
  "output": { "ok": true, "data": { "updated": true } }
}
```

### sub-agent (SubAgentTool)
```json
{
  "type": "tool-invocation",
  "toolName": "sub-agent",
  "toolCallId": "test-subagent-001",
  "state": "output-available",
  "input": {
    "actionName": "分析代码结构",
    "subAgentName": "Code Analyzer",
    "model": "deepseek-v3"
  },
  "output": "分析完成：共发现 12 个模块，3 个待优化点。"
}
```
