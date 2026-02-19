import { z } from 'zod'

export const spawnAgentToolDef = {
  id: 'spawn-agent',
  name: '启动子代理',
  description:
    '触发：当你需要启动一个子代理来执行独立任务时调用。用途：创建子代理并立即返回 agentId。返回：{agent_id: string}。不适用：简单任务不需要子代理。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    task: z.string().min(1).describe('子代理要执行的任务描述。'),
    agentType: z
      .string()
      .optional()
      .describe('子代理类型，如 browser、document-analysis。'),
  }),
  component: null,
} as const

export const sendInputToolDef = {
  id: 'send-input',
  name: '发送输入',
  description:
    '触发：当你需要向已有子代理发送消息或指令时调用。用途：向子代理发送消息，返回 submission_id。返回：{submission_id: string}。不适用：子代理不存在或已关闭时不要调用。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    id: z.string().min(1).describe('子代理 ID。'),
    message: z.string().optional().describe('要发送的消息。'),
    interrupt: z
      .boolean()
      .optional()
      .describe('是否中断当前任务。'),
  }),
  component: null,
} as const

export const waitAgentToolDef = {
  id: 'wait-agent',
  name: '等待子代理',
  description:
    '触发：当你需要等待一个或多个子代理完成时调用。用途：阻塞等待子代理完成或超时。返回：{status: Record<string, string>, timed_out: boolean}。不适用：不需要等待结果时不要调用。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    ids: z
      .array(z.string().min(1))
      .min(1)
      .describe('要等待的子代理 ID 列表。'),
    timeoutMs: z
      .number()
      .int()
      .min(10000)
      .max(300000)
      .optional()
      .describe('超时毫秒数，默认 30000。'),
  }),
  component: null,
} as const

export const closeAgentToolDef = {
  id: 'close-agent',
  name: '关闭子代理',
  description:
    '触发：当你不再需要某个子代理时调用。用途：关闭子代理并释放资源。返回：{status: string}。不适用：子代理不存在时不要调用。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    id: z.string().min(1).describe('要关闭的子代理 ID。'),
  }),
  component: null,
} as const

export const resumeAgentToolDef = {
  id: 'resume-agent',
  name: '恢复子代理',
  description:
    '触发：当你需要恢复一个已关闭的子代理时调用。用途：恢复子代理到运行状态。返回：{status: string}。不适用：子代理未关闭时不要调用。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的。'),
    id: z.string().min(1).describe('要恢复的子代理 ID。'),
  }),
  component: null,
} as const
