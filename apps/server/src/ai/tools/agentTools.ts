/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from '@openloaf/api/types/tools/agent'
import { agentManager, type SpawnContext, type SpawnItem } from '@/ai/services/agentManager'
import {
  getChatModel,
  getUiWriter,
  getSessionId,
  getAssistantParentMessageId,
  getRequestContext,
} from '@/ai/shared/context/requestContext'
import type { RequestContext } from '@/ai/shared/context/requestContext'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { resolveEffectiveAgentName } from '@/ai/services/agentFactory'
import {
  resolveAgentModelIdsFromConfig,
  type AgentModelIds,
} from '@/ai/shared/resolveAgentModelFromConfig'

/** Resolve the model for a spawn-agent call.
 *
 * Priority:
 * 1. modelOverride — explicit override from tool call
 * 2. agentType — read from agent config
 * 3. config.model — (reserved for future inline model)
 * 4. fallback — master agent's current model
 */
async function resolveSpawnModel(input: {
  agentType?: string
  modelOverride?: string
  requestContext: RequestContext
}): Promise<{ model: LanguageModelV3; agentModelIds?: AgentModelIds }> {
  // 1. modelOverride 最高优先
  if (input.modelOverride) {
    const resolved = await resolveChatModel({ chatModelId: input.modelOverride })
    return { model: resolved.model }
  }

  // 2. 从指定 agent 配置读取模型
  if (input.agentType) {
    const agentModelIds = resolveAgentModelIdsFromConfig({
      agentName: input.agentType,
      workspaceId: input.requestContext.workspaceId,
      projectId: input.requestContext.projectId,
      parentRoots: input.requestContext.parentProjectRootPaths,
    })
    if (agentModelIds.chatModelId) {
      const resolved = await resolveChatModel({
        chatModelId: agentModelIds.chatModelId,
        chatModelSource: agentModelIds.chatModelSource,
      })
      return { model: resolved.model, agentModelIds }
    }
    // 逻辑：agent 配置无 chat model，但可能有 media model override。
    if (agentModelIds.imageModelId || agentModelIds.videoModelId) {
      const masterModel = getChatModel()
      if (!masterModel) throw new Error('chat model is not available.')
      return { model: masterModel, agentModelIds }
    }
  }

  // 3. fallback: master 的模型
  const masterModel = getChatModel()
  if (!masterModel) throw new Error('chat model is not available.')
  return { model: masterModel }
}

/** Spawn a new sub-agent. */
export const spawnAgentTool = tool({
  description: spawnAgentToolDef.description,
  inputSchema: zodSchema(spawnAgentToolDef.parameters),
  inputExamples: [
    {
      input: {
        items: [{ type: 'text', text: '分析 src/utils 目录下的所有 TypeScript 文件，总结主要的工具函数及其用途。' }],
        agentType: 'shell',
      },
    },
    {
      input: {
        items: [
          { type: 'text', text: '阅读以下文件并生成重构建议：' },
          { type: 'file', path: 'src/components/Dashboard.tsx' },
        ],
      },
    },
  ],
  execute: async ({ items, agentType, modelOverride, config }): Promise<string> => {
    const requestContext = getRequestContext()
    if (!requestContext) throw new Error('request context is not available.')

    const { model, agentModelIds } = await resolveSpawnModel({
      agentType,
      modelOverride,
      requestContext,
    })

    // 逻辑：将 agent 级 media model 覆盖合并到 requestContext。
    const mediaOverrides = agentModelIds
      ? {
          ...(agentModelIds.imageModelId ? { imageModelId: agentModelIds.imageModelId } : {}),
          ...(agentModelIds.videoModelId ? { videoModelId: agentModelIds.videoModelId } : {}),
        }
      : {}
    const requestContextForSpawn =
      Object.keys(mediaOverrides).length > 0
        ? { ...requestContext, ...mediaOverrides }
        : requestContext

    const context: SpawnContext = {
      model,
      writer: getUiWriter(),
      sessionId: getSessionId(),
      parentMessageId: getAssistantParentMessageId() ?? null,
      requestContext: requestContextForSpawn,
    }

    const spawnItems = items as SpawnItem[]
    const task = spawnItems.map((i) => i.type === 'text' ? i.text : `[file: ${i.path}]`).join('\n')

    // 逻辑：config 参数存在时，传递 inlineConfig 给 agentManager。
    const inlineConfig = config
      ? {
          ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
          ...(config.toolIds?.length ? { toolIds: config.toolIds } : {}),
        }
      : undefined

    // Derive current depth from agentStack (each frame = 1 depth level)
    const currentDepth = requestContext.agentStack?.length ?? 0

    // 逻辑：禁止 spawn master agent 作为子 agent。
    const effectiveName = resolveEffectiveAgentName(agentType)
    if (effectiveName === 'master') {
      throw new Error('Cannot spawn master agent as a sub-agent.')
    }

    // 逻辑：禁止 agent 创建和自己同类型的子 agent，防止无意义递归。
    const stack = requestContext.agentStack ?? []
    if (stack.length > 0 && agentType) {
      const parentName = resolveEffectiveAgentName(stack[stack.length - 1]!.name)
      const childName = resolveEffectiveAgentName(agentType)
      if (parentName === childName) {
        throw new Error(
          `Agent "${agentType}" cannot spawn a sub-agent of the same type. Try a different approach or use available tools directly.`,
        )
      }
    }

    const agentId = agentManager.spawn({
      task,
      items: spawnItems,
      name: agentType || 'default',
      agentType,
      modelOverride,
      context,
      depth: currentDepth,
      inlineConfig,
    })
    return JSON.stringify({ agent_id: agentId })
  },
})

/** Send input to an existing sub-agent (auto-recovers from JSONL if not in memory). */
export const sendInputTool = tool({
  description: sendInputToolDef.description,
  inputSchema: zodSchema(sendInputToolDef.parameters),
  execute: async ({ id, message, interrupt }): Promise<string> => {
    const model = getChatModel()
    const requestContext = getRequestContext()

    // 逻辑：构建 SpawnContext 供 JSONL 恢复使用。
    const context: SpawnContext | undefined =
      model && requestContext
        ? {
            model,
            writer: getUiWriter(),
            sessionId: getSessionId(),
            parentMessageId: getAssistantParentMessageId() ?? null,
            requestContext,
          }
        : undefined

    const submissionId = await agentManager.sendInput(id, message, interrupt, context)
    return JSON.stringify({ submission_id: submissionId })
  },
})

/** Wait for sub-agents to complete (ANY semantics). */
export const waitAgentTool = tool({
  description: waitAgentToolDef.description,
  inputSchema: zodSchema(waitAgentToolDef.parameters),
  execute: async ({ ids, timeoutMs }): Promise<string> => {
    const result = await agentManager.wait(ids, timeoutMs)
    // 逻辑：将每个 agent 的输出文本附带在结果中，供 master agent 使用。
    const outputs: Record<string, string | null> = {}
    const errors: Record<string, string | null> = {}
    for (const id of ids) {
      const agent = agentManager.getAgent(id)
      outputs[id] = agent?.outputText || null
      errors[id] = agent?.error || null
    }
    return JSON.stringify({
      completed_id: result.completedId,
      status: result.status,
      outputs,
      errors,
      timed_out: result.timedOut,
    })
  },
})

/** Abort a sub-agent and return its output. */
export const abortAgentTool = tool({
  description: abortAgentToolDef.description,
  inputSchema: zodSchema(abortAgentToolDef.parameters),
  execute: async ({ id }): Promise<string> => {
    const result = agentManager.abort(id)
    return JSON.stringify({ status: result.status, output: result.output })
  },
})
