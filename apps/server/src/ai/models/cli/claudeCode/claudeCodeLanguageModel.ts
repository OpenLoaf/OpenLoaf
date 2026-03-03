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
import {
  getProjectId,
  getSessionId,
  getUiWriter,
  getWorkspaceId,
} from "@/ai/shared/context/requestContext";
import { getProjectRootPath, getWorkspaceRootPathById } from "@openloaf/api/services/vfsService";
import { execa } from "execa";
import { z } from "zod";
import {
  registerPendingCliQuestion,
} from "./pendingCliQuestions";

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
    if (projectRootPath) return projectRootPath;
  }
  const workspaceId = getWorkspaceId();
  if (workspaceId) {
    const workspaceRootPath = getWorkspaceRootPathById(workspaceId);
    if (workspaceRootPath) return workspaceRootPath;
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
  const env: Record<string, string | undefined> = { ...process.env };
  // 不设置 CLAUDE_AGENT_SDK_CLIENT_APP，避免 Anthropic 封禁第三方 app 标识
  delete env.CLAUDE_AGENT_SDK_CLIENT_APP;
  if (input.forceCustomApiKey && input.apiKey.trim()) {
    env.ANTHROPIC_API_KEY = input.apiKey.trim();
  } else {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_API_KEY_OLD;
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

/** Create a stream of AI SDK parts from Claude Code Agent SDK events. */
async function* createClaudeCodeStream(
  input: ClaudeCodeLanguageModelInput,
  options: LanguageModelV3CallOptions,
): AsyncGenerator<LanguageModelV3StreamPart> {
  // 逻辑：动态导入 SDK，避免顶层加载时 CLI 未安装导致崩溃。
  const { query, createSdkMcpServer } = await import("@anthropic-ai/claude-agent-sdk");

  const sessionId = getSessionId();
  const promptText = extractPromptText(options.prompt);
  if (!promptText) {
    throw new Error("Claude Code 输入为空：缺少用户内容");
  }

  const cwd = resolveWorkingDirectory();
  const uiWriter = getUiWriter();
  const sdkEnv = buildSdkEnv(input);
  const claudePath = await execa("which", ["claude"], { reject: false })
    .then((r) => r.stdout?.trim() || undefined)
    .catch(() => undefined);

  const abortController = new AbortController();
  const abortSignal = options.abortSignal;
  if (abortSignal) {
    const handler = () => abortController.abort();
    abortSignal.addEventListener("abort", handler, { once: true });
  }

  logger.debug(
    { sessionId, modelId: input.modelId, cwd },
    "[cli] claude-code stream start",
  );

  // 逻辑：必须使用 SDK 内置的 createSdkMcpServer，否则 McpServer 类不匹配，
  // connectSdkMcpServer 的 in-process transport 会静默失败（工具列表为空）。
  const currentSessionId = sessionId ?? "unknown";
  // biome-ignore lint/suspicious/noExplicitAny: SDK 的 SdkMcpToolDefinition 泛型推断与外层 z 版本不兼容
  const openloafServerConfig = (createSdkMcpServer as any)({
    name: "openloaf",
    tools: [
      {
        name: "AskUserQuestion",
        description:
          "Ask the user questions and wait for their response before continuing. Use this to gather user input, preferences, or clarifications.",
        inputSchema: {
          // 逻辑：使用简单字符串类型，避免深层嵌套 Zod schema 导致 TS 推断超限。
          questions: z
            .string()
            .describe(
              "JSON array of question objects with question, header, options[], multiSelect",
            ),
        },
        handler: async (args: { questions: string }) => {
          // 解析 questions（可能是 JSON 字符串或直接对象）
          let parsedQuestions: unknown[];
          try {
            const raw =
              typeof args.questions === "string" ? JSON.parse(args.questions) : args.questions;
            parsedQuestions = Array.isArray(raw) ? raw : [];
          } catch {
            parsedQuestions = [];
          }
          const toolUseId = `cc-ask-${Date.now()}`;
          // 推送问题到前端 SSE，让前端渲染交互 UI。
          if (uiWriter) {
            uiWriter.write({
              type: "data-cc-user-question",
              data: {
                sessionId: currentSessionId,
                toolUseId,
                questions: parsedQuestions,
                answered: false,
              },
            } as any);
          }
          logger.debug(
            { sessionId: currentSessionId, toolUseId },
            "[cli] AskUserQuestion: waiting for user answer",
          );
          // 阻塞等待前端提交答案（超时自动返回空答案）。
          const answers = await registerPendingCliQuestion(currentSessionId, toolUseId);
          logger.debug(
            { sessionId: currentSessionId, toolUseId, answers },
            "[cli] AskUserQuestion: answer received",
          );
          // 通知前端问题已回答。
          if (uiWriter) {
            uiWriter.write({
              type: "data-cc-user-question",
              data: {
                sessionId: currentSessionId,
                toolUseId,
                questions: parsedQuestions,
                answered: true,
                answers,
              },
            } as any);
          }
          return {
            content: [{ type: "text", text: JSON.stringify(answers) }],
          };
        },
      },
    ],
  });

  let usage = buildEmptyUsage();
  let textId: string | null = null;
  let toolCallCounter = 0;

  try {
    yield { type: "stream-start", warnings: EMPTY_WARNINGS };

    const queryStream = query({
      prompt: promptText,
      options: {
        cwd,
        model: input.modelId,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        env: sdkEnv,
        abortController,
        persistSession: false,
        mcpServers: {
          openloaf: openloafServerConfig,
        },
        ...(claudePath ? { pathToClaudeCodeExecutable: claudePath } : {}),
      },
    } as any);

    for await (const message of queryStream) {
      // --- 流式文本 delta ---
      if (message.type === "stream_event") {
        const event = (message as any).event;
        if (!event) continue;
        // content_block_delta → text_delta
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const delta = event.delta.text ?? "";
          if (!delta) continue;
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
            // 逻辑：如果前面没有通过 stream_event 流式发送过文本，回退为整块发送。
            if (!textId) {
              textId = `cc-text-${sessionId ?? "0"}`;
              yield { type: "text-start", id: textId };
            }
            yield { type: "text-delta", id: textId, delta: block.text };
          }
          if (block.type === "tool_use") {
            toolCallCounter += 1;
            const toolCallId = block.id ?? `cc-tool:${toolCallCounter}`;
            const toolName = block.name ?? "unknown";
            const inputPayload = JSON.stringify(block.input ?? {});
            yield {
              type: "tool-call",
              toolCallId,
              toolName,
              input: inputPayload,
              providerExecuted: true,
            };
            // 逻辑：CLI 工具已自行执行，发送空 result 标记完成。
            yield {
              type: "tool-result",
              toolCallId,
              toolName,
              result: { status: "executed_by_cli" },
              output: { status: "executed_by_cli" },
            } as LanguageModelV3StreamPart;
          }
        }
        continue;
      }

      // --- 工具使用摘要（用于 UI 展示）---
      if (message.type === "tool_use_summary") {
        const summary = (message as any).summary;
        if (summary && uiWriter) {
          uiWriter.write({
            type: "data-cli-thinking-delta",
            data: { toolCallId: "cc-summary", delta: stripAnsiControlSequences(summary) },
          } as any);
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
          // 逻辑：如果流式未产生文本但 result 有最终文本，回退发送。
          textId = `cc-text-${sessionId ?? "0"}`;
          yield { type: "text-start", id: textId };
          yield { type: "text-delta", id: textId, delta: result.result };
        }
        break;
      }
    }

    if (textId) {
      yield { type: "text-end", id: textId };
    }
    yield { type: "finish", usage, finishReason: STOP_FINISH_REASON };
  } catch (error) {
    logger.error({ error, sessionId }, "[cli] claude-code stream error");
    throw error;
  }
}
