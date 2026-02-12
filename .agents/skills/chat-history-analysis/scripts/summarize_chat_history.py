#!/usr/bin/env python3
"""Summarize chat history JSONL into compact, structured JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


def truncate_text(text: str, limit: int) -> str:
    """Return text truncated to a character limit."""
    # 控制输出长度，避免日志过大
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "...(truncated)"


def to_compact_json(value: Any) -> str:
    """Serialize a value into a compact JSON string."""
    # 将对象序列化为紧凑 JSON 字符串
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def maybe_compact(value: Any, limit: int) -> Any:
    """Return value if short enough; otherwise return a preview object."""
    # 如果内容太大，则只保留预览
    if value is None:
        return None
    if isinstance(value, str):
        return truncate_text(value, limit)
    try:
        serialized = to_compact_json(value)
    except Exception:
        serialized = str(value)
    if len(serialized) <= limit:
        return value
    return {"_preview": truncate_text(serialized, limit)}


def extract_text(parts: List[Dict[str, Any]] | None) -> str:
    """Extract concatenated text from message parts."""
    # 收集文本片段
    if not parts:
        return ""
    texts: List[str] = []
    for part in parts:
        text = part.get("text")
        if isinstance(text, str) and text:
            texts.append(text)
    return "\n".join(texts).strip()


def collect_tool_calls(
    parts: List[Dict[str, Any]] | None, max_chars: int
) -> List[Dict[str, Any]]:
    """Collect tool call parts from a message."""
    # 提取工具调用片段
    if not parts:
        return []
    tool_calls: List[Dict[str, Any]] = []
    for part in parts:
        part_type = part.get("type")
        has_io = "input" in part or "output" in part
        if (isinstance(part_type, str) and part_type.startswith("tool-")) or has_io:
            tool_calls.append(
                {
                    "type": part_type,
                    "state": part.get("state"),
                    "toolCallId": part.get("toolCallId"),
                    "input": maybe_compact(part.get("input"), max_chars),
                    "output": maybe_compact(part.get("output"), max_chars),
                }
            )
    return tool_calls


def summarize_request(req: Dict[str, Any], max_chars: int) -> Dict[str, Any]:
    """Summarize the request section."""
    # 保留核心请求字段
    messages = []
    for msg in req.get("messages", []) or []:
        messages.append(
            {
                "role": msg.get("role"),
                "id": msg.get("id"),
                "parentMessageId": msg.get("parentMessageId"),
                "text": truncate_text(extract_text(msg.get("parts", [])), max_chars),
            }
        )
    return {
        "sessionId": req.get("sessionId"),
        "clientId": req.get("clientId"),
        "timezone": req.get("timezone"),
        "tabId": req.get("tabId"),
        "chatModelId": req.get("chatModelId"),
        "chatModelSource": req.get("chatModelSource"),
        "workspaceId": req.get("workspaceId"),
        "projectId": req.get("projectId"),
        "selectedSkills": req.get("selectedSkills"),
        "messages": messages,
    }


def summarize_model_message(
    msg: Dict[str, Any], max_chars: int
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Summarize a model message and return its tool calls."""
    # 汇总单条模型消息
    parts = msg.get("parts", []) or []
    text = truncate_text(extract_text(parts), max_chars)
    tool_calls = collect_tool_calls(parts, max_chars)
    summary = {
        "id": msg.get("id"),
        "role": msg.get("role"),
        "messageKind": msg.get("messageKind"),
        "parentMessageId": msg.get("parentMessageId"),
        "text": text,
        "toolCalls": tool_calls,
        "metadata": maybe_compact(msg.get("metadata"), max_chars),
    }
    return summary, tool_calls


def summarize_entry(entry: Dict[str, Any], max_chars: int) -> Dict[str, Any]:
    """Summarize a JSONL entry."""
    # 汇总单条 JSONL 记录
    request = entry.get("request") or {}
    model_messages = []
    flattened_tools = []
    for msg in entry.get("modelMessages", []) or []:
        summary, tool_calls = summarize_model_message(msg, max_chars)
        model_messages.append(summary)
        for tool_call in tool_calls:
            flattened_tools.append(
                {
                    "sourceMessageId": msg.get("id"),
                    "sourceRole": msg.get("role"),
                    **tool_call,
                }
            )

    return {
        "timestamp": entry.get("timestamp"),
        "sessionId": entry.get("sessionId"),
        "messagePath": entry.get("messagePath"),
        "workspaceId": entry.get("workspaceId"),
        "request": summarize_request(request, max_chars),
        "systemPromptPreview": truncate_text(entry.get("systemPrompt", ""), max_chars),
        "modelMessages": model_messages,
        "toolCalls": flattened_tools,
    }


def read_jsonl(path: Path) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Read JSONL file and return entries and parse errors."""
    # 读取并解析 JSONL
    entries: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for index, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except Exception as exc:
                errors.append(
                    {"line": index, "error": str(exc), "preview": line[:200]}
                )
    return entries, errors


def list_jsonl_files(path: Path) -> List[Path]:
    """List JSONL files under a directory."""
    # 先找当前目录，再做浅层递归
    files = sorted([p for p in path.iterdir() if p.is_file() and p.suffix == ".jsonl"])
    if files:
        return files
    return sorted(list(path.rglob("*.jsonl")))


def main() -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Summarize chat history JSONL into compact JSON."
    )
    parser.add_argument("path", help="Path to JSONL file or directory")
    parser.add_argument(
        "--max-chars",
        type=int,
        default=2000,
        help="Max characters to keep for long fields",
    )
    args = parser.parse_args()

    # 流程说明：
    # 1) 校验路径存在性
    # 2) 若为目录，输出候选 JSONL 文件并退出
    # 3) 若为文件，解析每行并生成摘要
    # 4) 输出结构化 JSON
    target = Path(args.path).expanduser()
    if not target.exists():
        print(json.dumps({"error": "path_not_found", "path": str(target)}))
        return 1

    if target.is_dir():
        files = list_jsonl_files(target)
        print(
            json.dumps(
                {
                    "path": str(target),
                    "isDirectory": True,
                    "jsonlFiles": [str(p) for p in files],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    entries, errors = read_jsonl(target)
    summaries = [summarize_entry(entry, args.max_chars) for entry in entries]
    result = {
        "path": str(target),
        "lineCount": len(entries) + len(errors),
        "entryCount": len(entries),
        "errors": errors,
        "entries": summaries,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
