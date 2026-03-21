/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { type UIMessage } from "ai";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@openloaf/db";
import { type ChatModelSource, type ModelDefinition } from "@openloaf/api/common";
import type { ImageGenerateOptions, OpenLoafImageMetadataV1 } from "@openloaf/api/types/image";
import type { AiImageRequest } from "@openloaf-saas/sdk";
import type { OpenLoafUIMessage, TokenUsage } from "@openloaf/api/types/message";
import { createMasterAgentRunner, createPMAgentRunner } from "@/ai";
import { getTemplate, isTemplateId } from "@/ai/agent-templates";
import { resolveChatModel } from "@/ai/models/resolveChatModel";
import { resolveCliChatModelId } from "@/ai/models/cli/cliProviderEntry";
import { resolveAgentModelIdsFromConfig } from "@/ai/shared/resolveAgentModelFromConfig";
import { readAgentJson, resolveAgentDir } from "@/ai/shared/defaultAgentResolver";
import {
  setChatModel,
  setAbortSignal,
  setCodexOptions,
  setClaudeCodeOptions,
  setParentProjectRootPaths,
  setAssistantParentMessageId,
  setCliSession,
  setCliRewindTarget,
  getProjectId,
} from "@/ai/shared/context/requestContext";
import {
  getCachedCcSession,
  setCachedCcSession,
} from "@/ai/models/cli/claudeCode/claudeCodeSessionStore";
import { logger } from "@/common/logger";
import { downloadImageData, resolveParentProjectRootPaths } from "@/ai/shared/util";
import { parseCommandAtStart } from "@/ai/tools/CommandParser";
import { buildSessionPrefaceText } from "@/ai/shared/prefaceBuilder";
import { assembleDefaultAgentInstructions } from "@/ai/shared/agentPromptAssembler";
import {
  getProjectRootPath,
} from "@openloaf/api/services/vfsService";
import { resolveImagePrompt, type GenerateImagePrompt } from "@/ai/services/image/imagePrompt";
import { saveChatImageAttachment } from "@/ai/services/image/attachmentResolver";
import {
  resolveBaseNameFromUrl,
  resolveImageExtension,
  resolveImageInputBuffer,
  resolveImageSaveDirectory,
  resolveMediaTypeFromDataUrl,
  saveImageUrlsToDirectory,
} from "@/ai/services/image/imageStorage";
import { getSaasClient } from "@/modules/saas";
import {
  createChatImageErrorResult,
  formatImageErrorMessage,
  formatInvalidRequestMessage,
  initRequestContext,
  loadAndPrepareMessageChain,
  loadAndPrepareMessageChainFromIds,
  saveLastMessageAndResolveParent,
  stripImagePartsForNonVisionModel,
} from "./chatStreamHelpers";
import { resolveCodexRequestOptions, resolveClaudeCodeRequestOptions, resolveImageGenerateOptions } from "./messageOptionResolver";
import {
  resolveExplicitModelDefinition,
  resolvePreviousChatModelId,
  resolveRequiredInputTags,
} from "./modelResolution";
import type { ChatStreamRequest } from "@/ai/services/chat/types";
import {
  clearSessionErrorMessage,
  ensureSessionPreface,
  resolveRightmostLeafId,
  resolveSessionPrefaceText,
  saveMessage,
  setSessionErrorMessage,
} from "@/ai/services/chat/repositories/messageStore";
import type { ChatImageRequest, ChatImageRequestResult } from "@/ai/services/image/types";
import { buildTimingMetadata } from "./metadataBuilder";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { resolveMessagesJsonlPath, writeSessionJson } from "@/ai/services/chat/repositories/chatFileStore";
import { buildHardRules } from "@/ai/shared/hardRules";
import { taskExecutor } from "@/services/taskExecutor";
import {
  createTask as createTaskConfig,
  findActivePmTask,
  updateTask,
} from "@/services/taskConfigService";
import { extractSourceContextSnapshot } from "@/services/taskContextExtractor";
import { getOpenLoafRootDir } from "@openloaf/config";
import {
  createAgentRouteAckResponse,
  createChatStreamResponse,
  createErrorStreamResponse,
  createImageStreamResponse,
} from "./streamOrchestrator";

/** Max wait time for SaaS image tasks (ms). */
const SAAS_IMAGE_TASK_TIMEOUT_MS = 5 * 60 * 1000;
/** Poll interval for SaaS image tasks (ms). */
const SAAS_IMAGE_TASK_POLL_MS = 1500;

type ImageModelRequest = {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: UIMessage[];
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[];
  /** Abort signal for image generation. */
  abortSignal: AbortSignal;
  /** Image model id. */
  chatModelId?: string;
  /** Image model source. */
  chatModelSource?: ChatModelSource;
  /** Optional model definition. */
  modelDefinition?: ModelDefinition | null;
  /** Optional request message id. */
  requestMessageId?: string;
  /** Optional response message id. */
  responseMessageId?: string;
  /** Optional trigger source. */
  trigger?: string;
  /** Optional board id. */
  boardId?: string | null;
  /** Optional image save directory uri. */
  imageSaveDir?: string;
  /** SaaS access token for media generation. */
  saasAccessToken?: string;
};

type ImageModelResult = {
  /** Image parts for immediate response. */
  imageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Persisted image parts for message storage. */
  persistedImageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Revised prompt text. */
  revisedPrompt?: string;
  /** Agent metadata for persistence. */
  agentMetadata: Record<string, unknown>;
  /** Token usage for metadata. */
  totalUsage?: TokenUsage;
};

/** Resolve model IDs from master agent config + global chatSource. */
function resolveAgentModelIds(input: {
  projectId?: string
}): {
  chatModelId?: string
  chatModelSource?: ChatModelSource
  imageModelId?: string
  videoModelId?: string
  codeModelIds?: string[]
} {
  return resolveAgentModelIdsFromConfig({
    agentName: 'master',
    projectId: input.projectId,
  })
}

/** Normalize selected skills input. */
function normalizeSelectedSkills(input?: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const candidates = input.filter((value): value is string => typeof value === "string");
  // 逻辑：只保留非空字符串，并按输入顺序去重。
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of candidates) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/** Resolve active skills from master agent config.
 *  Empty array = all skills enabled (backward compatible). */
function resolveAgentSkills(input: {
  projectId?: string
}): string[] {
  const roots: string[] = []
  if (input.projectId) {
    const projectRoot = getProjectRootPath(input.projectId)
    if (projectRoot) roots.push(projectRoot)
  }

  for (const rootPath of roots) {
    const descriptor = readAgentJson(resolveAgentDir(rootPath, 'master'))
    if (!descriptor) continue
    if (Array.isArray(descriptor.skills)) return descriptor.skills
  }
  return []
}

/** Extract plain text from UI message parts. */
function extractTextFromParts(parts: unknown[]): string {
  const items = Array.isArray(parts) ? (parts as any[]) : [];
  return items
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

/** Check whether the message is a compact command request. */
function isCompactCommandMessage(message: OpenLoafUIMessage | undefined): boolean {
  if (!message || message.role !== "user") return false;
  if ((message as any)?.messageKind === "compact_prompt") return true;
  const text = extractTextFromParts(message.parts ?? []);
  const command = parseCommandAtStart(text);
  return command?.id === "summary-history";
}

/** Build the compact prompt text sent to the model. */
function buildCompactPromptText(): string {
  return [
    "# 任务",
    "请对当前对话进行压缩摘要，供后续继续对话使用。",
    "要求：",
    "- 保留明确需求、约束、决策、关键事实。",
    "- 保留重要数据、参数、文件路径、命令、接口信息。",
    "- 标注未完成事项与风险。",
    "- 用精简要点，不要展开推理过程。",
    "输出格式：",
    "## 摘要",
    "## 关键决策",
    "## 待办",
    "## 风险/疑点",
    "## 涉及文件",
  ].join("\n");
}

/** Error with HTTP status for image requests. */
class ChatImageRequestError extends Error {
  /** HTTP status code. */
  status: number;

  /** Create a request error with HTTP status. */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Run chat stream and return SSE response. */
export async function runChatStream(input: {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
  /** SaaS access token from request header. */
  saasAccessToken?: string;
}): Promise<Response> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    timezone,
    tabId,
    projectId,
    boardId,
    trigger,
  } = input.request;

  // 逻辑：从 master agent 配置读取模型，不再依赖请求参数。
  const agentModelIds = resolveAgentModelIds({ projectId })
  let chatModelId = agentModelIds.chatModelId
  let chatModelSource = agentModelIds.chatModelSource

  // 请求中明确指定了模型时，优先使用（支持 board 节点 + E2E 测试并发）。
  if (input.request.chatModelId) {
    chatModelId = input.request.chatModelId
    if (input.request.chatModelSource) chatModelSource = input.request.chatModelSource
  }

  // 逻辑：优先从 master agent config 读取已启用技能，/skill/ 命令作为临时覆盖。
  const configSkills = resolveAgentSkills({ projectId })
  const selectedSkills = configSkills
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    timezone,
    tabId,
    projectId,
    boardId,
    selectedSkills,
    toolApprovalPayloads: input.request.toolApprovalPayloads,
    autoApproveTools: input.request.autoApproveTools,
    requestSignal: input.requestSignal,
    messageId,
    saasAccessToken: input.saasAccessToken,
    imageModelId: agentModelIds.imageModelId,
    videoModelId: agentModelIds.videoModelId,
    clientPlatform: input.request.clientPlatform,
    webVersion: input.request.webVersion,
    serverVersion: input.request.serverVersion,
    desktopVersion: input.request.desktopVersion,
    pageContext: input.request.pageContext,
  });

  const lastMessage = incomingMessages.at(-1) as OpenLoafUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求无效：缺少最后一条消息。",
    });
  }

  // 逻辑：CLI 直连模式 — 跳过 agent 系统指令和工具编排，消息直接发给 CLI 适配模型。
  const directCli = !!(lastMessage as any).metadata?.directCli;
  const isCliCompact = directCli && !!(lastMessage as any).metadata?.cliCompact;

  // CLI compact：标记用户消息为 compact_prompt
  if (isCliCompact) {
    (lastMessage as any).messageKind = "compact_prompt";
  }

  // 逻辑：CLI 直连模式覆盖 chatModelId — 优先使用前端传递的 chatModelId，否则从 codeModelIds 解析。
  if (directCli) {
    // 优先使用前端明确传递的 chatModelId（例如 "codex-cli:gpt-5.3-codex"）
    const explicitChatModelId = input.request.chatModelId?.trim();
    if (explicitChatModelId) {
      chatModelId = explicitChatModelId;
      chatModelSource = 'local';
      logger.info(
        { sessionId, chatModelId: explicitChatModelId },
        "[chat] directCli using explicit chatModelId from request",
      );
    } else {
      // 回退：从 master agent 的 codeModelIds 配置解析
      const cliSelection = agentModelIds.codeModelIds?.[0]?.trim()
      if (cliSelection) {
        const cliChatModelId = await resolveCliChatModelId(cliSelection)
        if (cliChatModelId) {
          chatModelId = cliChatModelId
          chatModelSource = 'local'
        } else {
          logger.warn(
            { sessionId, cliSelection },
            "[chat] directCli resolve selected CLI model failed, fallback to chat model",
          );
        }
      } else {
        logger.warn(
          { sessionId },
          "[chat] directCli missing codeModelIds, fallback to chat model",
        );
      }
    }
  }

  // ── @agents/ mention routing (targetAgent) ──────────────────────
  // Only route via task system for CROSS-PROJECT mentions.
  // When targetAgent.projectId matches the current session's projectId,
  // skip task creation — the PM agent handles this session directly (streaming).
  const targetAgent = (lastMessage as any)?.metadata?.targetAgent as
    | { kind: 'pm'; projectId: string; projectTitle?: string }
    | undefined;
  const isCrossProjectMention = targetAgent?.kind === 'pm'
    && targetAgent.projectId
    && targetAgent.projectId !== projectId;
  if (isCrossProjectMention && lastMessage) {
    const mentionText = extractTextFromParts(lastMessage.parts ?? []);

    if (mentionText) {
      const globalRoot = getOpenLoafRootDir();
      const targetProjectRoot = await getProjectRootPath(targetAgent.projectId);
      const projectRoots = targetProjectRoot ? [targetProjectRoot] : undefined;

      // Check for an active PM task for the target project
      const activePmTask = findActivePmTask(
        targetAgent.projectId,
        globalRoot,
        projectRoots,
      );

      if (activePmTask && taskExecutor.isRunning(activePmTask.id)) {
        // Append message to existing PM task
        const sent = await taskExecutor.appendUserMessage(
          activePmTask.id,
          mentionText,
          globalRoot,
          targetProjectRoot,
        );
        logger.info(
          { sessionId, taskId: activePmTask.id, projectId: targetAgent.projectId },
          `[chat] @agents/pm routed to existing task (sent=${sent})`,
        );
      } else {
        // Extract source chat context snapshot
        const sourceContextSnapshot = await extractSourceContextSnapshot(sessionId)

        // Create a new PM task for the target project
        const newTask = createTaskConfig(
          {
            name: mentionText.slice(0, 50),
            description: mentionText,
            agentName: 'pm',
            sourceSessionId: sessionId,
            sourceContextSnapshot,
            skipPlanConfirm: true,
            autoExecute: true,
            requiresReview: false,
            createdBy: 'user',
            projectId: targetAgent.projectId,
          },
          targetProjectRoot ?? globalRoot,
          targetProjectRoot ? 'project' : 'global',
        );
        logger.info(
          { sessionId, taskId: newTask.id, projectId: targetAgent.projectId },
          '[chat] @agents/pm created new PM task',
        );
        // Start execution
        void taskExecutor.execute(newTask.id, globalRoot, targetProjectRoot, input.saasAccessToken);
      }

      // Return an ack response instead of running the master agent
      const displayName = targetAgent.projectTitle ?? targetAgent.projectId;
      return createAgentRouteAckResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        ackText: `已将指令发送给「${displayName}」的管理员，稍后会在此回报结果。`,
      });
    }
  }

  // 逻辑：在首条用户消息前确保 preface 已落库。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  await ensureSessionPreface({
    sessionId,
    text: await buildSessionPrefaceText({
      sessionId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
      timezone,
      clientPlatform: input.request.clientPlatform,
    }),
    createdAt: requestStartAt,
    projectId: resolvedProjectId,
    boardId: boardId ?? undefined,
  });

  const isCompactCommand = isCompactCommandMessage(lastMessage);
  let leafMessageId = "";
  let assistantParentUserId: string | null = null;
  let includeCompactPrompt = false;

  if (isCompactCommand) {
    // 中文注释：/summary-history 指令走压缩流程，先写 compact_prompt 再生成 summary。
    if (!lastMessage || lastMessage.role !== "user") {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求无效：压缩指令必须来自用户消息。",
      });
    }

    const explicitParent =
      typeof lastMessage.parentMessageId === "string" || lastMessage.parentMessageId === null
        ? (lastMessage.parentMessageId as string | null)
        : undefined;
    const parentMessageId =
      explicitParent === undefined
        ? await resolveRightmostLeafId(sessionId)
        : explicitParent;
    if (!parentMessageId) {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求失败：找不到可压缩的对话节点。",
      });
    }

    const compactPromptMessage: OpenLoafUIMessage = {
      id: lastMessage.id,
      role: "user",
      parentMessageId,
      messageKind: "compact_prompt",
      parts: [{ type: "text", text: buildCompactPromptText() }],
    };

    try {
      const saved = await saveMessage({
        sessionId,
        message: compactPromptMessage,
        parentMessageId,
        createdAt: requestStartAt,
      });
      leafMessageId = saved.id;
      assistantParentUserId = saved.id;
      includeCompactPrompt = true;
    } catch (err) {
      logger.error({ err }, "[chat] save compact prompt failed");
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId,
        errorText: "请求失败：保存压缩指令出错。",
      });
    }
  } else {
    // 流程：保存最后一条消息 -> 补全历史链路 -> 解析模型 -> 启动 SSE stream 并落库 assistant。
    const saveResult = await saveLastMessageAndResolveParent({
      sessionId,
      lastMessage,
      requestStartAt,
      formatInvalid: (message) => `请求无效：${message}`,
      formatSaveError: (message) => `请求失败：${message}`,
    });
    if (!saveResult.ok) {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: saveResult.errorText,
      });
    }

    leafMessageId = saveResult.leafMessageId;
    assistantParentUserId = saveResult.assistantParentUserId;
  }

  // ── directCli 会话持久化：查内存缓存 → miss 则查 DB → 首条新建 UUID ──
  if (directCli) {
    const cached = getCachedCcSession(sessionId);
    let sdkSessionId = cached?.sdkSessionId ?? null;
    if (!sdkSessionId) {
      const row = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { cliId: true },
      });
      if (row?.cliId) sdkSessionId = row.cliId.replace("claude-code_", "");
    }

    let prefaceText: string | undefined;
    if (!sdkSessionId) {
      // 首条消息：新建 UUID + 写 DB + session.json + resolve preface
      sdkSessionId = crypto.randomUUID();
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { cliId: `claude-code_${sdkSessionId}` },
      });
      await writeSessionJson(sessionId, { cliId: `claude-code_${sdkSessionId}` });
      prefaceText = await resolveSessionPrefaceText(sessionId);
    }

    // 写入 RequestContext + 内存缓存
    setCliSession(sdkSessionId, prefaceText);
    setCachedCcSession(sessionId, {
      sdkSessionId,
      modelId: "",
      lastUsedAt: Date.now(),
    });

    logger.debug(
      { sessionId, sdkSessionId, isResume: !prefaceText },
      "[chat] directCli session resolved",
    );

    // 传递 rewind target（用于 retry 时 SDK resumeSessionAt）
    const sdkRewindTarget = input.request.sdkRewindTarget?.trim();
    if (sdkRewindTarget) {
      setCliRewindTarget(sdkRewindTarget);
      logger.debug(
        { sessionId, sdkRewindTarget },
        "[chat] directCli rewind target set",
      );
    }
  }

  // ── directCli 跳过消息链加载，直接进模型解析 ──
  let messages: UIMessage[] = [];
  let modelMessages: UIMessage[] = [];

  // Board chat: 使用 messageIdChain 从画布链路加载历史
  const messageIdChain = Array.isArray(input.request.messageIdChain) && input.request.messageIdChain.length > 0
    ? input.request.messageIdChain
    : null;

  if (!directCli) {
    if (messageIdChain) {
      // Board chat 模式：按画布链路 ID 列表提取消息
      const chainResult = await loadAndPrepareMessageChainFromIds({
        sessionId,
        messageIdChain,
        includeCompactPrompt,
        formatError: (message) => `请求失败：${message}`,
      });
      if (!chainResult.ok) {
        return createErrorStreamResponse({
          sessionId,
          assistantMessageId,
          parentMessageId: assistantParentUserId ?? (await resolveRightmostLeafId(sessionId)),
          errorText: chainResult.errorText,
        });
      }
      messages = chainResult.messages as UIMessage[];
      modelMessages = chainResult.modelMessages as UIMessage[];
    } else {
      const chainResult = await loadAndPrepareMessageChain({
        sessionId,
        leafMessageId,
        assistantParentUserId,
        includeCompactPrompt,
        formatError: (message) => `请求失败：${message}`,
      });
      if (!chainResult.ok) {
        return createErrorStreamResponse({
          sessionId,
          assistantMessageId,
          parentMessageId: assistantParentUserId ?? (await resolveRightmostLeafId(sessionId)),
          errorText: chainResult.errorText,
        });
      }
      messages = chainResult.messages as UIMessage[];
      modelMessages = chainResult.modelMessages as UIMessage[];
    }
  } else {
    // directCli：modelMessages 只需要最后一条用户消息
    modelMessages = [lastMessage] as UIMessage[];
  }
  // 逻辑：从当前请求用户消息中解析 CLI 参数，兼容 directCli 与普通模式。
  const optionSourceMessages = directCli ? modelMessages : messages;
  setCodexOptions(resolveCodexRequestOptions(optionSourceMessages));
  setClaudeCodeOptions(resolveClaudeCodeRequestOptions(optionSourceMessages));

  setParentProjectRootPaths(parentProjectRootPaths);

  if (!assistantParentUserId) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：找不到父消息。",
    });
  }
  const parentMessageId = assistantParentUserId;
  setAssistantParentMessageId(parentMessageId);

  let agentMetadata: Record<string, unknown> = {};
  let masterAgent: ReturnType<typeof createMasterAgentRunner>;
  let instructions = '';
  let resolvedModelDef: import("@openloaf/api/common").ModelDefinition | undefined;

  try {
    // 按输入能力与历史偏好选择模型，失败时直接返回错误流。
    const requiredTags = !chatModelId ? resolveRequiredInputTags(messages as UIMessage[]) : [];
    const preferredChatModelId = !chatModelId
      ? resolvePreviousChatModelId(messages as UIMessage[])
      : null;
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource,
      requiredTags,
      preferredChatModelId,
      saasAccessToken: input.saasAccessToken,
    });
    if (directCli) {
      // 逻辑：CLI 直连模式 — 不注入 agent 系统指令和工具，消息直接透传给 CLI 适配模型。
      instructions = '';
      masterAgent = createMasterAgentRunner({
        model: resolved.model,
        modelInfo: resolved.modelInfo,
        instructions,
      });
    } else {
      // agentType: 'pm' — 使用专用 Agent
      // 前端 transport 将 params 展平到顶层，taskExecutor 则放在 params 下——两处都要读取。
      const agentType = input.request.agentType ?? input.request.params?.agentType;
      const rawTaskId = input.request.taskId ?? input.request.params?.taskId;
      const taskId = typeof rawTaskId === 'string' ? rawTaskId : undefined;
      if (agentType === 'pm') {
        masterAgent = createPMAgentRunner({
          model: resolved.model,
          modelInfo: resolved.modelInfo,
          taskId,
          projectId: input.request.projectId,
        });
      } else {
        // 逻辑：组装默认 agent instructions（template.systemPrompt）。
        instructions = assembleDefaultAgentInstructions();

        // agentHint：当请求 params 中包含 agentHint 时，使用对应模版的 systemPrompt 替换 instructions
        const agentHint = input.request.params?.agentHint;
        if (typeof agentHint === 'string' && agentHint.trim() && isTemplateId(agentHint.trim())) {
          const hintTemplate = getTemplate(agentHint.trim());
          if (hintTemplate && !hintTemplate.isPrimary) {
            instructions = hintTemplate.systemPrompt;
          }
        }

        masterAgent = createMasterAgentRunner({
          model: resolved.model,
          modelInfo: resolved.modelInfo,
          instructions,
          messages: modelMessages,
        });
      }
    }
    setChatModel(resolved.model);
    resolvedModelDef = resolved.modelDefinition ?? undefined;
    agentMetadata = {
      id: masterAgent.frame.agentId,
      name: masterAgent.frame.name,
      kind: masterAgent.frame.kind,
      model: {
        ...masterAgent.frame.model,
        ...(resolved.modelDefinition?.familyId ? { familyId: resolved.modelDefinition.familyId } : {}),
        ...(resolved.modelDefinition?.name ? { name: resolved.modelDefinition.name } : {}),
      },
      chatModelId: resolved.chatModelId,
    };
  } catch (err) {
    logger.error(
      {
        err,
        sessionId,
        chatModelId,
        chatModelSource,
      },
      "[chat] resolve chat model failed",
    );
    const errorText = err instanceof Error ? `请求失败：${err.message}` : "请求失败：模型解析失败。";
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId,
      errorText,
    });
  }

  // 逻辑：AI调试模式 — 保存 PROMPT.md + PREFACE.md 到 session 目录。
  if (!directCli) {
    try {
      const basicConf = readBasicConf()
      if (basicConf.chatPrefaceEnabled) {
        const jsonlPath = await resolveMessagesJsonlPath(sessionId)
        const sessionDir = path.dirname(jsonlPath)
        // 完整指令 = prompt + hardRules（toolSearchGuidance 已移至 preface）
        const fullPrompt = `${instructions}\n\n${buildHardRules()}`
        await fs.writeFile(path.join(sessionDir, 'PROMPT.md'), fullPrompt, 'utf-8')
        // sessionPreface → 独立 PREFACE.md
        const prefaceText = await resolveSessionPrefaceText(sessionId)
        if (prefaceText) {
          await fs.writeFile(path.join(sessionDir, 'PREFACE.md'), prefaceText, 'utf-8')
        }
      }
    } catch (err) {
      logger.warn({ err, sessionId }, '[chat] failed to save PROMPT.md / PREFACE.md')
    }
  }

  // 逻辑：非视觉模型剥离图片 parts，替换为文本引用提示（vision sub-agent 委派）。
  if (!directCli) {
    modelMessages = stripImagePartsForNonVisionModel(modelMessages, resolvedModelDef);
  }

  return createChatStreamResponse({
    sessionId,
    assistantMessageId,
    parentMessageId,
    requestStartAt,
    modelMessages,
    agentRunner: masterAgent,
    agentMetadata,
    abortController,
    assistantMessageKind: (isCompactCommand || isCliCompact) ? "compact_summary" : undefined,
  });
}

/** Run chat image request and return JSON-friendly result. */
export async function runChatImageRequest(input: {
  /** Chat request payload. */
  request: ChatImageRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
  /** SaaS access token from request header. */
  saasAccessToken?: string;
}): Promise<ChatImageRequestResult> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    timezone,
    tabId,
    projectId,
    boardId,
    imageSaveDir,
    trigger,
  } = input.request;

  // 逻辑：从 master agent 配置读取模型，不再依赖请求参数。
  const imageAgentModelIds = resolveAgentModelIds({ projectId })
  const chatModelId = imageAgentModelIds.chatModelId
  const chatModelSource = imageAgentModelIds.chatModelSource

  const selectedSkills = resolveAgentSkills({ projectId })
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    timezone,
    tabId,
    projectId,
    boardId,
    selectedSkills,
    requestSignal: input.requestSignal,
    messageId,
    saasAccessToken: input.saasAccessToken,
    clientPlatform: input.request.clientPlatform,
    webVersion: input.request.webVersion,
    serverVersion: input.request.serverVersion,
    desktopVersion: input.request.desktopVersion,
    pageContext: input.request.pageContext,
  });

  const lastMessage = incomingMessages.at(-1) as OpenLoafUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    const errorText = formatInvalidRequestMessage("缺少最后一条消息。");
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(400, errorText);
  }

  // 逻辑：在首条用户消息前确保 preface 已落库。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  await ensureSessionPreface({
    sessionId,
    text: await buildSessionPrefaceText({
      sessionId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
      timezone,
      clientPlatform: input.request.clientPlatform,
    }),
    createdAt: requestStartAt,
    projectId: resolvedProjectId,
    boardId: boardId ?? undefined,
  });

  // 流程：
  // 1) 保存最后一条消息并确定父消息
  // 2) 加载消息链并替换图片输入
  // 3) 解析图片模型并生成图片
  // 4) 保存图片与 assistant 消息，返回完整 message
  const saveResult = await saveLastMessageAndResolveParent({
    sessionId,
    lastMessage,
    requestStartAt,
    formatInvalid: formatInvalidRequestMessage,
    formatSaveError: formatImageErrorMessage,
  });
  if (!saveResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: saveResult.errorText });
    return createChatImageErrorResult(saveResult.status, saveResult.errorText);
  }

  const { leafMessageId, assistantParentUserId } = saveResult;
  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    formatError: formatImageErrorMessage,
  });
  if (!chainResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: chainResult.errorText });
    return createChatImageErrorResult(400, chainResult.errorText);
  }
  const { messages, modelMessages } = chainResult;

  try {
    const explicitModelDefinition = await resolveExplicitModelDefinition(chatModelId);
    const imageResult = await generateImageModelResult({
      sessionId,
      messages: modelMessages as UIMessage[],
      metadataMessages: messages as UIMessage[],
      abortSignal: abortController.signal,
      chatModelId,
      chatModelSource,
      modelDefinition: explicitModelDefinition,
      requestMessageId: assistantParentUserId ?? undefined,
      responseMessageId: assistantMessageId,
      trigger,
      boardId,
      imageSaveDir,
      saasAccessToken: input.saasAccessToken,
    });

    const timingMetadata = buildTimingMetadata({
      startedAt: requestStartAt,
      finishedAt: new Date(),
    });
    const usageMetadata = imageResult.totalUsage ? { totalUsage: imageResult.totalUsage } : {};
    const mergedMetadata: Record<string, unknown> = {
      ...usageMetadata,
      ...timingMetadata,
      ...(Object.keys(imageResult.agentMetadata).length > 0
        ? { agent: imageResult.agentMetadata }
        : {}),
    };

    const revisedPromptPart = imageResult.revisedPrompt
      ? [
          {
            type: "data-revised-prompt" as const,
            data: { text: imageResult.revisedPrompt },
          },
        ]
      : [];
    const messageParts = [...imageResult.persistedImageParts, ...revisedPromptPart];

    const message: OpenLoafUIMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: messageParts,
      parentMessageId: assistantParentUserId,
      metadata: mergedMetadata,
    };

    await saveMessage({
      sessionId,
      message,
      parentMessageId: assistantParentUserId,
      allowEmpty: false,
      createdAt: requestStartAt,
    });
    await clearSessionErrorMessage({ sessionId });

    return { ok: true, response: { sessionId, message } };
  } catch (err) {
    logger.error({ err, sessionId, chatModelId }, "[chat] image request failed");
    if (err instanceof ChatImageRequestError) {
      const errorText = formatImageErrorMessage(err);
      await setSessionErrorMessage({ sessionId, errorMessage: errorText });
      return createChatImageErrorResult(err.status, errorText);
    }
    const errorText = formatImageErrorMessage(err);
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(500, errorText);
  }
}

/** Generate image result for chat image flows. */
async function generateImageModelResult(input: ImageModelRequest): Promise<ImageModelResult> {
  const resolvedPrompt = resolveImagePrompt(input.messages);
  if (!resolvedPrompt) {
    throw new ChatImageRequestError("缺少图片生成提示词。", 400);
  }
  const rawModelId = input.chatModelId?.trim() ?? "";
  if (!rawModelId) {
    throw new ChatImageRequestError("未指定图片模型。", 400);
  }
  const accessToken = input.saasAccessToken?.trim() ?? "";
  if (!accessToken) {
    throw new ChatImageRequestError("缺少 SaaS 访问令牌。", 401);
  }

  setAbortSignal(input.abortSignal);
  const resolvedModelId = resolveChatModelSuffix(rawModelId);
  const prompt = resolvedPrompt.prompt;
  const promptText = resolvePromptText(prompt);
  const promptTextLength =
    typeof prompt === "string" ? prompt.length : prompt.text?.length ?? 0;
  const promptImageCount = resolvedPrompt.images.length;
  const promptHasMask = Boolean(resolvedPrompt.mask);
  logger.debug(
    {
      promptLength: promptTextLength,
      imageCount: promptImageCount,
      hasMask: promptHasMask,
    },
    "[chat] start image stream",
  );
  const imageOptions = resolveImageGenerateOptions(input.messages as UIMessage[]);
  const output = resolveSaasImageOutput(imageOptions);
  const { style, negativePrompt, parameters } = resolveSaasImageParameters(imageOptions);
  const inputs = await resolveSaasImageInputs({
    images: resolvedPrompt.images,
    mask: resolvedPrompt.mask,
    abortSignal: input.abortSignal,
  });
  const payload: AiImageRequest = {
    modelId: resolvedModelId,
    prompt: promptText,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(style ? { style } : {}),
    ...(inputs ? { inputs } : {}),
    ...(output ? { output } : {}),
    ...(parameters ? { parameters } : {}),
  };

  const client = getSaasClient(accessToken);
  const submitResult = await client.ai.image(payload);
  if (!submitResult || submitResult.success !== true || !submitResult.data?.taskId) {
    const fallbackMessage = "图片任务创建失败。";
    const message =
      submitResult && submitResult.success === false
        ? submitResult.message
        : fallbackMessage;
    throw new ChatImageRequestError(message, 502);
  }
  const taskId = submitResult.data.taskId;
  const taskResult = await waitForSaasImageTask({
    client,
    taskId,
    abortSignal: input.abortSignal,
  });
  const resultUrls = (taskResult.resultUrls ?? [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (resultUrls.length === 0) {
    throw new Error("图片生成结果为空。");
  }

  // 逻辑：生成图片元信息用于持久化与预览查询。
  const metadataPayload = buildImageMetadata({
    sessionId: input.sessionId,
    prompt: promptText,
    modelId: resolvedModelId,
    chatModelId: input.chatModelId,
    chatModelSource: input.chatModelSource,
    providerId: "openloaf-saas",
    requestMessageId: input.requestMessageId,
    responseMessageId: input.responseMessageId,
    trigger: input.trigger,
    boardId: input.boardId,
    imageOptions: imageOptions
      ? {
          n: imageOptions.n,
          size: imageOptions.size,
          aspectRatio: imageOptions.aspectRatio,
        }
      : undefined,
    messages: input.metadataMessages ?? input.messages,
  });
  const projectId = getProjectId();
  const imageSaveDirRaw =
    typeof input.imageSaveDir === "string" ? input.imageSaveDir.trim() : "";
  if (imageSaveDirRaw) {
    const resolvedSaveDir = await resolveImageSaveDirectory({
      imageSaveDir: imageSaveDirRaw,
      projectId: projectId || undefined,
    });
    if (!resolvedSaveDir) {
      throw new ChatImageRequestError("imageSaveDir 无效。", 400);
    }
    await saveImageUrlsToDirectory({
      urls: resultUrls,
      directory: resolvedSaveDir,
    });
  }
  const persistedImageParts: Array<{ type: "file"; url: string; mediaType: string }> = [];
  for (const [index, url] of resultUrls.entries()) {
    const downloaded = await downloadImageWithType({
      url,
      abortSignal: input.abortSignal,
    });
    const baseName = resolveBaseNameFromUrl(url, `image-${index + 1}`);
    const ext = resolveImageExtension(downloaded.mediaType);
    const fileName = `${baseName}.${ext}`;
    const saved = await saveChatImageAttachment({
      projectId: projectId || undefined,
      boardId: input.boardId || undefined,
      sessionId: input.sessionId,
      fileName,
      mediaType: downloaded.mediaType,
      buffer: downloaded.buffer,
      metadata: metadataPayload,
    });
    persistedImageParts.push({
      type: "file",
      url: saved.url,
      mediaType: saved.mediaType,
    });
  }
  logger.debug(
    {
      persistedImageCount: persistedImageParts.length,
    },
    "[chat] image attachments saved",
  );

  const agentMetadata = {
    id: "master-agent",
    name: "MasterAgent",
    kind: "master",
    model: {
      provider: "openloaf-saas",
      modelId: resolvedModelId,
      ...(input.modelDefinition?.familyId ? { familyId: input.modelDefinition.familyId } : {}),
      ...(input.modelDefinition?.name ? { name: input.modelDefinition.name } : {}),
    },
    chatModelId: input.chatModelId,
  };

  return {
    imageParts: persistedImageParts,
    persistedImageParts,
    agentMetadata,
  };
}

/** 生成图片并返回 SSE 响应。 */
async function runImageModelStream(input: {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string;
  requestStartAt: Date;
  messages: UIMessage[];
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[];
  abortSignal: AbortSignal;
  chatModelId?: string;
  chatModelSource?: ChatModelSource;
  modelDefinition?: ModelDefinition;
  requestMessageId?: string;
  responseMessageId?: string;
  trigger?: string;
  boardId?: string | null;
  saasAccessToken?: string;
}): Promise<Response> {
  try {
    const imageResult = await generateImageModelResult({
      sessionId: input.sessionId,
      messages: input.messages,
      metadataMessages: input.metadataMessages,
      abortSignal: input.abortSignal,
      chatModelId: input.chatModelId,
      chatModelSource: input.chatModelSource,
      modelDefinition: input.modelDefinition,
      requestMessageId: input.requestMessageId,
      responseMessageId: input.responseMessageId,
      trigger: input.trigger,
      boardId: input.boardId,
      saasAccessToken: input.saasAccessToken,
    });
    return await createImageStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      requestStartAt: input.requestStartAt,
      imageParts: imageResult.imageParts,
      persistedImageParts: imageResult.persistedImageParts,
      revisedPrompt: imageResult.revisedPrompt,
      agentMetadata: imageResult.agentMetadata,
      totalUsage: imageResult.totalUsage,
    });
  } catch (err) {
    const modelId = input.chatModelId?.trim() ?? "";
    logger.error({ err, sessionId: input.sessionId, chatModelId: modelId }, "[chat] image stream failed");
    const errorText = formatImageErrorMessage(err);
    return createErrorStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      errorText,
    });
  }
}

type SanitizedRequestParts = {
  /** Sanitized parts for metadata. */
  parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
  /** Metadata flags derived from sanitization. */
  flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean };
  /** Warning messages for logs. */
  warnings: string[];
};

/** Resolve prompt text from image prompt payload. */
function resolvePromptText(prompt: GenerateImagePrompt): string {
  if (typeof prompt === "string") return prompt.trim();
  return typeof prompt.text === "string" ? prompt.text.trim() : "";
}

/** Resolve model id suffix from chatModelId. */
function resolveChatModelSuffix(chatModelId: string): string {
  const trimmed = chatModelId.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) return trimmed;
  return trimmed.slice(separatorIndex + 1).trim() || trimmed;
}

/** Map size/aspectRatio to SaaS aspectRatio enum. */
function resolveSaasAspectRatio(options?: ImageGenerateOptions): "1:1" | "16:9" | "9:16" | "4:3" | undefined {
  const rawSize = typeof options?.size === "string" ? options?.size.trim() : "";
  if (rawSize && /^\d+x\d+$/u.test(rawSize)) {
    const [widthText, heightText] = rawSize.split("x");
    const width = Number(widthText);
    const height = Number(heightText);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (width === height) return "1:1";
      if (width * 9 === height * 16) return "16:9";
      if (width * 16 === height * 9) return "9:16";
      if (width * 3 === height * 4) return "4:3";
    }
  }
  const rawAspectRatio = typeof options?.aspectRatio === "string" ? options?.aspectRatio.trim() : "";
  if (
    rawAspectRatio === "1:1" ||
    rawAspectRatio === "16:9" ||
    rawAspectRatio === "9:16" ||
    rawAspectRatio === "4:3"
  ) {
    return rawAspectRatio;
  }
  return undefined;
}

/** Build SaaS image output payload. */
function resolveSaasImageOutput(
  options?: ImageGenerateOptions,
): AiImageRequest["output"] | undefined {
  const count = typeof options?.n === "number" ? options.n : undefined;
  const aspectRatio = resolveSaasAspectRatio(options);
  const qualityRaw = options?.providerOptions?.openai?.quality?.trim();
  const quality =
    qualityRaw === "standard" || qualityRaw === "hd" ? qualityRaw : undefined;
  if (count === undefined && !aspectRatio && !quality) return undefined;
  return {
    ...(count !== undefined ? { count } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(quality ? { quality } : {}),
  };
}

/** Resolve SaaS optional parameters and style. */
function resolveSaasImageParameters(
  options?: ImageGenerateOptions,
): { style?: string; negativePrompt?: string; parameters?: Record<string, unknown> } {
  const style = options?.providerOptions?.openai?.style?.trim() || undefined;
  const negativePrompt = options?.providerOptions?.qwen?.negative_prompt?.trim() || undefined;
  const parameters: Record<string, unknown> = {};
  if (typeof options?.seed === "number" && Number.isFinite(options.seed)) {
    parameters.seed = options.seed;
  }
  if (options?.providerOptions && Object.keys(options.providerOptions).length > 0) {
    parameters.providerOptions = options.providerOptions;
  }
  return {
    ...(style ? { style } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  };
}

/** Resolve prompt images into SaaS inputs. */
async function resolveSaasImageInputs(input: {
  images: Array<{ data: unknown; mediaType?: string }>;
  mask?: { data: unknown; mediaType?: string };
  abortSignal: AbortSignal;
}): Promise<AiImageRequest["inputs"] | undefined> {
  if (input.images.length === 0 && !input.mask) return undefined;
  const projectId = getProjectId();
  const resolvedImages = await Promise.all(
    input.images.map((image, index) =>
      resolveImageInputBuffer({
        data: image.data as any,
        mediaType: image.mediaType,
        fallbackName: `image-${index + 1}`,
        projectId: projectId || undefined,
        abortSignal: input.abortSignal,
      }).then((resolved) => ({
        base64: resolved.buffer.toString("base64"),
        mediaType: resolved.mediaType,
      })),
    ),
  );
  const resolvedMask = input.mask
    ? await resolveImageInputBuffer({
        data: input.mask.data as any,
        mediaType: input.mask.mediaType,
        fallbackName: "mask",
        projectId: projectId || undefined,
        abortSignal: input.abortSignal,
      }).then((resolved) => ({
        base64: resolved.buffer.toString("base64"),
        mediaType: resolved.mediaType,
      }))
    : undefined;
  return {
    ...(resolvedImages.length > 0 ? { images: resolvedImages } : {}),
    ...(resolvedMask ? { mask: resolvedMask } : {}),
  };
}

/** Sleep for a short duration or abort early. */
async function sleepWithAbort(ms: number, abortSignal: AbortSignal): Promise<void> {
  if (abortSignal.aborted) {
    throw new ChatImageRequestError("请求已取消。", 499);
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      abortSignal.removeEventListener("abort", onAbort);
      reject(new ChatImageRequestError("请求已取消。", 499));
    };
    const timer = setTimeout(() => {
      abortSignal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    abortSignal.addEventListener("abort", onAbort);
  });
}

/** Poll SaaS image task until completion. */
async function waitForSaasImageTask(input: {
  client: ReturnType<typeof getSaasClient>;
  taskId: string;
  abortSignal: AbortSignal;
}): Promise<{
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  resultUrls?: string[];
  error?: { message?: string; code?: string };
}> {
  const startAt = Date.now();
  while (true) {
    if (input.abortSignal.aborted) {
      try {
        await input.client.ai.mediaCancelTask(input.taskId);
      } catch {
        // 忽略取消失败。
      }
      throw new ChatImageRequestError("请求已取消。", 499);
    }
    const response = await input.client.ai.mediaTask(input.taskId);
    if (!response || response.success !== true) {
      const message = response?.message || "任务查询失败。";
      throw new ChatImageRequestError(message, 502);
    }
    const data = response.data;
    if (data.status === "succeeded") {
      return {
        status: data.status,
        resultUrls: data.resultUrls ?? undefined,
        error: data.error ?? undefined,
      };
    }
    if (data.status === "failed" || data.status === "canceled") {
      const message = data.error?.message || "图片生成失败。";
      throw new ChatImageRequestError(message, 502);
    }
    if (Date.now() - startAt > SAAS_IMAGE_TASK_TIMEOUT_MS) {
      throw new ChatImageRequestError("图片生成超时。", 504);
    }
    await sleepWithAbort(SAAS_IMAGE_TASK_POLL_MS, input.abortSignal);
  }
}

/** Download image data and resolve media type. */
async function downloadImageWithType(input: {
  url: string;
  abortSignal: AbortSignal;
}): Promise<{ buffer: Buffer; mediaType: string }> {
  if (input.url.startsWith("data:")) {
    const mediaType = resolveMediaTypeFromDataUrl(input.url) || "image/png";
    const bytes = await downloadImageData(input.url, input.abortSignal);
    return { buffer: Buffer.from(bytes), mediaType };
  }
  const response = await fetch(input.url, { signal: input.abortSignal });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`下载图片失败: ${response.status} ${text}`.trim());
  }
  const mediaType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mediaType };
}

/** Resolve the latest user message in a message list. */
function resolveLatestUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as UIMessage;
    if (message?.role === "user") return message;
  }
  return null;
}

/** Sanitize request parts for metadata persistence. */
function sanitizeRequestParts(parts: unknown[]): SanitizedRequestParts {
  const sanitized: Array<{ type: string; text?: string; url?: string; mediaType?: string }> = [];
  const warnings: string[] = [];
  const flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean } = {};
  let dataUrlCount = 0;
  let binaryCount = 0;

  for (const rawPart of parts) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    const type = typeof part.type === "string" ? part.type : "";
    if (type === "text") {
      if (typeof part.text === "string" && part.text.trim()) {
        sanitized.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (type === "file") {
      const mediaType = typeof part.mediaType === "string" ? part.mediaType : undefined;
      const url = typeof part.url === "string" ? part.url : "";
      if (url.startsWith("data:")) {
        // 逻辑：data url 不写入元信息，改为占位符。
        dataUrlCount += 1;
        flags.hasDataUrlOmitted = true;
        sanitized.push({ type: "file", url: "[data-url-omitted]", mediaType });
        continue;
      }
      if (!url) {
        // 逻辑：未知二进制内容不写入元信息，改为占位符。
        binaryCount += 1;
        flags.hasBinaryOmitted = true;
        sanitized.push({ type: "file", url: "[binary-omitted]", mediaType });
        continue;
      }
      sanitized.push({ type: "file", url, mediaType });
    }
  }

  if (dataUrlCount > 0) {
    warnings.push(`metadata omitted ${dataUrlCount} data url(s)`);
  }
  if (binaryCount > 0) {
    warnings.push(`metadata omitted ${binaryCount} binary part(s)`);
  }

  return { parts: sanitized, flags, warnings };
}

/** Build image metadata payload for persistence. */
function buildImageMetadata(input: {
  sessionId: string;
  prompt: string;
  revisedPrompt?: string;
  modelId: string;
  chatModelId?: string;
  chatModelSource?: ChatModelSource;
  providerId?: string;
  requestMessageId?: string;
  responseMessageId?: string;
  trigger?: string;
  boardId?: string | null;
  imageOptions?: { n?: number; size?: string; aspectRatio?: string };
  messages: UIMessage[];
}): OpenLoafImageMetadataV1 {
  const latestUser = resolveLatestUserMessage(input.messages);
  const rawParts = Array.isArray((latestUser as any)?.parts) ? ((latestUser as any).parts as unknown[]) : [];
  const sanitized = sanitizeRequestParts(rawParts);
  if (sanitized.warnings.length > 0) {
    logger.warn(
      { sessionId: input.sessionId, warnings: sanitized.warnings },
      "[chat] image metadata sanitized",
    );
  }
  const projectId = getProjectId();

  return {
    version: 1,
    chatSessionId: input.sessionId,
    prompt: input.prompt,
    revised_prompt: input.revisedPrompt,
    modelId: input.modelId,
    chatModelId: input.chatModelId,
    modelSource: input.chatModelSource,
    providerId: input.providerId,
    projectId: projectId || undefined,
    boardId: input.boardId || undefined,
    trigger: input.trigger,
    requestMessageId:
      input.requestMessageId ?? (typeof (latestUser as any)?.id === "string" ? (latestUser as any).id : undefined),
    responseMessageId: input.responseMessageId,
    createdAt: new Date().toISOString(),
    imageOptions: input.imageOptions,
    request: {
      parts: sanitized.parts,
      metadata: (latestUser as any)?.metadata,
    },
    flags: sanitized.flags,
    warnings: sanitized.warnings.length > 0 ? sanitized.warnings : undefined,
  };
}
