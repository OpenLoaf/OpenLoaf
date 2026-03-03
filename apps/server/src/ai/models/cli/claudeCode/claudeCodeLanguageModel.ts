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
import { execa } from "execa";
import { logger } from "@/common/logger";
import crypto from "node:crypto";
import { prisma } from "@openloaf/db";
import {
  appendCliSummary,
  getCliSessionId,
  getCliSessionPreface,
  getProjectId,
  getSessionId,
  getWorkspaceId,
  setCliSession,
} from "@/ai/shared/context/requestContext";
import { resolveSessionPrefaceText } from "@/ai/services/chat/repositories/messageStore";
import { clearActiveQuery } from "./activeQueries";
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

/** JSON output from `claude --output-format json`. */
type ClaudeCliJsonOutput = {
  type: string;
  subtype?: string;
  result?: string;
  session_id?: string;
  is_error?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
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

/** Map CLI result usage to AI SDK usage. */
function buildUsageFromResult(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
} | null | undefined): LanguageModelV3Usage {
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

/** Build env overrides for the Claude Code CLI subprocess. */
function buildCliEnv(input: ClaudeCodeLanguageModelInput): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  if (input.forceCustomApiKey && input.apiKey.trim()) {
    // 用户提供了自定义 API Key，保留并覆盖
    env.ANTHROPIC_API_KEY = input.apiKey.trim();
  } else {
    // 清除 API Key，让 claude CLI 使用自己的 OAuth 认证
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_API_KEY_OLD;
  }

  if (input.forceCustomApiKey && input.apiUrl.trim()) {
    env.ANTHROPIC_BASE_URL = input.apiUrl.trim();
  }

  return env;
}

/** Parse the JSON output from `claude --output-format json`. */
function parseClaudeCliOutput(stdout: string): ClaudeCliJsonOutput {
  const trimmed = stdout.trim();
  // 找最后一个完整 JSON 对象（claude 可能输出多行）
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") return parsed as ClaudeCliJsonOutput;
    } catch {
      // 继续往前找
    }
  }
  // 尝试整体解析
  try {
    return JSON.parse(trimmed) as ClaudeCliJsonOutput;
  } catch {
    throw new Error(`无法解析 claude CLI 输出：${trimmed.slice(0, 200)}`);
  }
}

/** Build a LanguageModelV3 instance backed by Claude Code CLI subprocess. */
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

/** Check whether an error indicates the session was not found (for resume fallback). */
function isSessionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("session") && (msg.includes("not found") || msg.includes("does not exist"));
}

/** Execute one claude CLI turn and yield AI SDK stream parts. */
async function* executeCLITurn(
  input: ClaudeCodeLanguageModelInput,
  promptText: string,
  cwd: string,
  cliSessionId: string | undefined,
  isResume: boolean,
  sessionId: string | undefined,
): AsyncGenerator<LanguageModelV3StreamPart> {
  const cliEnv = buildCliEnv(input);
  const args: string[] = [
    "-p",
    "--output-format", "json",
    "--dangerously-skip-permissions",
    "--model", input.modelId,
  ];

  if (isResume && cliSessionId) {
    args.push("--resume", cliSessionId);
  } else if (cliSessionId) {
    args.push("--session-id", cliSessionId);
  }

  args.push(promptText);

  logger.info(
    {
      sessionId,
      modelId: input.modelId,
      cwd,
      cliSessionId,
      isResume,
      args: args.map((a, i) => (i === args.length - 1 ? a.slice(0, 80) : a)),
    },
    "[cli] spawn: claude",
  );

  const proc = execa("claude", args, {
    cwd,
    env: cliEnv as Record<string, string>,
    all: true,
    reject: false,
  });

  // 支持 abortSignal
  // (execa 在调用方 cancel 时自然结束)

  const result = await proc;

  const stdout = (result.stdout ?? result.all ?? "").trim();
  const stderr = result.stderr ?? "";

  if (result.exitCode !== 0 && !stdout) {
    logger.error({ sessionId, exitCode: result.exitCode, stderr }, "[cli] claude exited with error");
    throw new Error(`claude CLI 退出码 ${result.exitCode}: ${stderr.slice(0, 300)}`);
  }

  if (stderr) {
    logger.debug({ sessionId, stderr: stderr.slice(0, 300) }, "[cli] claude stderr");
  }

  const parsed = parseClaudeCliOutput(stdout);

  logger.info(
    {
      sessionId,
      type: parsed.type,
      subtype: parsed.subtype,
      isError: parsed.is_error,
      outputSessionId: parsed.session_id,
      numTurns: parsed.num_turns,
      durationMs: parsed.duration_ms,
    },
    "[cli] claude result",
  );

  if (parsed.is_error) {
    throw new Error(`claude CLI 返回错误：${parsed.result ?? "unknown error"}`);
  }

  // 更新 session store
  if (parsed.session_id && sessionId) {
    clearCachedCcSession(sessionId);
    setCachedCcSession(sessionId, {
      sdkSessionId: parsed.session_id,
      modelId: input.modelId,
      lastUsedAt: Date.now(),
    });
    setCliSession(parsed.session_id, undefined);
  }

  // 如果有 tool_use_summary，写入摘要
  // (CLI 模式下 tool 调用摘要通过 result 字段返回，这里直接使用 result 文本)

  const resultText = parsed.result ?? "";
  if (resultText) {
    appendCliSummary(resultText);
  }

  const textId = `cc-text-${sessionId ?? "0"}`;
  if (resultText) {
    yield { type: "text-start", id: textId };
    yield { type: "text-delta", id: textId, delta: resultText };
    yield { type: "text-end", id: textId };
  }

  yield {
    type: "finish",
    usage: buildUsageFromResult(parsed.usage),
    finishReason: STOP_FINISH_REASON,
  };
}

/** Create a stream of AI SDK parts by spawning the Claude Code CLI. */
async function* createClaudeCodeStream(
  input: ClaudeCodeLanguageModelInput,
  options: LanguageModelV3CallOptions,
): AsyncGenerator<LanguageModelV3StreamPart> {
  const sessionId = getSessionId();
  const promptText = extractPromptText(options.prompt);
  if (!promptText) {
    throw new Error("Claude Code 输入为空：缺少用户内容");
  }

  const cwd = resolveWorkingDirectory();

  // ── 会话持久化：从 RequestContext 读取 cliSessionId / cliSessionPreface ──
  const cliSessionId = getCliSessionId();
  const cliPreface = getCliSessionPreface();
  const isResume = !!cliSessionId && !cliPreface;

  // prompt：首条消息带 preface，后续只发用户文本
  const finalPrompt = cliPreface
    ? `${cliPreface}\n\n${promptText}`
    : promptText;

  const hasCustomKey = !!(input.forceCustomApiKey && input.apiKey.trim());
  const hasCustomUrl = !!(input.forceCustomApiKey && input.apiUrl.trim());
  logger.info(
    {
      sessionId,
      modelId: input.modelId,
      cwd,
      cliSessionId,
      isResume,
      hasCustomKey,
      hasCustomUrl,
      promptPreview: finalPrompt.slice(0, 100),
    },
    "[cli] claude-code stream start",
  );

  try {
    yield { type: "stream-start", warnings: EMPTY_WARNINGS };

    try {
      yield* executeCLITurn(input, finalPrompt, cwd, cliSessionId, isResume, sessionId);
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

        yield* executeCLITurn(input, fallbackPrompt, cwd, newId, false, sessionId);
      } else {
        throw error;
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { sessionId, modelId: input.modelId, cwd, cliSessionId, isResume, errMsg, errStack },
      "[cli] claude-code stream error",
    );
    throw error;
  } finally {
    if (sessionId) clearActiveQuery(sessionId);
  }
}

