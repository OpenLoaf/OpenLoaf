/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { resolveSessionDir } from '@openloaf/api/services/chatSessionPaths'

/**
 * EVALUATION.json 由 chat-probe skill 的评审子 agent 写入到
 * `<sessionDir>/EVALUATION.json`。schema 与 skill 层约定同步，
 * 任何结构变动必须同时更新两侧。
 */
export const evaluationVerdictSchema = z.enum(['PASS', 'FAIL', 'PARTIAL'])

export const evaluationEvidenceSchema = z.object({
  file: z.string(),
  note: z.string(),
})

export const evaluationEvaluatorSchema = z.object({
  name: z.string(),
  verdict: evaluationVerdictSchema,
  score: z.number().min(0).max(100),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  evidence: z.array(evaluationEvidenceSchema),
})

export const evaluationAggregateSchema = z.object({
  verdict: evaluationVerdictSchema,
  score: z.number().min(0).max(100),
  tokensTotal: z.number().nullable(),
  tokensInput: z.number().nullable(),
  tokensOutput: z.number().nullable(),
  rounds: z.number(),
  toolCalls: z.array(z.string()),
  elapsedMs: z.number(),
  model: z.string().nullable(),
  summary: z.string(),
})

export const evaluationJsonSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  assistantMessageId: z.string(),
  runner: z.string(),
  createdAt: z.string(),
  aggregate: evaluationAggregateSchema,
  evaluators: z.array(evaluationEvaluatorSchema),
})

export type EvaluationJson = z.infer<typeof evaluationJsonSchema>

/** EVALUATION.json 文件名（写在 session 根目录下）。 */
export const EVALUATION_FILE_NAME = 'EVALUATION.json'

/**
 * 读取并校验指定 session 的 EVALUATION.json。
 * - 文件不存在 → 返回 null
 * - 存在但解析/校验失败 → 抛 TRPCError
 */
export async function readAutoTestEvaluation(
  sessionId: string,
): Promise<EvaluationJson | null> {
  const sessionDir = await resolveSessionDir(sessionId)
  const filePath = path.join(sessionDir, EVALUATION_FILE_NAME)

  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `读取 EVALUATION.json 失败：${(err as Error).message}`,
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `EVALUATION.json JSON 解析失败：${(err as Error).message}`,
    })
  }

  const result = evaluationJsonSchema.safeParse(parsed)
  if (!result.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `EVALUATION.json schema 校验失败：${result.error.message}`,
    })
  }
  return result.data
}
