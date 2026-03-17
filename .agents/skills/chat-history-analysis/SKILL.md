---
name: chat-history-analysis
description: Analyze AI chat history stored as .jsonl under paths containing "chat_history", or debug_api/debug_request JSON files. Use when the user provides a filesystem path that includes "chat_history" and ends with ".jsonl", when the user asks to analyze OpenLoaf/Codex chat logs, tool calls, and outcomes, or when analyzing debug_api_*.json / debug_request_*.json files for full LLM request/response inspection.
---

## Overview

Reconstruct a chat session from a JSONL log or debug API JSON files and diagnose mismatches between the user's request, tool execution, and the final response. Always respond in Chinese.

## Data Sources

### 1. messages.jsonl（聊天消息日志）

位于 session 目录下，每行一条消息记录，包含消息树结构。

### 2. debug_api JSON（AI 调试模式专用 — 每步 LLM 请求/响应）

当全局设置中的「AI调试模式」（`chatPrefaceEnabled`）开启时，每一步 LLM 调用都会实时写入独立文件。

**文件位置**：`~/.openloaf/sessions/{sessionId}/debug/{hhmmss}_{messageId}/`

**目录结构**：
- `{hhmmss}` — 请求发起时的本地时间（时分秒），前置便于按时间排序
- `{messageId}` — assistant 消息 ID，用于区分同一 messageId 的多次重试

**文件命名**：`step{N}_{request|response}.json`
- `N` — 步骤编号（从 0 开始）
- `request` / `response` — 请求或响应

**写入时机**：
- `_request.json` — 在 `experimental_onStepStart` 回调中写入（LLM 调用前）
- `_response.json` — 在 `onStepFinish` 回调中写入（LLM 返回后）

**request 文件结构**：
```json
{
  "stepNumber": 0,
  "model": { "provider": "openai", "modelId": "gpt-4o" },
  "system": "系统指令文本...",
  "messages": [
    // 发送给 LLM 的完整消息数组（ModelMessage[]）
    // 这是该步实际发给模型的 raw messages，包含之前步骤的 tool call/result
  ],
  "activeTools": ["tool-search", "read-file", "write-file"],
  "toolChoice": "auto"
}
```

**response 文件结构**：
```json
{
  "stepNumber": 0,
  "text": "LLM 返回的文本内容",
  "toolCalls": [
    // 该步 LLM 发起的工具调用
    { "toolCallId": "call_xxx", "toolName": "read-file", "args": { "path": "/foo" } }
  ],
  "toolResults": [
    // 工具执行结果
    { "toolCallId": "call_xxx", "result": { "content": "..." } }
  ],
  "finishReason": "tool-calls",
  "usage": { "promptTokens": 1200, "completionTokens": 85 }
}
```

**典型目录结构**（3 步对话 + 1 次重试示例）：
```
debug/
  143052_msg123/          ← 首次请求
    step0_request.json
    step0_response.json
    step1_request.json
    step1_response.json
    step2_request.json
    step2_response.json
  143210_msg123/          ← 重试（同一 messageId，不同时间戳）
    step0_request.json
    step0_response.json
```

**开启方式**：设置 → 关于 OpenLoaf → AI调试模式 → 开启

**实现位置**：`apps/server/src/ai/services/chat/streamOrchestrator.ts` — `writeDebugStepFile()` 函数

### 3. PROMPT.md / PREFACE.md（同样由 AI 调试模式生成）

- `PROMPT.md` — 完整系统指令（agent prompt + hardRules）
- `PREFACE.md` — session preface（工具列表、技能、上下文等）

## Workflow

1) Validate input path
- If the path is a directory, list `*.jsonl` files and `debug/` subdirectories and ask which to analyze.
- If the path is a file, continue.
- If the path is outside allowed roots or unreadable, ask the user to provide a readable copy.

2) Parse the data
- For `.jsonl`: each line is one entry. Parse all lines and keep errors if any.
- For `debug/{hhmmss}_{messageId}/` directories: each subdirectory is one请求尝试（重试产生新目录）。
- `step{N}_request.json`: 该步发给 LLM 的 raw messages。
- `step{N}_response.json`: LLM 返回的 text、tool calls、usage、finish reason。
- 按 stepNumber 配对 request/response 重建每步 LLM round-trip。
- 同一 messageId 有多个时间戳目录时，表示发生了重试，按时间排序分析。

3) Build a timeline
- User request(s) from step 0 request messages.
- Each step: model input → LLM output → tool calls → tool results.
- Track how messages accumulate across steps (step N+1 request includes step N tool results).
- Timing: use file modification timestamps to estimate per-step latency.

4) Diagnose the issue
- Compare user intent vs actual outcome.
- Check whether tool outputs were used correctly or ignored.
- Look for missing context (preface/system prompt constraints — check PROMPT.md/PREFACE.md if available).
- Note inconsistencies (missing toolCallId, broken parentMessageId chain, empty assistant text).
- Check model selection and agent routing (from request `model` field).
- Compare `activeTools` across steps to detect tool-search activation patterns.

5) Provide actionable next steps
- Explain root cause in plain language.
- Suggest specific fixes or re-runs.
- Ask focused follow-up questions if needed.

## Use the bundled script (recommended)

Run the summarizer to get a structured, compact view of the log:

If the input is a directory, the script will return candidate JSONL files for you to ask the user to pick.

## Output format (default)

Use this structure unless the user asks otherwise:

1. 摘要（1-2 句）
2. 用户请求与上下文（关键输入、约束）
3. 执行与结果（逐步 LLM 调用与工具执行）
4. 问题定位（根因）
5. 建议与下一步（可执行步骤 + 问题）

Keep the report concise and avoid pasting large raw logs.
