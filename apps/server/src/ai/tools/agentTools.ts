import { tool, zodSchema } from 'ai'
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  closeAgentToolDef,
  resumeAgentToolDef,
} from '@tenas-ai/api/types/tools/agent'
import { agentManager, type SpawnContext } from '@/ai/services/agentManager'
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
  execute: async ({ task, agentType }): Promise<string> => {
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

    const agentId = agentManager.spawn({
      task,
      name: agentType || 'default',
      agentType,
      context,
    })
    return JSON.stringify({ agent_id: agentId })
  },
})

/** Send input to an existing sub-agent. */
export const sendInputTool = tool({
  description: sendInputToolDef.description,
  inputSchema: zodSchema(sendInputToolDef.parameters),
  execute: async ({ id, message, interrupt }): Promise<string> => {
    const submissionId = agentManager.sendInput(id, message, interrupt)
    return JSON.stringify({ submission_id: submissionId })
  },
})

/** Wait for sub-agents to complete. */
export const waitAgentTool = tool({
  description: waitAgentToolDef.description,
  inputSchema: zodSchema(waitAgentToolDef.parameters),
  execute: async ({ ids, timeoutMs }): Promise<string> => {
    const result = await agentManager.wait(ids, timeoutMs)
    return JSON.stringify({
      status: result.status,
      timed_out: result.timedOut,
    })
  },
})

/** Close a sub-agent. */
export const closeAgentTool = tool({
  description: closeAgentToolDef.description,
  inputSchema: zodSchema(closeAgentToolDef.parameters),
  execute: async ({ id }): Promise<string> => {
    const status = agentManager.close(id)
    return JSON.stringify({ status })
  },
})

/** Resume a shut-down sub-agent. */
export const resumeAgentTool = tool({
  description: resumeAgentToolDef.description,
  inputSchema: zodSchema(resumeAgentToolDef.parameters),
  execute: async ({ id }): Promise<string> => {
    const status = agentManager.resume(id)
    return JSON.stringify({ status })
  },
})
