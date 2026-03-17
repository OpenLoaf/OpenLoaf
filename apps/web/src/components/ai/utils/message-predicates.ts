/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { UIMessage } from "@ai-sdk/react";
import type { ChatMessageKind } from "@openloaf/api";
import type { ToolPartSnapshot } from "@/hooks/use-chat-runtime";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { isHiddenToolPart } from "@/lib/chat/message-parts";
import {
  SUMMARY_HISTORY_COMMAND,
  SUMMARY_TITLE_COMMAND,
} from "@openloaf/api/common";
import {
  isCommandAtStart as isCommandAtStartPure,
  isCompactCommandMessage as isCompactCommandMessagePure,
  isSessionCommandMessage as isSessionCommandMessagePure,
} from "@/lib/chat/branch-utils";

/** Check whether the message is a compact command request. */
export function isCompactCommandMessage(input: {
  parts?: unknown[];
  messageKind?: ChatMessageKind;
}): boolean {
  return isCompactCommandMessagePure(input, getMessagePlainText, SUMMARY_HISTORY_COMMAND);
}

/** Check whether the message is a session command request. */
export function isSessionCommandMessage(input: { parts?: unknown[] }): boolean {
  return isSessionCommandMessagePure(input, getMessagePlainText, SUMMARY_TITLE_COMMAND);
}

/** Check whether text starts with the given command token. */
export function isCommandAtStart(text: string, command: string): boolean {
  return isCommandAtStartPure(text, command);
}

/** Check whether a message part looks like a tool invocation. */
export function isToolPartCandidate(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  const type = typeof part.type === "string" ? part.type : "";
  if (isHiddenToolPart(part)) return false;
  return type === "dynamic-tool" || type.startsWith("tool-") || typeof part.toolName === "string";
}

/** Resolve the last assistant message from a list of UI messages. */
export function findLastAssistantMessage(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return messages[i];
  }
  return undefined;
}

/** Check whether the error text indicates SaaS token unauthorized. */
export function isSaasUnauthorizedErrorMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes("\"message\":\"unauthorized\"")) return true;
  if (lower.includes("'message':'unauthorized'")) return true;
  if (/\bunauthorized\b/u.test(lower)) return true;
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) return false;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart)) as Record<string, unknown>;
    return String(parsed.message ?? "").trim().toLowerCase() === "unauthorized";
  } catch {
    return false;
  }
}

/** Map tool call ids to parts from a message. */
export function mapToolPartsFromMessage(message: UIMessage | undefined): Record<string, any> {
  const mapping: Record<string, any> = {};
  const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : [];
  for (const part of parts) {
    if (!isToolPartCandidate(part)) continue;
    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
    if (!toolCallId) continue;
    mapping[toolCallId] = part;
  }
  return mapping;
}

/** Collect tool call ids that require approval from the given message. */
export function collectApprovalToolCallIds(
  message: UIMessage | undefined,
  toolParts: Record<string, ToolPartSnapshot>,
): string[] {
  const result: string[] = [];
  const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : [];
  for (const part of parts) {
    if (!isToolPartCandidate(part)) continue;
    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
    if (!toolCallId) continue;
    const snapshot = toolParts[toolCallId];
    if (Boolean((snapshot as any)?.subAgentToolCallId)) continue;
    const state = typeof snapshot?.state === "string"
      ? snapshot.state
      : typeof part?.state === "string"
        ? part.state
        : "";
    const hasApprovalInfo =
      Boolean(part?.approval) ||
      Boolean(snapshot?.approval) ||
      state === "approval-requested" ||
      state === "approval-responded" ||
      state === "input-available";
    if (!hasApprovalInfo) continue;
    if (!result.includes(toolCallId)) result.push(toolCallId);
  }
  return result;
}

/** Check whether a tool approval has been resolved. */
export function isToolApprovalResolved(input: {
  toolCallId: string;
  toolParts: Record<string, ToolPartSnapshot>;
  messagePart?: any;
}): boolean {
  const approval = input.toolParts[input.toolCallId]?.approval ?? input.messagePart?.approval;
  if (approval?.approved === true || approval?.approved === false) return true;
  const state = typeof input.toolParts[input.toolCallId]?.state === "string"
    ? input.toolParts[input.toolCallId]?.state
    : typeof input.messagePart?.state === "string"
      ? input.messagePart.state
      : "";
  return state === "approval-responded" || state === "output-denied";
}
