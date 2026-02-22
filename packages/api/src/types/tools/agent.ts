import { z } from 'zod'

export const spawnAgentToolDef = {
  id: 'spawn-agent',
  name: '启动子代理',
  description:
    '触发：当你需要启动一个子代理来执行独立任务时调用。用途：创建子代理并立即返回 agentId。返回：{agent_id: string}。不适用：简单任务不需要子代理。',
  parameters: z.object({
    items: z
      .array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('text'),
            text: z.string().min(1),
          }),
          z.object({
            type: z.literal('file'),
            path: z.string().min(1),
          }),
        ]),
      )
      .min(1)
      .describe('子代理输入，支持文本和文件引用。纯文本场景用 [{type:"text",text:"..."}]。'),
    agentType: z
      .string()
      .optional()
      .describe('子代理类型：系统 Agent 名称（master/document/shell/browser/email/calendar/widget/project）或自定义 Agent 名称。'),
    modelOverride: z
      .string()
      .optional()
      .describe('模型覆盖，格式为 "provider:modelId"（如 "openai:gpt-4o"）。留空则使用 Agent 自身配置或 Auto。'),
    config: z
      .object({
        systemPrompt: z.string().optional().describe('自定义系统提示词。'),
        toolIds: z.array(z.string()).optional().describe('工具 ID 列表。'),
      })
      .optional()
      .describe('内联 agent 配置，用于创建动态自定义 agent。与 agentType 互斥。'),
  }),
  component: null,
} as const

export const sendInputToolDef = {
  id: 'send-input',
  name: '发送输入',
  description:
    '触发：当你需要向已有子代理发送消息或指令时调用。用途：向子代理发送消息，返回 submission_id。返回：{submission_id: string}。不适用：子代理不存在或已关闭时不要调用。',
  parameters: z.object({
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
      .describe('超时毫秒数，默认 300000（5 分钟）。'),
  }),
  component: null,
} as const

export const abortAgentToolDef = {
  id: 'abort-agent',
  name: '中止子代理',
  description:
    '触发：当你不再需要某个子代理时调用。用途：中止正在运行的子代理，返回已产生的输出。返回：{status: string, output: string}。不适用：子代理不存在时不要调用。',
  parameters: z.object({
    id: z.string().min(1).describe('要中止的子代理 ID。'),
  }),
  component: null,
} as const
