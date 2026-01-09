import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3TextPart,
  LanguageModelV3ReasoningPart,
  LanguageModelV3FilePart,
  LanguageModelV3ToolCallPart,
  LanguageModelV3ToolResultPart,
  LanguageModelV3ToolApprovalResponsePart,
  LanguageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import { convertAsyncIteratorToReadableStream } from "@ai-sdk/provider-utils";
import { Codex, type ThreadOptions, type Usage } from "@openai/codex-sdk";
import { logger } from "@/common/logger";
import { getProjectId, getSessionId, getWorkspaceId } from "@/ai/chat-stream/requestContext";
import { getCliThreadInfo, setCliThreadInfo } from "@/ai/models/cli/cliThreadStore";
import { getProjectRootPath, getWorkspaceRootPathById } from "@teatime-ai/api/services/vfsService";

/** Prompt part union used for CLI prompt serialization. */
type CliPromptPart =
  | LanguageModelV3TextPart
  | LanguageModelV3ReasoningPart
  | LanguageModelV3FilePart
  | LanguageModelV3ToolCallPart
  | LanguageModelV3ToolResultPart
  | LanguageModelV3ToolApprovalResponsePart;

export type CodexSdkLanguageModelInput = {
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

/** Default empty warnings payload. */
const EMPTY_WARNINGS: SharedV3Warning[] = [];
/** Codex cli type prefix. */
const CODEX_CLI_TYPE = "codex";
/** Default sandbox mode for Codex. */
const DEFAULT_SANDBOX_MODE: ThreadOptions["sandboxMode"] = "read-only";
/** Default reasoning effort for Codex. */
const DEFAULT_REASONING_EFFORT: ThreadOptions["modelReasoningEffort"] = "medium";

/** Build a prompt string from AI SDK prompt. */
function buildCodexPromptText(prompt: LanguageModelV3Prompt): string {
  const lines: string[] = [];
  // 逻辑：按 role 顺序拼接消息，适配 Codex SDK 的 text input。
  for (const message of prompt) {
    if (message.role === "system") {
      const content = message.content.trim();
      if (content) lines.push(`System: ${content}`);
      continue;
    }
    const rawParts = Array.isArray(message.content) ? message.content : [];
    const parts = rawParts as CliPromptPart[];
    const content = extractPartsText(parts);
    if (!content) continue;
    if (message.role === "user") lines.push(`User: ${content}`);
    else if (message.role === "assistant") lines.push(`Assistant: ${content}`);
    else lines.push(`Tool: ${content}`);
  }
  return lines.join("\n").trim();
}

/** Build incremental prompt text for an existing thread. */
function buildCodexIncrementalPrompt(prompt: LanguageModelV3Prompt): string {
  const latestUserText = extractLatestUserText(prompt);
  if (!latestUserText) return "";
  // 逻辑：续聊只发送最新 user 指令，避免重复注入上下文。
  return `User: ${latestUserText}`;
}

/** Extract the latest user text from a prompt. */
function extractLatestUserText(prompt: LanguageModelV3Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i -= 1) {
    const message = prompt[i];
    if (!message || message.role !== "user") continue;
    const rawParts = Array.isArray(message.content) ? message.content : [];
    const parts = rawParts as CliPromptPart[];
    return extractPartsText(parts);
  }
  return "";
}

/** Extract displayable text from prompt parts. */
function extractPartsText(parts: CliPromptPart[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" || part.type === "reasoning") {
      chunks.push(part.text);
      continue;
    }
    if (part.type === "tool-call") {
      const payload = safeJsonStringify(part.input);
      chunks.push(`ToolCall(${part.toolName}): ${payload}`);
      continue;
    }
    if (part.type === "tool-result") {
      const payload = safeJsonStringify(part.output);
      const name = part.toolName ? `(${part.toolName})` : "";
      chunks.push(`ToolResult${name}: ${payload}`);
      continue;
    }
    if (part.type === "tool-approval-response") {
      chunks.push(
        `ToolApproval(${part.approvalId}): ${part.approved ? "approved" : "rejected"}`,
      );
      continue;
    }
    if (part.type === "file") {
      // 逻辑：避免把文件内容直接拼进 prompt。
      const label = part.filename || part.mediaType || "file";
      chunks.push(`[${label}]`);
    }
  }
  return chunks.join("\n").trim();
}

/** Safely stringify an input for prompt display. */
function safeJsonStringify(value: unknown): string {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? encoded : String(value ?? "");
  } catch {
    return String(value ?? "");
  }
}

/** Build a zeroed usage payload when token counts are unavailable. */
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

/** Map Codex SDK usage into AI SDK usage. */
function buildUsageFromCodex(usage: Usage | null | undefined): LanguageModelV3Usage {
  if (!usage) return buildEmptyUsage();
  const inputTotal = usage.input_tokens ?? undefined;
  const inputCached = usage.cached_input_tokens ?? undefined;
  const inputNoCache =
    inputTotal !== undefined && inputCached !== undefined
      ? Math.max(inputTotal - inputCached, 0)
      : undefined;
  const outputTotal = usage.output_tokens ?? undefined;
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputNoCache,
      cacheRead: inputCached,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: undefined,
    },
  };
}

/** Build a Codex SDK client based on provider settings. */
function buildCodexClient(input: CodexSdkLanguageModelInput): Codex {
  if (!input.forceCustomApiKey) return new Codex();
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Codex SDK 缺少 API Key");
  const baseUrl = input.apiUrl.trim();
  return new Codex({
    apiKey,
    baseUrl: baseUrl ? baseUrl : undefined,
  });
}

/** Resolve thread id for the current session. */
async function resolveCodexThreadId(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const info = await getCliThreadInfo(sessionId);
  if (!info) return null;
  // 逻辑：会话已绑定其他 CLI 时直接拒绝，避免跨 provider 复用。
  if (info.cliType !== CODEX_CLI_TYPE) {
    throw new Error(`当前会话已绑定 CLI: ${info.cliType}，不允许切换 provider`);
  }
  return info.threadId;
}

/** Resolve the working directory for Codex execution. */
function resolveCodexWorkingDirectory(): string {
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
  throw new Error("Codex 运行路径缺失：未找到 project 或 workspace 根目录");
}

/** Build the thread options for Codex execution. */
function buildThreadOptions(modelId: string): ThreadOptions {
  // 逻辑：保持 read-only 运行，默认中等推理强度。
  return {
    model: modelId,
    sandboxMode: DEFAULT_SANDBOX_MODE,
    skipGitRepoCheck: true,
    workingDirectory: resolveCodexWorkingDirectory(),
    modelReasoningEffort: DEFAULT_REASONING_EFFORT,
  };
}

/** Resolve prompt text based on whether a thread already exists. */
function resolvePromptText(prompt: LanguageModelV3Prompt, hasThread: boolean): string {
  const fullPrompt = buildCodexPromptText(prompt);
  if (!hasThread) return fullPrompt;
  const incremental = buildCodexIncrementalPrompt(prompt);
  // 逻辑：续聊缺少 user 输入时回退到全量 prompt。
  return incremental || fullPrompt;
}

/** Persist thread id for the current session. */
async function persistThreadId(
  sessionId: string | undefined,
  threadId: string | null,
): Promise<void> {
  if (!sessionId || !threadId) return;
  await setCliThreadInfo(sessionId, CODEX_CLI_TYPE, threadId);
}

/** Build a LanguageModelV3 instance backed by Codex SDK. */
export function buildCodexSdkLanguageModel(
  input: CodexSdkLanguageModelInput,
): LanguageModelV3 {
  const supportedUrls: Record<string, RegExp[]> = {};

  return {
    specificationVersion: "v3",
    provider: input.providerId,
    modelId: input.modelId,
    supportedUrls,
    async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      const sessionId = getSessionId();
      const threadId = await resolveCodexThreadId(sessionId);
      const codex = buildCodexClient(input);
      const threadOptions = buildThreadOptions(input.modelId);
      const thread = threadId
        ? codex.resumeThread(threadId, threadOptions)
        : codex.startThread(threadOptions);
      const promptText = resolvePromptText(options.prompt, Boolean(threadId));

      logger.debug(
        {
          sessionId,
          providerId: input.providerId,
          modelId: input.modelId,
          threadId: threadId ?? undefined,
          mode: threadId ? "resume" : "start",
        },
        "[cli] codex sdk run",
      );

      const turn = await thread.run(promptText, { signal: options.abortSignal });
      await persistThreadId(sessionId, thread.id);

      const text = turn.finalResponse?.trim() ?? "";
      return {
        content: text ? [{ type: "text", text }] : [],
        finishReason: "stop",
        usage: buildUsageFromCodex(turn.usage),
        warnings: EMPTY_WARNINGS,
      };
    },
    async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
      const sessionId = getSessionId();
      const threadId = await resolveCodexThreadId(sessionId);
      const codex = buildCodexClient(input);
      const threadOptions = buildThreadOptions(input.modelId);
      const thread = threadId
        ? codex.resumeThread(threadId, threadOptions)
        : codex.startThread(threadOptions);
      const promptText = resolvePromptText(options.prompt, Boolean(threadId));

      logger.debug(
        {
          sessionId,
          providerId: input.providerId,
          modelId: input.modelId,
          threadId: threadId ?? undefined,
          mode: threadId ? "resume" : "start",
        },
        "[cli] codex sdk stream",
      );

      const { events } = await thread.runStreamed(promptText, {
        signal: options.abortSignal,
      });
      const usageFallback = buildEmptyUsage();

      async function* streamIterator(): AsyncGenerator<LanguageModelV3StreamPart> {
        yield { type: "stream-start", warnings: EMPTY_WARNINGS };
        const textId = "text";
        yield { type: "text-start", id: textId };

        let latestText = "";
        let usage = usageFallback;

        for await (const event of events) {
          if (event.type === "thread.started") {
            await persistThreadId(sessionId, event.thread_id);
            continue;
          }
          if (event.type === "turn.completed") {
            usage = buildUsageFromCodex(event.usage);
            continue;
          }
          if (event.type === "turn.failed") {
            throw new Error(event.error.message);
          }
          if (event.type === "error") {
            throw new Error(event.message);
          }
          if (event.type === "item.completed" && event.item.type === "command_execution") {
            logger.debug(
              {
                command: event.item.command,
                exitCode: event.item.exit_code,
                output: event.item.aggregated_output,
              },
              "[cli] codex command",
            );
          }
          if (event.type === "item.updated" || event.type === "item.completed") {
            if (event.item.type === "agent_message") {
              const nextText = event.item.text ?? "";
              if (!nextText) continue;
              const delta = nextText.startsWith(latestText)
                ? nextText.slice(latestText.length)
                : nextText;
              latestText = nextText;
              if (delta) {
                yield { type: "text-delta", id: textId, delta };
              }
            }
          }
        }

        yield { type: "text-end", id: textId };
        yield { type: "finish", usage, finishReason: "stop" };
      }

      return {
        stream: convertAsyncIteratorToReadableStream(streamIterator()),
      };
    },
  };
}
