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
import { createHash } from "crypto";
import { logger } from "@/common/logger";
import { getProjectId, getSessionId, getWorkspaceId } from "@/ai/chat-stream/requestContext";
import { getProjectRootPath, getWorkspaceRootPathById } from "@teatime-ai/api/services/vfsService";
import { getCodexAppServerConnection } from "@/ai/models/cli/codex/codexAppServerConnection";
import {
  getCachedCodexThread,
  setCachedCodexThread,
} from "@/ai/models/cli/codex/codexThreadStore";

/** Prompt part union used for Codex prompt serialization. */
type CliPromptPart =
  | LanguageModelV3TextPart
  | LanguageModelV3ReasoningPart
  | LanguageModelV3FilePart
  | LanguageModelV3ToolCallPart
  | LanguageModelV3ToolResultPart
  | LanguageModelV3ToolApprovalResponsePart;

type CodexThreadResolution = {
  /** Thread id for the session. */
  threadId: string;
  /** Thread origin mode. */
  mode: "cache" | "start";
  /** Last model id for the thread. */
  modelId: string;
  /** Hash of config used by the thread. */
  configHash: string;
};

type CodexAppServerLanguageModelInput = {
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

type CodexThreadStartResponse = {
  thread?: { id?: string } | null;
};

type CodexTurnStartResponse = {
  turn?: { id?: string } | null;
};

type CodexServerNotification = {
  method: string;
  params?: Record<string, unknown>;
};

/** Default empty warnings payload. */
const EMPTY_WARNINGS: SharedV3Warning[] = [];
/** Default sandbox mode for Codex. */
const DEFAULT_SANDBOX_MODE = "read-only";
/** Default reasoning effort for Codex. */
const DEFAULT_REASONING_EFFORT = "medium";
/** Default approval policy for Codex. */
const DEFAULT_APPROVAL_POLICY = "never";
/** Custom provider id for Codex CLI. */
const CODEX_CUSTOM_PROVIDER_ID = "codex_cli_custom";
/** Custom provider display name for Codex CLI. */
const CODEX_CUSTOM_PROVIDER_NAME = "Codex CLI";

/** Build a prompt string from AI SDK prompt. */
function buildCodexPromptText(prompt: LanguageModelV3Prompt): string {
  const lines: string[] = [];
  // 逻辑：按 role 顺序拼接消息，适配 Codex app-server 的 text input。
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

/** Build a hash of the Codex config for cache invalidation. */
function buildConfigHash(input: CodexAppServerLanguageModelInput): string {
  const payload = {
    apiUrl: input.forceCustomApiKey ? input.apiUrl.trim() : "",
    apiKey: input.forceCustomApiKey ? input.apiKey.trim() : "",
    forceCustomApiKey: input.forceCustomApiKey,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** Build Codex config and model provider metadata. */
function buildCodexConfig(input: CodexAppServerLanguageModelInput): {
  config: Record<string, unknown> | null;
  modelProvider: string | null;
} {
  if (!input.forceCustomApiKey) {
    return { config: null, modelProvider: null };
  }
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Codex 缺少 API Key");
  const apiUrl = input.apiUrl.trim();
  const providerConfig: Record<string, unknown> = {
    name: CODEX_CUSTOM_PROVIDER_NAME,
    experimental_bearer_token: apiKey,
    wire_api: "responses",
  };
  if (apiUrl) providerConfig.base_url = apiUrl;
  const config: Record<string, unknown> = {
    model_provider: CODEX_CUSTOM_PROVIDER_ID,
    [`model_providers.${CODEX_CUSTOM_PROVIDER_ID}`]: providerConfig,
  };
  return { config, modelProvider: CODEX_CUSTOM_PROVIDER_ID };
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

/** Resolve prompt text based on whether a thread already exists. */
function resolvePromptText(prompt: LanguageModelV3Prompt): string {
  const incremental = buildCodexIncrementalPrompt(prompt);
  if (!incremental) {
    throw new Error("Codex 输入为空：缺少用户内容");
  }
  return incremental;
}

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

/** Map token usage notification into AI SDK usage. */
function buildUsageFromTokenUsage(tokenUsage: Record<string, unknown> | null | undefined):
  LanguageModelV3Usage {
  if (!tokenUsage) return buildEmptyUsage();
  const last = tokenUsage.last as Record<string, unknown> | undefined;
  if (!last) return buildEmptyUsage();
  const inputTotal = typeof last.inputTokens === "number" ? last.inputTokens : undefined;
  const cachedInput =
    typeof last.cachedInputTokens === "number" ? last.cachedInputTokens : undefined;
  const outputTotal =
    typeof last.outputTokens === "number" ? last.outputTokens : undefined;
  const reasoningOutput =
    typeof last.reasoningOutputTokens === "number" ? last.reasoningOutputTokens : undefined;
  const inputNoCache =
    inputTotal !== undefined && cachedInput !== undefined
      ? Math.max(inputTotal - cachedInput, 0)
      : undefined;
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputNoCache,
      cacheRead: cachedInput,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: reasoningOutput,
    },
  };
}

/** Async queue for streaming notifications. */
class AsyncQueue<T> {
  /** Buffered items. */
  private items: T[] = [];
  /** Pending resolvers. */
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  /** Closed flag. */
  private closed = false;

  /** Push a new item into the queue. */
  push(item: T): void {
    if (this.closed) return;
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  /** Close the queue and resolve pending waits. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      if (resolver) resolver({ value: undefined as T, done: true });
    }
  }

  /** Create an async iterator for the queue. */
  async *iterate(): AsyncGenerator<T> {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift() as T;
        continue;
      }
      if (this.closed) return;
      const item = await new Promise<IteratorResult<T>>((resolve) => {
        this.resolvers.push(resolve);
      });
      if (item.done) return;
      yield item.value;
    }
  }
}

/** Resolve or start a Codex thread for the current session. */
async function resolveCodexThread(
  input: CodexAppServerLanguageModelInput,
  sessionId: string | undefined,
): Promise<CodexThreadResolution> {
  const configHash = buildConfigHash(input);
  const cached = sessionId ? getCachedCodexThread(sessionId, configHash) : null;
  if (cached) {
    logger.debug(
      { sessionId, threadId: cached.threadId, modelId: cached.modelId },
      "[cli] codex thread cache",
    );
    return {
      threadId: cached.threadId,
      modelId: cached.modelId,
      mode: "cache",
      configHash,
    };
  }
  const { config, modelProvider } = buildCodexConfig(input);
  const response = await getCodexAppServerConnection().sendRequest<CodexThreadStartResponse>(
    "thread/start",
    {
      cwd: resolveCodexWorkingDirectory(),
      model: input.modelId,
      modelProvider,
      config,
      approvalPolicy: DEFAULT_APPROVAL_POLICY,
      baseInstructions: null,
      developerInstructions: null,
      sandbox: DEFAULT_SANDBOX_MODE,
      experimentalRawEvents: false,
    },
  );
  const threadId = response?.thread?.id;
  if (!threadId) throw new Error("Codex thread 启动失败：缺少 thread id");
  logger.debug(
    { sessionId, threadId, modelId: input.modelId },
    "[cli] codex thread start",
  );
  if (sessionId) {
    setCachedCodexThread(sessionId, {
      threadId,
      modelId: input.modelId,
      configHash,
      lastUsedAt: Date.now(),
    });
  }
  return { threadId, modelId: input.modelId, mode: "start", configHash };
}

/** Build a LanguageModelV3 instance backed by Codex app-server. */
export function buildCodexAppServerLanguageModel(
  input: CodexAppServerLanguageModelInput,
): LanguageModelV3 {
  const supportedUrls: Record<string, RegExp[]> = {};

  return {
    specificationVersion: "v3",
    provider: input.providerId,
    modelId: input.modelId,
    supportedUrls,
    async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      const result = await runCodexTurn(input, options);
      return {
        content: result.text ? [{ type: "text", text: result.text }] : [],
        finishReason: "stop",
        usage: result.usage,
        warnings: EMPTY_WARNINGS,
      };
    },
    async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
      const stream = createCodexStream(input, options);
      return { stream: convertAsyncIteratorToReadableStream(stream) };
    },
  };
}

type CodexTurnResult = {
  /** Final response text. */
  text: string;
  /** Usage result. */
  usage: LanguageModelV3Usage;
};

/** Run a Codex turn and collect the final response. */
async function runCodexTurn(
  input: CodexAppServerLanguageModelInput,
  options: LanguageModelV3CallOptions,
): Promise<CodexTurnResult> {
  let text = "";
  let usage = buildEmptyUsage();
  for await (const part of createCodexStream(input, options)) {
    if (part.type === "text-delta") {
      text += part.delta;
    }
    if (part.type === "finish") {
      usage = part.usage;
    }
  }
  return { text, usage };
}

/** Create a stream of AI SDK parts from Codex app-server events. */
async function* createCodexStream(
  input: CodexAppServerLanguageModelInput,
  options: LanguageModelV3CallOptions,
): AsyncGenerator<LanguageModelV3StreamPart> {
  const sessionId = getSessionId();
  const { threadId, configHash, modelId: cachedModelId } = await resolveCodexThread(
    input,
    sessionId,
  );
  const promptText = resolvePromptText(options.prompt);
  const connection = getCodexAppServerConnection();
  const queue = new AsyncQueue<CodexServerNotification>();

  let turnId: string | null = null;
  let usage = buildEmptyUsage();
  let textId: string | null = null;
  let shouldInterrupt = false;
  const commandOutputByItem = new Map<string, string>();
  const toolCallIdByItem = new Map<string, string>();

  const unsubscribe = connection.subscribeNotifications((notification) => {
    const params = notification.params ?? {};
    const paramsThreadId = typeof params.threadId === "string" ? params.threadId : null;
    if (paramsThreadId && paramsThreadId !== threadId) return;
    const paramsTurnId = typeof params.turnId === "string" ? params.turnId : null;
    if (turnId && paramsTurnId && paramsTurnId !== turnId) return;
    queue.push(notification);
  });

  const abortSignal = options.abortSignal;
  const abortHandler = () => {
    shouldInterrupt = true;
    if (turnId) {
      void connection.sendRequest("turn/interrupt", { threadId, turnId });
    }
  };
  if (abortSignal) {
    abortSignal.addEventListener("abort", abortHandler, { once: true });
  }

  const resolvedModel = cachedModelId === input.modelId ? null : input.modelId;
  const turnResponse = await connection.sendRequest<CodexTurnStartResponse>("turn/start", {
    threadId,
    input: [{ type: "text", text: promptText }],
    cwd: resolveCodexWorkingDirectory(),
    model: resolvedModel,
    effort: DEFAULT_REASONING_EFFORT,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
  });
  turnId = turnResponse?.turn?.id ?? null;
  if (!turnId) {
    unsubscribe();
    throw new Error("Codex turn 启动失败：缺少 turn id");
  }

  logger.debug(
    { sessionId, threadId, turnId, modelId: input.modelId },
    "[cli] codex turn start",
  );

  if (sessionId) {
    setCachedCodexThread(sessionId, {
      threadId,
      modelId: input.modelId,
      configHash,
      lastUsedAt: Date.now(),
    });
  }

  if (shouldInterrupt) {
    void connection.sendRequest("turn/interrupt", { threadId, turnId });
  }

  try {
    yield { type: "stream-start", warnings: EMPTY_WARNINGS };
    for await (const notification of queue.iterate()) {
      const { method, params = {} } = notification;
      if (method === "thread/tokenUsage/updated") {
        const tokenUsage = params.tokenUsage as Record<string, unknown> | undefined;
        usage = buildUsageFromTokenUsage(tokenUsage);
        continue;
      }
      if (method === "item/agentMessage/delta") {
        const delta = typeof params.delta === "string" ? params.delta : "";
        const itemId = typeof params.itemId === "string" ? params.itemId : "text";
        if (!delta) continue;
        if (!textId) {
          textId = itemId;
          yield { type: "text-start", id: textId };
        }
        yield { type: "text-delta", id: textId, delta };
        continue;
      }
      if (method === "item/commandExecution/outputDelta") {
        const itemId = typeof params.itemId === "string" ? params.itemId : null;
        const delta = typeof params.delta === "string" ? params.delta : "";
        if (!itemId || !delta) continue;
        const nextOutput = `${commandOutputByItem.get(itemId) ?? ""}${delta}`;
        commandOutputByItem.set(itemId, nextOutput);
        logger.debug({ itemId, delta }, "[cli] codex command output");
        continue;
      }
      if (method === "item/completed") {
        const item = params.item as Record<string, unknown> | undefined;
        if (item?.type === "commandExecution") {
          const rawItemId = item.id;
          const itemId =
            typeof rawItemId === "string"
              ? rawItemId
              : typeof rawItemId === "number"
                ? String(rawItemId)
                : null;
          const command = typeof item.command === "string" ? item.command : "";
          const exitCode = typeof item.exitCode === "number" ? item.exitCode : undefined;
          const aggregatedOutput =
            typeof item.aggregatedOutput === "string"
              ? item.aggregatedOutput
              : itemId
                ? commandOutputByItem.get(itemId) ?? ""
                : "";
          if (itemId) {
            const toolCallId = toolCallIdByItem.get(itemId) ?? `codex-cmd:${itemId}`;
            toolCallIdByItem.set(itemId, toolCallId);
            const inputPayload = JSON.stringify({
              command,
              cwd: resolveCodexWorkingDirectory(),
            });
            yield {
              type: "tool-call",
              toolCallId,
              toolName: "shell",
              input: inputPayload,
              providerExecuted: true,
            };
            const outputPayload: Record<string, unknown> = { output: aggregatedOutput };
            if (typeof exitCode === "number") {
              outputPayload.exitCode = exitCode;
            }
            const isError = typeof exitCode === "number" ? exitCode !== 0 : false;
            yield {
              type: "tool-result",
              toolCallId,
              toolName: "shell",
              result: outputPayload,
              output: outputPayload,
              isError: isError || undefined,
            } as LanguageModelV3StreamPart;
            toolCallIdByItem.delete(itemId);
            commandOutputByItem.delete(itemId);
          }
          logger.debug(
            { command, exitCode, output: aggregatedOutput },
            "[cli] codex command",
          );
        }
        continue;
      }
      if (method === "turn/completed") {
        break;
      }
      if (method === "error") {
        const error = params.error as Record<string, unknown> | undefined;
        const message = typeof error?.message === "string" ? error.message : "Codex 运行失败";
        throw new Error(message);
      }
    }
    if (textId) {
      yield { type: "text-end", id: textId };
    }
    yield { type: "finish", usage, finishReason: "stop" };
  } finally {
    queue.close();
    unsubscribe();
    if (abortSignal) abortSignal.removeEventListener("abort", abortHandler);
  }
}
