import { tool, zodSchema } from 'ai'
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from '@tenas-ai/api/types/tools/agent'
import { agentManager, type SpawnContext, type SpawnItem } from '@/ai/services/agentManager'
import {
  getChatModel,
  getUiWriter,
  getSessionId,
  getAssistantParentMessageId,
  getRequestContext,
} from '@/ai/shared/context/requestContext'
import type { RequestContext } from '@/ai/shared/context/requestContext'
import { resolveEffectiveAgentName } from '@/ai/agents/subagent/subAgentFactory'
import { isSystemAgentId } from '@/ai/shared/systemAgentDefinitions'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'
import { readAgentJson, resolveAgentDir } from '@/ai/shared/defaultAgentResolver'
import {
  getProjectRootPath,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from '@tenas-ai/api/services/vfsService'

type MediaModelOverrides = {
  /** Image model id override. */
  imageModelId?: string
  /** Video model id override. */
  videoModelId?: string
}

/** Resolve media model overrides from agent config. */
function resolveAgentMediaOverrides(input: {
  agentType?: string
  requestContext: RequestContext
}): MediaModelOverrides | null {
  if (!input.agentType) return null
  const effectiveName = resolveEffectiveAgentName(input.agentType)
  const workspaceRoot =
    input.requestContext.workspaceId
      ? getWorkspaceRootPathById(input.requestContext.workspaceId)
      : getWorkspaceRootPath()
  const projectRoot = input.requestContext.projectId
    ? getProjectRootPath(
        input.requestContext.projectId,
        input.requestContext.workspaceId,
      )
    : null

  // 逻辑：系统 Agent 优先读取 .tenas/agents/<id>/agent.json。
  if (isSystemAgentId(effectiveName)) {
    const roots = [projectRoot, workspaceRoot].filter(
      (root): root is string => Boolean(root),
    )
    for (const rootPath of roots) {
      const descriptor = readAgentJson(resolveAgentDir(rootPath, effectiveName))
      if (!descriptor) continue
      const imageModelId = descriptor.imageModelId?.trim() || undefined
      const videoModelId = descriptor.videoModelId?.trim() || undefined
      if (imageModelId || videoModelId) {
        return { imageModelId, videoModelId }
      }
    }
  }

  // 逻辑：自定义 Agent 从 AGENT.md 配置解析（legacy 路径）。
  const match = resolveAgentByName(input.agentType, {
    projectRoot: projectRoot ?? undefined,
    parentRoots: input.requestContext.parentProjectRootPaths,
    workspaceRoot: workspaceRoot ?? undefined,
  })
  if (match?.config) {
    const imageModelId = match.config.imageModelId?.trim() || undefined
    const videoModelId = match.config.videoModelId?.trim() || undefined
    if (imageModelId || videoModelId) {
      return { imageModelId, videoModelId }
    }
  }

  return null
}

/** Spawn a new sub-agent. */
export const spawnAgentTool = tool({
  description: spawnAgentToolDef.description,
  inputSchema: zodSchema(spawnAgentToolDef.parameters),
  execute: async ({ items, agentType, modelOverride }): Promise<string> => {
    const model = getChatModel()
    if (!model) throw new Error('chat model is not available.')

    const requestContext = getRequestContext()
    if (!requestContext) throw new Error('request context is not available.')

    const mediaOverrides = resolveAgentMediaOverrides({
      agentType,
      requestContext,
    })
    const requestContextForSpawn = mediaOverrides
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

    const agentId = agentManager.spawn({
      task,
      items: spawnItems,
      name: agentType || 'default',
      agentType,
      modelOverride,
      context,
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
    for (const id of ids) {
      const agent = agentManager.getAgent(id)
      outputs[id] = agent?.outputText || null
    }
    return JSON.stringify({
      completed_id: result.completedId,
      status: result.status,
      outputs,
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
