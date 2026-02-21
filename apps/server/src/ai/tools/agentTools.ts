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

/** Spawn a new sub-agent. */
export const spawnAgentTool = tool({
  description: spawnAgentToolDef.description,
  inputSchema: zodSchema(spawnAgentToolDef.parameters),
  execute: async ({ items, agentType, modelOverride }): Promise<string> => {
    const model = getChatModel()
    if (!model) throw new Error('chat model is not available.')

    const requestContext = getRequestContext()
    if (!requestContext) throw new Error('request context is not available.')

    const context: SpawnContext = {
      model,
      writer: getUiWriter(),
      sessionId: getSessionId(),
      parentMessageId: getAssistantParentMessageId() ?? null,
      requestContext,
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
