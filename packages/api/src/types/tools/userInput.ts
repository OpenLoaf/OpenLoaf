import { z } from 'zod'

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'secret', 'select', 'textarea']).default('text')
    .describe('渲染类型。text=单行输入，secret=密码，select=下拉选择，textarea=多行文本。注意：email/number/tel/url 不是合法值，请用 type:"text" 配合 inputType 字段。'),
  inputType: z.string().optional()
    .describe('HTML input type 属性，仅当 type="text" 时生效。例如 "email"、"number"、"tel"、"url"。'),
  options: z.array(z.string()).optional()
    .describe('type="select" 时的下拉选项列表。'),
  required: z.boolean().optional().default(true),
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  pattern: z.string().optional()
    .describe('正则表达式字符串，用于校验输入值。例如 "^1[3-9]\\\\d{9}$"。'),
  patternMessage: z.string().optional()
    .describe('pattern 校验失败时的提示信息。'),
  minLength: z.number().int().min(0).optional()
    .describe('最小字符数。'),
  maxLength: z.number().int().min(1).optional()
    .describe('最大字符数。'),
})

export type UserInputQuestion = z.infer<typeof questionSchema>

const choiceOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
})

const choiceSchema = z.object({
  key: z.string().min(1),
  question: z.string().min(1),
  options: z.array(choiceOptionSchema).min(2).max(6),
  multiSelect: z.boolean().optional().default(false),
})

export type UserInputChoice = z.infer<typeof choiceSchema>
export type UserInputChoiceOption = z.infer<typeof choiceOptionSchema>

export const requestUserInputToolDef = {
  id: 'request-user-input',
  name: '请求用户输入',
  description:
    '向用户收集信息，支持两种模式：\n'
    + '1. form 模式（默认）：渲染表单。type 只能是 text/secret/select/textarea（渲染类型），不要传 email/number/tel/url 给 type。如需 email/number 等 HTML 输入类型，请用 type:"text" + inputType:"email"。校验用 pattern（正则字符串）、minLength、maxLength。\n'
    + '   示例：{ "key":"email", "label":"邮箱", "type":"text", "inputType":"email", "pattern":"^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$", "patternMessage":"请输入有效邮箱" }\n'
    + '2. choice 模式：展示选项卡让用户选择，支持单选/多选。\n'
    + '返回：{ answers: { key1: "value1", ... } }',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：收集 API Key。'),
    title: z.string().optional().describe('标题。'),
    description: z.string().optional().describe('描述说明。'),
    mode: z.enum(['form', 'choice']).default('form').describe('交互模式：form 表单输入，choice 选项选择。'),
    questions: z.array(questionSchema).optional().describe('form 模式的问题列表。'),
    choices: z.array(choiceSchema).optional().describe('choice 模式的选项组列表。'),
  }).refine(
    (d) => d.mode === 'form'
      ? d.questions && d.questions.length > 0
      : d.choices && d.choices.length > 0,
    { message: 'form 模式需要 questions，choice 模式需要 choices' },
  ),
  needsApproval: true,
  component: null,
} as const
