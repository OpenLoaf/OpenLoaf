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
import type { OpenLoafUIMessage } from "@openloaf/api/types/message";
import { createMasterAgentRunner, createPMAgentRunner } from "@/ai";
import { getTemplate, isTemplateId } from "@/ai/agent-templates";
import { resolveChatModel } from "@/ai/models/resolveChatModel";
import { resolveCliChatModelId } from "@/ai/models/cli/cliProviderEntry";
import { extractTextFromParts } from "@/ai/services/chat/chatStreamUtils";
import {
  setChatModel,
  setChatModelDefinition,
  setCodexOptions,
  setClaudeCodeOptions,
  setParentProjectRootPaths,
  setAssistantParentMessageId,
  setCliSession,
  setCliRewindTarget,
  getProjectId,
  setPlanUpdate,
  setCurrentPlanNo,
  markPlanNoAllocated,
} from "@/ai/shared/context/requestContext";
import {
  getCachedCcSession,
  setCachedCcSession,
} from "@/ai/models/cli/claudeCode/claudeCodeSessionStore";
import { logger } from "@/common/logger";
import { resolveParentProjectRootPaths } from "@/ai/shared/util";
import { buildSessionPrefaceText, buildBuiltinSkillsText } from "@/ai/shared/prefaceBuilder";
import { assembleDefaultAgentInstructions } from "@/ai/shared/agentPromptAssembler";
import {
  getProjectRootPath,
} from "@openloaf/api/services/vfsService";
import {
  initRequestContext,
  loadAndPrepareMessageChain,
  loadAndPrepareMessageChainFromIds,
  saveLastMessageAndResolveParent,
  stripUnsupportedMediaPartsForModel,
  sanitizePartialParts,
} from "./chatStreamHelpers";
import { resolveCodexRequestOptions, resolveClaudeCodeRequestOptions } from "./messageOptionResolver";
import type { ChatStreamRequest } from "@/ai/services/chat/types";
import {
  ensureSessionPreface,
  resolveRightmostLeafId,
  resolveSessionPrefaceText,
  saveMessage,
  updateSessionTitle,
} from "@/ai/services/chat/repositories/messageStore";
import { readBasicConf, writeBasicConf } from "@/modules/settings/openloafConfStore";
import { fetchModelList } from "@/modules/saas";
import { ensureServerAccessToken } from "@/modules/auth/tokenStore";
import { mapCloudChatModels } from "@/ai/models/cloudModelMapper";
import {
  resolveMessagesJsonlPath,
  updateMessageMetadata,
  writeSessionJson,
} from "@/ai/services/chat/repositories/chatFileStore";
import { loadMessageTree } from "@/ai/services/chat/repositories/chatMessageTreeIndex";
import {
  ACTIVATED_TOOLS_METADATA_KEY,
  ActivatedToolSet,
  CORE_TOOLS_METADATA_KEY,
} from "@/ai/tools/toolSearchState";
import { MASTER_CORE_TOOL_IDS } from "@/ai/shared/coreToolIds";
import { loadToolApprovalRulesForRequest } from "@/ai/tools/toolApprovalRulesLoader";
import { buildHardRules } from "@/ai/shared/hardRules";
import { scheduleExecutor } from "@/services/scheduleExecutor";
import {
  createTask as createTaskConfig,
  findActivePmTask,
  updateTask,
} from "@/services/scheduleConfigService";
import { extractSourceContextSnapshot } from "@/services/taskContextExtractor";
import { getOpenLoafRootDir } from "@openloaf/config";
import {
  createAgentRouteAckResponse,
  createChatStreamResponse,
  createErrorStreamResponse,
} from "./streamOrchestrator";
import { resolveAgentModelIds, resolveAgentSkills } from "./agentConfigResolver";
import { isCompactCommandMessage, buildCompactPromptText } from "./chatMessageUtils";

/** Re-export runChatImageRequest from its new module for backward compatibility. */
export { runChatImageRequest } from "./imageRequestOrchestrator";

/**
 * Restore plan + planNo from the last SubmitPlan tool call in the message chain.
 * Scans tool parts (not metadata) to find the most recent plan,
 * then restores it into RequestContext for plan context injection in prepareStep.
 */
async function restoreBasePlanFromChain(messages: UIMessage[]): Promise<void> {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any;
    if (msg?.role !== "assistant") continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j] as any;
      const toolName = part?.toolName ?? part?.type?.replace?.("tool-", "") ?? "";
      if (toolName !== "SubmitPlan") continue;
      // Skip rejected plans (output-error) — look for approved/active ones.
      if (part.state === "output-error") continue;

      // SubmitPlan: read plan from PLAN file on disk, resolving path via Write's logic.
      const planFilePathInput = typeof part.input?.planFilePath === "string" ? part.input.planFilePath : "";
      if (planFilePathInput) {
        try {
          const { readPlanFileFromAbsPath, derivePlanNoFromPath } = await import("@/ai/services/chat/planFileService");
          const { resolveWriteTargetPath } = await import("@/ai/tools/fileTools");
          const { absPath } = await resolveWriteTargetPath(planFilePathInput);
          const planNoFromPath = derivePlanNoFromPath(planFilePathInput);
          const planData = await readPlanFileFromAbsPath(absPath, planNoFromPath);
          if (planData && planData.steps.length > 0) {
            setPlanUpdate({
              actionName: planData.actionName,
              explanation: planData.explanation,
              plan: planData.steps,
            });
            if (planNoFromPath > 0) {
              setCurrentPlanNo(planNoFromPath);
              markPlanNoAllocated();
            }
            return;
          }
        } catch {
          // Path resolution or file read failed, continue scanning
        }
      }
    }
  }
}

/**
 * 当 chatModelId 为空时，从 SaaS 模型列表取第一个模型作为默认值，
 * 并将其写入 basic config，避免后续请求重复 fallback。
 * 返回 "providerId:modelId" 格式的 chatModelId，或 undefined（获取失败时抛错）。
 */
async function resolveDefaultCloudChatModelId(sessionId: string): Promise<string> {
  logger.info({ sessionId }, '[chat] chatModelId empty, fetching default from SaaS model list')
  const accessToken = (await ensureServerAccessToken()) ?? ''
  if (!accessToken) {
    throw new Error('未登录云端账号，无法自动获取默认模型')
  }
  const payload = await fetchModelList(accessToken)
  if (payload.success !== true || !Array.isArray(payload.data?.data) || payload.data.data.length === 0) {
    throw new Error('云端模型列表为空，无法自动选择默认模型')
  }
  const models = mapCloudChatModels(payload.data.data)
  const first = models[0]
  if (!first) {
    throw new Error('云端模型列表解析后为空，无法自动选择默认模型')
  }
  // chatModelId 格式：providerId:modelId（与 resolveChatModelFromProviders 中的 parseChatModelId 一致）
  const chatModelId = `${first.providerId}:${first.id}`
  logger.info(
    { sessionId, chatModelId, modelName: first.name },
    '[chat] auto-selected default cloud model, saving to basic config',
  )
  // 写入 basic config，后续请求直接使用，不再 fallback
  try {
    const basicConf = readBasicConf()
    writeBasicConf({ ...basicConf, chatModelId, chatSource: 'cloud' })
  } catch (err) {
    logger.warn({ err, sessionId }, '[chat] failed to save default chatModelId to basic config')
  }
  return chatModelId
}

/** Run chat stream and return SSE response. */
export async function runChatStream(input: {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
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

  // 逻辑：chatModelId 必须由前端显式传入（对应 model picker 当前选中的模型），
  // 避免同一条消息的多次 attempt 因 master agent.json 被中途修改而切模型。
  // master agent 配置仅作为前端未传时的兜底（bg-drain 等内部场景可能没法传）。
  const agentModelIds = resolveAgentModelIds({ projectId })
  let chatModelId: string | undefined
  let chatModelSource: typeof agentModelIds.chatModelSource
  if (input.request.chatModelId) {
    chatModelId = input.request.chatModelId
    chatModelSource = input.request.chatModelSource ?? agentModelIds.chatModelSource
  } else {
    chatModelId = agentModelIds.chatModelId
    chatModelSource = agentModelIds.chatModelSource
    logger.warn(
      { sessionId, projectId, fallbackChatModelId: chatModelId },
      "[chat] request missing chatModelId — falling back to master agent config. " +
        "Frontend should always send the active chatModelId explicitly.",
    )
  }

  // 逻辑：优先从 master agent config 读取已启用技能，/skill/ 命令作为临时覆盖。
  const configSkills = resolveAgentSkills({ projectId })
  const selectedSkills = configSkills
  // 加载审批规则：项目对话 → 项目规则；临时对话 → 全局临时对话白名单。
  const toolApprovalRules = await loadToolApprovalRulesForRequest(projectId)
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
    toolApprovalRules,
    autoApproveTools: input.request.autoApproveTools,
    requestSignal: input.requestSignal,
    messageId,
    clientPlatform: input.request.clientPlatform,
    webVersion: input.request.webVersion,
    serverVersion: input.request.serverVersion,
    desktopVersion: input.request.desktopVersion,
    pageContext: input.request.pageContext,
  });

  // ── Continue mode: 从中断的 assistant turn 断点继续 ──
  const isContinueMode = Boolean(input.request.continue);
  let continueReplayParts: unknown[] | null = null;
  if (isContinueMode && assistantMessageId) {
    try {
      const tree = await loadMessageTree(sessionId);
      const partialMsg = tree.byId.get(assistantMessageId);
      if (partialMsg && partialMsg.role === "assistant") {
        const rawParts = Array.isArray(partialMsg.parts) ? partialMsg.parts : [];
        continueReplayParts = sanitizePartialParts(rawParts);
        logger.info(
          { sessionId, assistantMessageId, partCount: continueReplayParts.length },
          "[chat] continue mode: loaded partial assistant parts",
        );
      }
    } catch (err) {
      logger.warn({ err, sessionId, assistantMessageId }, "[chat] continue mode: load partial parts failed");
    }
  }

  const lastMessage = incomingMessages.at(-1) as OpenLoafUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求无效：缺少最后一条消息。",
    });
  }

  // 逻辑：bg-drain — 前端检测到后台任务终态 + AI 空闲后自动触发的 drain turn。
  // 在保存前把 <bg-drain> 占位消息重写为真正的 bg-notification 内容，
  // 这样消息树和前端卡片都正确，AI 也能在 modelMessages 里看到通知。
  const isBgDrain = (lastMessage as any).metadata?.openloaf?.syntheticKind === 'bg-drain';
  if (isBgDrain) {
    const { backgroundProcessManager } = await import(
      '@/ai/services/background/BackgroundProcessManager'
    );
    const notifications = backgroundProcessManager.drainNotifications(sessionId, 'later');
    if (notifications.length === 0) {
      return new Response(null, { status: 204 });
    }
    // 重写消息内容为 notification XML
    const innerXml = notifications.map((n) => n.xmlContent).join('\n');
    const wrappedContent = `<system-tag type="reminder">\n${innerXml}\n</system-tag>`;
    const taskIds = notifications.map((n) => n.taskId);
    (lastMessage as any).parts = [{ type: 'text', text: wrappedContent }];
    (lastMessage as any).metadata = {
      ...((lastMessage as any).metadata ?? {}),
      openloaf: {
        syntheticKind: 'bg-notification',
        isMeta: true,
        taskIds,
      },
    };
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

      if (activePmTask && scheduleExecutor.isRunning(activePmTask.id)) {
        // Append message to existing PM task
        const sent = await scheduleExecutor.appendUserMessage(
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
        void scheduleExecutor.execute(newTask.id, globalRoot, targetProjectRoot);
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

  // 逻辑：首条消息 / compact 时重建 preface 并落库；其余请求复用 DB 中的 preface。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  // 提示词语言：整条请求链路共用，preface/hardRules/agent instructions 保持一致。
  const promptLang: 'zh' | 'en' = readBasicConf().promptLanguage === 'zh' ? 'zh' : 'en';
  const isCompactCommand = isCompactCommandMessage(lastMessage);
  const existingPreface = await resolveSessionPrefaceText(sessionId);
  let prefaceText: string;
  let builtinSkillsText: string;
  if (!existingPreface || isCompactCommand) {
    const result = await buildSessionPrefaceText({
      sessionId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
      timezone,
      clientPlatform: input.request.clientPlatform,
      lang: promptLang,
    });
    prefaceText = result.prefaceText;
    builtinSkillsText = result.builtinSkillsText;
    await ensureSessionPreface({
      sessionId,
      text: prefaceText,
      createdAt: requestStartAt,
      projectId: resolvedProjectId,
      boardId: boardId ?? undefined,
    });
  } else {
    prefaceText = existingPreface;
    builtinSkillsText = buildBuiltinSkillsText(promptLang);
  }

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

  // 显式标题覆盖（ai-browser-test 等自动化场景传入 title 字段）
  if (input.request.title) {
    await updateSessionTitle({ sessionId, title: input.request.title });
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

    const isResume = Boolean(sdkSessionId);
    if (!sdkSessionId) {
      // 首条消息：新建 UUID + 写 DB + session.json
      sdkSessionId = crypto.randomUUID();
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { cliId: `claude-code_${sdkSessionId}` },
      });
      await writeSessionJson(sessionId, { cliId: `claude-code_${sdkSessionId}` });
    }

    // 写入 RequestContext + 内存缓存
    setCliSession(sdkSessionId);
    setCachedCcSession(sessionId, {
      sdkSessionId,
      modelId: "",
      lastUsedAt: Date.now(),
    });

    logger.debug(
      { sessionId, sdkSessionId, isResume },
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
  // 从历史消息链恢复 plan + planNo，使跨请求 plan context 注入和 planNo 复用可用。
  if (!directCli && messages.length > 0) {
    await restoreBasePlanFromChain(messages);
  }

  // ── Continue mode: 将 partial assistant 内容注入 modelMessages，使模型从断点继续 ──
  if (isContinueMode && continueReplayParts && continueReplayParts.length > 0 && !directCli) {
    modelMessages.push({
      id: `__continue_prefill_${assistantMessageId}`,
      role: "assistant",
      parts: continueReplayParts,
    } as UIMessage);
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

  // 逻辑：chatModelId 仍为空（basic config 也未配置）时，尝试从 SaaS 模型列表自动选择第一个模型。
  // 仅在 cloud source 下触发；local source 下无法自动获取，直接交由 resolveChatModel 报错。
  if (!chatModelId && chatModelSource === 'cloud') {
    try {
      chatModelId = await resolveDefaultCloudChatModelId(sessionId)
    } catch (err) {
      logger.error({ err, sessionId }, '[chat] auto-resolve default cloud model failed')
      const errorText = err instanceof Error ? `请求失败：${err.message}` : '请求失败：无法自动获取默认模型。'
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId,
        errorText,
      })
    }
  }

  try {
    // 前端必传 chatModelId — model picker 当前活跃的模型。
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource,
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
      // 前端 transport 将 params 展平到顶层，scheduleExecutor 则放在 params 下——两处都要读取。
      const agentType = input.request.agentType ?? input.request.params?.agentType;
      const rawTaskId = input.request.taskId ?? input.request.params?.taskId;
      const taskId = typeof rawTaskId === 'string' ? rawTaskId : undefined;
      if (agentType === 'pm') {
        masterAgent = createPMAgentRunner({
          model: resolved.model,
          modelInfo: resolved.modelInfo,
          taskId,
          projectId: input.request.projectId,
          lang: promptLang,
        });
      } else {
        // 逻辑：组装默认 agent instructions（template.systemPrompt）。
        instructions = assembleDefaultAgentInstructions({ lang: promptLang });

        // agentHint：当请求 params 中包含 agentHint 时，使用对应模版的 systemPrompt 替换 instructions
        const agentHint = input.request.params?.agentHint;
        if (typeof agentHint === 'string' && agentHint.trim() && isTemplateId(agentHint.trim())) {
          const hintTemplate = getTemplate(agentHint.trim());
          if (hintTemplate && !hintTemplate.isPrimary) {
            instructions = hintTemplate.systemPrompt;
          }
        }

        // 在调用 agentFactory 前把「本轮工具可见集」快照写回当前 user 消息的
        // metadata。两个独立字段：
        // - activatedToolIds: 动态 delta —— 截至本轮开始时所有通过 ToolSearch
        //   加载过的工具 ID（继承上一条 user 快照 + 两者之间 assistant 新增工具）。
        //   rehydrate 读此字段快速恢复；老 session 无快照时退化为历史全扫。
        // - coreToolIds: 常驻工具快照 —— 纯展示用，调试视图分组渲染时读，
        //   rehydrate 不依赖（常驻工具每次从 CORE_TOOL_IDS 重新解析）。
        try {
          const targetUserIdx = messages.findIndex((m) => m.id === assistantParentUserId);
          if (targetUserIdx >= 0) {
            const snapshot = ActivatedToolSet.computeSnapshotForUserMessage(
              messages as unknown as {
                role: string;
                parts?: unknown[];
                metadata?: Record<string, unknown> | null;
              }[],
              targetUserIdx,
            );
            await updateMessageMetadata({
              sessionId,
              messageId: assistantParentUserId,
              metadata: {
                [ACTIVATED_TOOLS_METADATA_KEY]: snapshot,
                [CORE_TOOLS_METADATA_KEY]: [...MASTER_CORE_TOOL_IDS],
              },
            });
          }
        } catch (err) {
          logger.warn(
            { err, sessionId, assistantParentUserId },
            "[chat] persist tool snapshot failed",
          );
        }

        masterAgent = createMasterAgentRunner({
          model: resolved.model,
          modelInfo: resolved.modelInfo,
          instructions,
          messages: modelMessages,
          skillsSystemText: builtinSkillsText,
          lang: promptLang,
        });
      }
    }
    setChatModel(resolved.model);
    resolvedModelDef = resolved.modelDefinition ?? undefined;
    setChatModelDefinition(resolvedModelDef);
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
        // 完整指令 = prompt + hardRules + builtinSkills
        const skillsSuffix = builtinSkillsText ? `\n\n${builtinSkillsText}` : ''
        const fullPrompt = `${instructions}\n\n${buildHardRules(promptLang)}${skillsSuffix}`
        await fs.writeFile(path.join(sessionDir, 'PROMPT.md'), fullPrompt, 'utf-8')
        // sessionPreface → 独立 PREFACE.md
        if (prefaceText) {
          await fs.writeFile(path.join(sessionDir, 'PREFACE.md'), prefaceText, 'utf-8')
        }
      }
    } catch (err) {
      logger.warn({ err, sessionId }, '[chat] failed to save PROMPT.md / PREFACE.md')
    }
  }

  // 逻辑：非视觉模型剥离图片 parts，替换为文本引用提示（vision SubAgent 委派）。
  if (!directCli) {
    modelMessages = stripUnsupportedMediaPartsForModel(modelMessages, resolvedModelDef);
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
    replayParts: continueReplayParts ?? undefined,
    isBgDrain,
    temperature: input.request.temperature,
    modelDefinition: resolvedModelDef,
  });
}
