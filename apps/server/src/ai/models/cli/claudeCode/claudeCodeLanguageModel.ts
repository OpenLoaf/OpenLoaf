/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import { convertAsyncIteratorToReadableStream } from "@ai-sdk/provider-utils";
import { logger } from "@/common/logger";
import crypto from "node:crypto";
import { prisma } from "@openloaf/db";
import {
  appendCliSummary,
  getCliSessionId,
  getCliSessionPreface,
  getProjectId,
  getSessionId,
  getUiWriter,
  getWorkspaceId,
  setCliSession,
} from "@/ai/shared/context/requestContext";
import { resolveSessionPrefaceText } from "@/ai/services/chat/repositories/messageStore";
import { setActiveQuery, clearActiveQuery } from "./activeQueries";
import { clearCachedCcSession, setCachedCcSession } from "./claudeCodeSessionStore";
import { getProjectRootPath, getWorkspaceRootPathById } from "@openloaf/api/services/vfsService";

/** Default empty warnings payload. */
const EMPTY_WARNINGS: SharedV3Warning[] = [];
/** Default finish reason for completed turns. */
const STOP_FINISH_REASON: LanguageModelV3FinishReason = { unified: "stop", raw: "stop" };

type ClaudeCodeLanguageModelInput = {
  /** Provider id. */
  providerId: string;
  /** Model id. */
  modelId: string;
  /** API base URL override. */
  apiUrl: string;
  /** API key override. */
  apiKey: string;
  /** Force using custom API key. */
  forceCustomApiKey: boolean;
};

/** Build an empty usage payload when token counts are unavailable. */
function buildEmptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

/** Map SDK result usage to AI SDK usage. */
function buildUsageFromResult(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
} | null): LanguageModelV3Usage {
  if (!usage) return buildEmptyUsage();
  const inputTotal = usage.input_tokens ?? undefined;
  const outputTotal = usage.output_tokens ?? undefined;
  const cacheRead = usage.cache_read_input_tokens ?? undefined;
  const cacheWrite = usage.cache_creation_input_tokens ?? undefined;
  const inputNoCache =
    inputTotal !== undefined && cacheRead !== undefined
      ? Math.max(inputTotal - cacheRead, 0)
      : undefined;
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputNoCache,
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: undefined,
    },
  };
}

/** Resolve the working directory for Claude Code execution. */
function resolveWorkingDirectory(): string {
  const projectId = getProjectId();
  if (projectId) {
    const projectRootPath = getProjectRootPath(projectId);
    if (projectRootPath) {
      logger.debug({ projectId, cwd: projectRootPath }, "[cli] cwd resolved from project");
      return projectRootPath;
    }
    logger.warn({ projectId }, "[cli] project root not found, falling back to workspace");
  }
  const workspaceId = getWorkspaceId();
  if (workspaceId) {
    const workspaceRootPath = getWorkspaceRootPathById(workspaceId);
    if (workspaceRootPath) {
      logger.debug({ workspaceId, cwd: workspaceRootPath }, "[cli] cwd resolved from workspace");
      return workspaceRootPath;
    }
    logger.warn({ workspaceId }, "[cli] workspace root not found");
  }
  throw new Error("Claude Code 运行路径缺失：未找到 project 或 workspace 根目录");
}

/** Extract the latest user text from a prompt. */
function extractPromptText(
  prompt: LanguageModelV3CallOptions["prompt"],
): string {
  for (let i = prompt.length - 1; i >= 0; i -= 1) {
    const message = prompt[i];
    if (!message || message.role !== "user") continue;
    const parts = Array.isArray(message.content) ? message.content : [];
    const texts: string[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && part.text?.trim()) {
        texts.push(part.text);
      }
    }
    if (texts.length > 0) return texts.join("\n");
  }
  return "";
}

/** Build a LanguageModelV3 instance backed by Claude Code CLI (via Agent SDK). */
export function buildClaudeCodeLanguageModel(
  input: ClaudeCodeLanguageModelInput,
): LanguageModelV3 {
  const supportedUrls: Record<string, RegExp[]> = {};

  return {
    specificationVersion: "v3",
    provider: input.providerId,
    modelId: input.modelId,
    supportedUrls,
    async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      const result = await runClaudeCodeTurn(input, options);
      return {
        content: result.text ? [{ type: "text", text: result.text }] : [],
        finishReason: STOP_FINISH_REASON,
        usage: result.usage,
        warnings: EMPTY_WARNINGS,
      };
    },
    async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
      const stream = createClaudeCodeStream(input, options);
      return { stream: convertAsyncIteratorToReadableStream(stream) };
    },
  };
}

type ClaudeCodeTurnResult = {
  text: string;
  usage: LanguageModelV3Usage;
};

/** Run a Claude Code turn and collect the final response. */
async function runClaudeCodeTurn(
  input: ClaudeCodeLanguageModelInput,
  options: LanguageModelV3CallOptions,
): Promise<ClaudeCodeTurnResult> {
  let text = "";
  let usage = buildEmptyUsage();
  for await (const part of createClaudeCodeStream(input, options)) {
    if (part.type === "text-delta") {
      text += part.delta;
    }
    if (part.type === "finish") {
      usage = part.usage;
    }
  }
  return { text, usage };
}

/** Build env overrides for the Claude Code SDK process. */
function buildSdkEnv(input: ClaudeCodeLanguageModelInput): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "openloaf/1.0.0",
  };
  if (input.forceCustomApiKey && input.apiKey.trim()) {
    env.ANTHROPIC_API_KEY = input.apiKey.trim();
  }
  if (input.forceCustomApiKey && input.apiUrl.trim()) {
    env.ANTHROPIC_BASE_URL = input.apiUrl.trim();
  }
  return env;
}

/** Strip ANSI control sequences from CLI output. */
function stripAnsiControlSequences(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

/** Check whether an error indicates the session was not found (for resume fallback). */
function isSessionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("session") && (msg.includes("not found") || msg.includes("does not exist"));
}

/** Process a stream of Claude Code SDK messages and yield AI SDK stream parts. */
async function* processQueryStream(
  queryStream: AsyncIterable<any>,
  sessionId: string | undefined,
  uiWriter: ReturnType<typeof getUiWriter>,
): AsyncGenerator<LanguageModelV3StreamPart> {
  let usage = buildEmptyUsage();
  let textId: string | null = null;
  let hasStreamedText = false;

  for await (const message of queryStream) {
    // --- 流式文本 delta ---
    if (message.type === "stream_event") {
      const event = (message as any).event;
      if (!event) continue;
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const delta = event.delta.text ?? "";
        if (!delta) continue;
        hasStreamedText = true;
        if (!textId) {
          textId = `cc-text-${sessionId ?? "0"}`;
          yield { type: "text-start", id: textId };
        }
        yield { type: "text-delta", id: textId, delta };
        continue;
      }
      continue;
    }

    // --- 完整 assistant 消息（含工具调用结果）---
    if (message.type === "assistant") {
      const betaMessage = (message as any).message;
      if (!betaMessage?.content) continue;
      const contentBlocks = Array.isArray(betaMessage.content) ? betaMessage.content : [];
      for (const block of contentBlocks) {
        if (block.type === "text" && block.text) {
          if (hasStreamedText) continue;
          if (!textId) {
            textId = `cc-text-${sessionId ?? "0"}`;
            yield { type: "text-start", id: textId };
          }
          yield { type: "text-delta", id: textId, delta: block.text };
        }
        if (block.type === "tool_use") {
          const toolInput = block.input as Record<string, unknown> | undefined;

          if (block.name === "Write" && isPlanFilePath(toolInput?.file_path)) {
            if (uiWriter) {
              uiWriter.write({
                type: "data-cc-plan-file",
                data: {
                  filePath: toolInput!.file_path as string,
                  title: extractPlanFileName(toolInput!.file_path as string),
                },
                transient: true,
              } as any);
            }
          }

          if (block.name === "ExitPlanMode") {
            if (uiWriter) {
              uiWriter.write({
                type: "data-cc-plan-ready",
                data: {},
                transient: true,
              } as any);
            }
          }

          if (block.name === "AskUserQuestion") {
            if (uiWriter) {
              uiWriter.write({
                type: "data-cc-user-question",
                data: {
                  sessionId,
                  toolUseId: block.id,
                  questions: (toolInput?.questions as unknown[]) ?? [],
                },
                transient: true,
              } as any);
            }
          }

          continue;
        }
      }
      hasStreamedText = false;
      continue;
    }

    // --- 工具执行进度 ---
    if (message.type === "tool_progress") {
      if (uiWriter) {
        const m = message as any;
        uiWriter.write({
          type: "data-cc-tool-progress",
          data: {
            toolUseId: m.tool_use_id,
            toolName: m.tool_name,
            elapsedSeconds: m.elapsed_time_seconds,
            taskId: m.task_id,
          },
          transient: true,
        } as any);
      }
      continue;
    }

    // --- 系统初始化 ---
    if (message.type === "system" && (message as any).subtype === "init") {
      if (uiWriter) {
        const m = message as any;
        uiWriter.write({
          type: "data-cc-init",
          data: {
            model: m.model,
            tools: m.tools,
            mcpServers: m.mcp_servers,
            claudeCodeVersion: m.claude_code_version,
            permissionMode: m.permissionMode,
            cwd: m.cwd,
          },
          transient: true,
        } as any);
      }
      continue;
    }

    // --- 状态变化（compacting 等）---
    if (message.type === "system" && (message as any).subtype === "status") {
      if (uiWriter) {
        uiWriter.write({
          type: "data-cc-status",
          data: { status: (message as any).status },
          transient: true,
        } as any);
      }
      continue;
    }

    // --- 子任务生命周期 ---
    if (message.type === "system" && (message as any).subtype === "task_started") {
      if (uiWriter) {
        const m = message as any;
        uiWriter.write({
          type: "data-cc-task-started",
          data: { taskId: m.task_id, description: m.description, taskType: m.task_type },
          transient: true,
        } as any);
      }
      continue;
    }

    if (message.type === "system" && (message as any).subtype === "task_progress") {
      if (uiWriter) {
        const m = message as any;
        uiWriter.write({
          type: "data-cc-task-progress",
          data: { taskId: m.task_id, description: m.description, lastToolName: m.last_tool_name, usage: m.usage },
          transient: true,
        } as any);
      }
      continue;
    }

    if (message.type === "system" && (message as any).subtype === "task_notification") {
      if (uiWriter) {
        const m = message as any;
        uiWriter.write({
          type: "data-cc-task-done",
          data: { taskId: m.task_id, status: m.status, summary: m.summary, usage: m.usage },
          transient: true,
        } as any);
      }
      continue;
    }

    // --- 速率限制 ---
    if (message.type === "rate_limit_event") {
      if (uiWriter) {
        const info = (message as any).rate_limit_info;
        uiWriter.write({
          type: "data-cc-rate-limit",
          data: { status: info?.status, resetsAt: info?.resetsAt, utilization: info?.utilization },
          transient: true,
        } as any);
      }
      continue;
    }

    // --- 工具使用摘要（用于 UI 展示 + 持久化）---
    if (message.type === "tool_use_summary") {
      const summary = (message as any).summary;
      if (summary) {
        const cleaned = stripAnsiControlSequences(summary);
        appendCliSummary(cleaned);
        if (uiWriter) {
          uiWriter.write({
            type: "data-cli-thinking-delta",
            data: { toolCallId: "cc-summary", delta: cleaned },
          } as any);
        }
      }
      continue;
    }

    // --- 最终结果 ---
    if (message.type === "result") {
      const result = message as any;
      if (result.usage) {
        usage = buildUsageFromResult({
          input_tokens: result.usage.input_tokens ?? 0,
          output_tokens: result.usage.output_tokens ?? 0,
          cache_read_input_tokens: result.usage.cache_read_input_tokens,
          cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
        });
      }
      if (result.subtype === "success" && result.result && !textId) {
        textId = `cc-text-${sessionId ?? "0"}`;
        yield { type: "text-start", id: textId };
        yield { type: "text-delta", id: textId, delta: result.result };
      }
      if (uiWriter) {
        uiWriter.write({
          type: "data-cc-result",
          data: {
            subtype: result.subtype,
            totalCostUsd: result.total_cost_usd,
            numTurns: result.num_turns,
            durationMs: result.duration_ms,
            errors: result.errors ?? [],
            permissionDenials: (result.permission_denials ?? []).map((d: any) => ({ toolName: d.tool_name })),
          },
          transient: true,
        } as any);
      }
      break;
    }

    // --- 兜底 ---
    if (
      message.type === "system" ||
      message.type === "user" ||
      message.type === "auth_status" ||
      message.type === "prompt_suggestion"
    ) {
      continue;
    }
  }

  if (textId) {
    yield { type: "text-end", id: textId };
  }
  yield { type: "finish", usage, finishReason: STOP_FINISH_REASON };
}

/** Create a stream of AI SDK parts from Claude Code Agent SDK events. */
async function* createClaudeCodeStream(
  input: ClaudeCodeLanguageModelInput,
  options: LanguageModelV3CallOptions,
): AsyncGenerator<LanguageModelV3StreamPart> {
  // 逻辑：动态导入 SDK，避免顶层加载时 CLI 未安装导致崩溃。
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const sessionId = getSessionId();
  const promptText = extractPromptText(options.prompt);
  if (!promptText) {
    throw new Error("Claude Code 输入为空：缺少用户内容");
  }

  const cwd = resolveWorkingDirectory();
  const uiWriter = getUiWriter();
  const sdkEnv = buildSdkEnv(input);

  const abortController = new AbortController();
  const abortSignal = options.abortSignal;
  if (abortSignal) {
    const handler = () => abortController.abort();
    abortSignal.addEventListener("abort", handler, { once: true });
  }

  // ── 会话持久化：从 RequestContext 读取 cliSessionId / cliSessionPreface ──
  const cliSessionId = getCliSessionId();
  const cliPreface = getCliSessionPreface();
  const isResume = !!cliSessionId && !cliPreface;

  // prompt：首条消息带 preface，后续只发用户文本
  const finalPrompt = cliPreface
    ? `${cliPreface}\n\n${promptText}`
    : promptText;

  logger.debug(
    { sessionId, modelId: input.modelId, cwd, cliSessionId, isResume },
    "[cli] claude-code stream start",
  );

  const baseOptions = {
    cwd,
    model: input.modelId,
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    maxTurns: 50,
    env: sdkEnv,
    abortController,
    persistSession: true,
  };

  try {
    yield { type: "stream-start", warnings: EMPTY_WARNINGS };

    let queryStream = query({
      prompt: finalPrompt,
      options: {
        ...baseOptions,
        ...(isResume
          ? { resume: cliSessionId }
          : cliSessionId
            ? { sessionId: cliSessionId }
            : {}),
      },
    });

    // 存储 Query 引用供外部 tRPC 路由调用（如 answerClaudeCodeQuestion）
    if (sessionId) {
      setActiveQuery(sessionId, queryStream);
    }

    try {
      yield* processQueryStream(queryStream, sessionId, uiWriter);
    } catch (error) {
      // ── resume 失败降级：新建会话重试 ──
      if (isResume && isSessionNotFoundError(error)) {
        logger.warn(
          { sessionId, cliSessionId, error },
          "[cli] resume failed, falling back to new session",
        );
        const newId = crypto.randomUUID();
        const preface = sessionId ? await resolveSessionPrefaceText(sessionId) : "";
        const fallbackPrompt = preface ? `${preface}\n\n${promptText}` : promptText;

        queryStream = query({
          prompt: fallbackPrompt,
          options: { ...baseOptions, sessionId: newId },
        });

        if (sessionId) {
          setActiveQuery(sessionId, queryStream);
        }

        // 更新 DB + 缓存
        if (sessionId) {
          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { cliId: `claude-code_${newId}` },
          });
          clearCachedCcSession(sessionId);
          setCachedCcSession(sessionId, {
            sdkSessionId: newId,
            modelId: input.modelId,
            lastUsedAt: Date.now(),
          });
          setCliSession(newId, preface || undefined);
        }

        yield* processQueryStream(queryStream, sessionId, uiWriter);
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error({ error, sessionId }, "[cli] claude-code stream error");
    throw error;
  } finally {
    if (sessionId) clearActiveQuery(sessionId);
  }
}

// ─── Plan file helpers ──────────────────────────────────────────────────

function isPlanFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== "string") return false;
  return filePath.includes("/.claude/plans/") || filePath.includes(".claude/plans/");
}

function extractPlanFileName(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? "plan.md";
}
