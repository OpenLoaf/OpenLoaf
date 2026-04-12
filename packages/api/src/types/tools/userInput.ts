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

// ── Legacy form types (kept for rendering historical messages) ──

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

// ── Choice schema (the only exported mode) ──

const choiceOptionSchema = z.object({
  label: z.string().min(1).describe('Concise, 1-5 words.'),
  description: z.string().optional().describe('What happens if chosen.'),
})

const choiceSchema = z.object({
  key: z.string().min(1).describe('Used as the answer key.'),
  question: z.string().min(1).describe('If recommending a specific option, append "(recommended)" to its label.'),
  options: z.array(choiceOptionSchema).min(2).max(6).describe('Users can always pick "Other" to enter free text.'),
  multiSelect: z.boolean().optional().default(false),
})

export type UserInputChoice = z.infer<typeof choiceSchema>
export type UserInputChoiceOption = z.infer<typeof choiceOptionSchema>

// ── Tool definition ──

export const requestUserInputToolDef = {
  id: 'AskUserQuestion',
  readonly: true,
  name: 'Ask User Question',
  description:
    'Ask the user questions to gather information, clarify ambiguity, or offer choices. Users can always pick "Other" to type a custom answer. Use multiSelect to allow multiple answers. Returns { answers: { key1: "value1", ... } }.',
  parameters: z.object({
    title: z.string().describe('Short action-oriented, e.g. "Pick a test type", not "Testing plan capability".'),
    choices: z.array(choiceSchema).min(1).max(4),
  }),
  needsApproval: true,
  component: null,
} as const
