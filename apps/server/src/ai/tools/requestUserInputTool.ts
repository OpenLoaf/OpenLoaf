/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { tool, zodSchema } from 'ai'
import { requestUserInputToolDef } from '@openloaf/api/types/tools/userInput'
import { consumeToolApprovalPayload } from '@/ai/shared/context/requestContext'

type RequestUserInputOutput = {
  answers: Record<string, string>
}

/**
 * Request user input tool (approval mode).
 * LLM 调用后进入审批等待，前端渲染表单，用户提交后通过 approval payload 传回答案。
 */
export const requestUserInputTool = tool({
  description: requestUserInputToolDef.description,
  inputSchema: zodSchema(requestUserInputToolDef.parameters),
  needsApproval: true,
  execute: async (_input, { toolCallId }): Promise<RequestUserInputOutput> => {
    const payload = consumeToolApprovalPayload(toolCallId)
    const answers = (payload?.answers as Record<string, string>) ?? {}
    return { answers }
  },
})
