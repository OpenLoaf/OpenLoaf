import { z } from 'zod'

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'secret', 'select']).default('text'),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional().default(true),
  defaultValue: z.string().optional(),
})

export type UserInputQuestion = z.infer<typeof questionSchema>

export const requestUserInputToolDef = {
  id: 'request-user-input',
  name: '请求用户输入',
  description:
    '触发：当需要向用户收集信息（API Key、配置参数、密码等）时调用。用途：渲染表单让用户填写，密码/密钥类字段会安全存储，不会出现在聊天历史中。返回：{ answers: { key1: "value1", key2: "{{secret:uuid}}" } }，其中 secret 类型字段返回令牌而非真实值。不适用：不需要用户输入的场景。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：收集 API Key。'),
    title: z.string().optional().describe('表单标题。'),
    description: z.string().optional().describe('表单描述说明。'),
    questions: z.array(questionSchema).min(1).describe('需要用户填写的问题列表。'),
  }),
  needsApproval: true,
  component: null,
} as const
