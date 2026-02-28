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
  inputExamples: [
    {
      input: {
        actionName: '确认文件整理方案',
        mode: 'choice' as const,
        title: '文件整理',
        description: '是否按上述方案整理文件？',
        choices: [
          {
            key: 'confirm',
            question: '请选择操作',
            options: [
              { label: '立即执行', description: '按方案移动所有文件' },
              { label: '修改方案', description: '我想调整分类规则' },
              { label: '取消', description: '暂不整理' },
            ],
          },
        ],
      },
    },
  ] as any,
  needsApproval: true,
  execute: async (_input, { toolCallId }): Promise<RequestUserInputOutput> => {
    const payload = consumeToolApprovalPayload(toolCallId)
    const answers = (payload?.answers as Record<string, string>) ?? {}
    return { answers }
  },
})
