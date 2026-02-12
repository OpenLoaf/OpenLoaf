---
name: chat-history-analysis
description: Analyze AI chat history stored as .jsonl under paths containing "chat_history". Use when the user provides a filesystem path that includes "chat_history" and ends with ".jsonl", or when the user asks to analyze Tenas/Codex chat logs, tool calls, and outcomes based on the request and results.
---

# Chat History Analysis

## Overview

Reconstruct a chat session from a JSONL log and diagnose mismatches between the user's request, tool execution, and the final response. Always respond in Chinese.

## Workflow

1) Validate input path
- If the path is a directory, list `*.jsonl` and ask which file to analyze.
- If the path is a file, continue.
- If the path is outside allowed roots or unreadable, ask the user to provide a readable copy.

2) Parse the JSONL
- Each line is one entry. Parse all lines and keep errors if any.
- Extract `request.messages`, `modelMessages`, tool call parts, and timestamps.

3) Build a timeline
- User request(s) from `request.messages`.
- Tool calls and outputs from `modelMessages[].parts`.
- Assistant text responses from `modelMessages`.

4) Diagnose the issue
- Compare user intent vs actual outcome.
- Check whether tool outputs were used correctly or ignored.
- Look for missing context (preface/system prompt constraints).
- Note inconsistencies (missing toolCallId, broken parentMessageId chain, empty assistant text).

5) Provide actionable next steps
- Explain root cause in plain language.
- Suggest specific fixes or re-runs.
- Ask focused follow-up questions if needed.

## Use the bundled script (recommended)

Run the summarizer to get a structured, compact view of the log:

```bash
python3 scripts/summarize_chat_history.py "/path/to/chat_history/.../01_02_01.jsonl" --max-chars 2000
```

If the input is a directory, the script will return candidate JSONL files for you to ask the user to pick.

## Output format (default)

Use this structure unless the user asks otherwise:

1. 摘要（1-2 句）
2. 用户请求与上下文（关键输入、约束）
3. 执行与结果（tool 调用与输出、助手回复）
4. 问题定位（根因）
5. 建议与下一步（可执行步骤 + 问题）

Keep the report concise and avoid pasting large raw logs.
