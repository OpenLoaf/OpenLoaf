/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

// ── Legacy form types (保留供前端渲染历史消息) ──

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'secret', 'select', 'textarea']).default('text'),
  inputType: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional().default(true),
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  pattern: z.string().optional(),
  patternMessage: z.string().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
})

export type UserInputQuestion = z.infer<typeof questionSchema>

// ── Choice schema (唯一对外暴露的模式) ──

const choiceOptionSchema = z.object({
  label: z.string().min(1).describe('选项显示文本，简洁明了（1-5 个词）。'),
  description: z.string().optional().describe('选项的补充说明，解释选择后会发生什么。'),
})

const choiceSchema = z.object({
  key: z.string().min(1).describe('该问题的唯一标识，用于返回答案的 key。'),
  question: z.string().min(1).describe('完整的问题文本，应清晰具体。如果推荐某个选项，在其 label 末尾加"（推荐）"。'),
  options: z.array(choiceOptionSchema).min(2).max(6).describe('2-6 个选项。用户始终可以选择"其他"来输入自定义文本。'),
  multiSelect: z.boolean().optional().default(false).describe('设为 true 允许多选。'),
})

export type UserInputChoice = z.infer<typeof choiceSchema>
export type UserInputChoiceOption = z.infer<typeof choiceOptionSchema>

// ── Tool definition ──

export const requestUserInputToolDef = {
  id: 'AskUserQuestion',
  readonly: true,
  name: '请求用户输入',
  description:
    'Asks the user questions to gather information, clarify ambiguity, understand preferences, or offer choices.\n'
    + 'Usage notes:\n'
    + '- Users can always select "Other" to provide custom text input\n'
    + '- Use multiSelect: true to allow multiple answers\n'
    + '- If you recommend a specific option, add "（推荐）" at the end of its label\n'
    + 'Returns: { answers: { key1: "value1", ... } }',
  parameters: z.object({
    title: z.string().describe('简短的行动导向标题，让用户一眼知道要做什么（如"选择测试类型"而非"测试计划能力"）。'),
    choices: z.array(choiceSchema).min(1).max(4).describe('1-4 组问题，每组包含问题文本和选项。'),
  }),
  needsApproval: true,
  component: null,
} as const
