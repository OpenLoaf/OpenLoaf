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
import { execa } from "execa";
import { logger } from "@/common/logger";
import type { CliToolId } from "@/ai/models/cli/cliToolService";

/** Prompt part union used for CLI prompt serialization. */
type CliPromptPart =
  | LanguageModelV3TextPart
  | LanguageModelV3ReasoningPart
  | LanguageModelV3FilePart
  | LanguageModelV3ToolCallPart
  | LanguageModelV3ToolResultPart
  | LanguageModelV3ToolApprovalResponsePart;

export type CliLanguageModelInput = {
  /** Provider id. */
  providerId: string;
  /** Model id. */
  modelId: string;
  /** CLI tool id. */
  toolId: CliToolId;
  /** API base URL override. */
  apiUrl: string;
  /** API key override. */
  apiKey: string;
  /** Force using custom API key. */
  forceCustomApiKey: boolean;
};

type CliExecInput = {
  /** CLI command name. */
  command: string;
  /** CLI model id. */
  modelId: string;
  /** Prompt text. */
  promptText: string;
  /** API base URL override. */
  apiUrl: string;
  /** API key override. */
  apiKey: string;
  /** Force using custom API key. */
  forceCustomApiKey: boolean;
  /** Optional abort signal. */
  abortSignal?: AbortSignal;
};

type CliExecResult = {
  /** Output text. */
  text: string;
};

/** Default empty warnings payload. */
const EMPTY_WARNINGS: SharedV3Warning[] = [];

/** Build a prompt string from AI SDK prompt. */
function buildCliPromptText(prompt: LanguageModelV3Prompt): string {
  const lines: string[] = [];
  // 逻辑：按 role 顺序拼接消息，适配 CLI 非交互执行。
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
      chunks.push(`ToolApproval(${part.approvalId}): ${part.approved ? "approved" : "rejected"}`);
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

/** Resolve CLI tool command for runtime invocation. */
function resolveCliCommand(toolId: CliToolId): string {
  if (toolId === "codex") return "codex";
  if (toolId === "claudeCode") return "claude";
  return toolId;
}

/** Check if the error indicates a missing CLI command. */
function isCommandNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "ENOENT" || code === "ERR_NOT_FOUND";
}

/** Run Codex CLI in non-interactive mode. */
async function runCodexExec(input: CliExecInput): Promise<CliExecResult> {
  const args = [
    "exec",
    "--color",
    "never",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--model",
    input.modelId,
    "-",
  ];
  if (input.forceCustomApiKey && input.apiUrl.trim()) {
    // 逻辑：通过 config 覆盖 base_url，确保 CLI 走自定义地址。
    args.splice(args.length - 1, 0, "-c", `model_providers.openai.base_url=${input.apiUrl.trim()}`);
  }
  logger.debug(
    {
      command: input.command,
      args,
    },
    "[cli] exec start",
  );
  const env = { ...process.env };
  if (input.forceCustomApiKey) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new Error("Codex CLI 缺少 API Key");
    }
    env.CODEX_API_KEY = apiKey;
  }
  try {
    const result = await execa(input.command, args, {
      env,
      input: input.promptText,
      cancelSignal: input.abortSignal,
    });
    const text = (result.stdout ?? "").trim();
    logger.debug(
      {
        command: input.command,
        args,
        exitCode: result.exitCode,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      },
      "[cli] exec done",
    );
    if (!text) {
      const fallback = (result.stderr ?? "").trim();
      return { text: fallback };
    }
    return { text };
  } catch (error) {
    if (isCommandNotFound(error)) {
      throw new Error("Codex CLI 未安装");
    }
    const errorPayload = error as {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
    // 逻辑：只记录命令与输出，不记录 env，避免泄露密钥。
    logger.debug(
      {
        command: input.command,
        args,
        exitCode: errorPayload.exitCode,
        stdout: errorPayload.stdout ?? "",
        stderr: errorPayload.stderr ?? "",
      },
      "[cli] exec failed",
    );
    logger.warn({ err: error }, "[cli] codex exec failed");
    throw error instanceof Error ? error : new Error("Codex CLI 执行失败");
  }
}

/** Execute a CLI tool and return the final output. */
async function runCliExec(input: CliExecInput): Promise<CliExecResult> {
  if (input.command === "codex") {
    return runCodexExec(input);
  }
  throw new Error(`未支持的 CLI 工具：${input.command}`);
}

/** Build a LanguageModelV3 instance backed by a CLI tool. */
export function buildCliLanguageModel(input: CliLanguageModelInput): LanguageModelV3 {
  const supportedUrls: Record<string, RegExp[]> = {};
  const command = resolveCliCommand(input.toolId);

  return {
    specificationVersion: "v3",
    provider: input.providerId,
    modelId: input.modelId,
    supportedUrls,
    async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      const promptText = buildCliPromptText(options.prompt);
      const result = await runCliExec({
        command,
        modelId: input.modelId,
        promptText,
        apiUrl: input.apiUrl,
        apiKey: input.apiKey,
        forceCustomApiKey: input.forceCustomApiKey,
        abortSignal: options.abortSignal,
      });
      const text = result.text.trim();
      return {
        content: text ? [{ type: "text", text }] : [],
        finishReason: "stop",
        usage: buildEmptyUsage(),
        warnings: EMPTY_WARNINGS,
      };
    },
    async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
      const promptText = buildCliPromptText(options.prompt);
      const result = await runCliExec({
        command,
        modelId: input.modelId,
        promptText,
        apiUrl: input.apiUrl,
        apiKey: input.apiKey,
        forceCustomApiKey: input.forceCustomApiKey,
        abortSignal: options.abortSignal,
      });
      const text = result.text.trim();
      const usage = buildEmptyUsage();

      async function* streamIterator(): AsyncGenerator<LanguageModelV3StreamPart> {
        yield { type: "stream-start", warnings: EMPTY_WARNINGS };
        const textId = "text";
        yield { type: "text-start", id: textId };
        if (text) {
          yield { type: "text-delta", id: textId, delta: text };
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
