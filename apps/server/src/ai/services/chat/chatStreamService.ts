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
import { resolveParentProjectRootPaths } from "@/ai/shared/util";
import { buildSessionPrefaceText } from "@/ai/shared/prefaceBuilder";
import { assembleDefaultAgentInstructions } from "@/ai/shared/agentPromptAssembler";
import {
  getProjectRootPath,
} from "@openloaf/api/services/vfsService";
import {
  initRequestContext,
  loadAndPrepareMessageChain,
  loadAndPrepareMessageChainFromIds,
  saveLastMessageAndResolveParent,
  stripImagePartsForNonVisionModel,
} from "./chatStreamHelpers";
import { resolveCodexRequestOptions, resolveClaudeCodeRequestOptions } from "./messageOptionResolver";
import {
  resolvePreviousChatModelId,
  resolveRequiredInputTags,
} from "./modelResolution";
import type { ChatStreamRequest } from "@/ai/services/chat/types";
import {
  ensureSessionPreface,
  resolveRightmostLeafId,
  resolveSessionPrefaceText,
  saveMessage,
} from "@/ai/services/chat/repositories/messageStore";
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
} from "./streamOrchestrator";
import { resolveAgentModelIds, resolveAgentSkills } from "./agentConfigResolver";
import { isCompactCommandMessage, buildCompactPromptText } from "./chatMessageUtils";

/** Re-export runChatImageRequest from its new module for backward compatibility. */
export { runChatImageRequest } from "./imageRequestOrchestrator";

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
    sessionToolRules: input.request.sessionToolRules,
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
  const sessionPrefaceResult = await buildSessionPrefaceText({
    sessionId,
    projectId: resolvedProjectId,
    selectedSkills,
    parentProjectRootPaths,
    timezone,
    clientPlatform: input.request.clientPlatform,
  });
  await ensureSessionPreface({
    sessionId,
    text: sessionPrefaceResult.prefaceText,
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
          skillsSystemText: sessionPrefaceResult.builtinSkillsText,
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
        // 完整指令 = prompt + hardRules + builtinSkills
        const skillsSuffix = sessionPrefaceResult.builtinSkillsText ? `\n\n${sessionPrefaceResult.builtinSkillsText}` : ''
        const fullPrompt = `${instructions}\n\n${buildHardRules()}${skillsSuffix}`
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

  // 逻辑：非视觉模型剥离图片 parts，替换为文本引用提示（vision SubAgent 委派）。
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
