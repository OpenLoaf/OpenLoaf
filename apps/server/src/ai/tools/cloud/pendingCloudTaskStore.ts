/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * 异步云任务续查状态存储 + 消息 tool part patch 工具。
 *
 * 典型生命周期：
 *   1. execute 启动 → insertPending()
 *   2. execute 同步跑完 → markDone() + 清理（本地返回结果，无需 patch message）
 *   3. 连接/进程中断 → 行留在 pending → pendingCloudTaskResumer 启动时扫到 → 续 poll
 *   4. 续 poll 完成 → markDone() + patchMessageToolPart() 回写 JSONL
 */

import { prisma } from '@openloaf/db'
import { logger } from '@/common/logger'
import { getMessageById, updateMessageParts } from '@/ai/services/chat/repositories/chatMessagePersistence'

export type PendingCloudTaskRow = {
  toolCallId: string
  taskId: string
  sessionId: string | null
  messageId: string | null
  toolName: string
  feature: string
  variant: string
  status: 'pending' | 'done' | 'failed' | 'cancelled'
  resultJson: string | null
  errorMessage: string | null
  boardId: string | null
  projectId: string | null
  createdAt: Date
  updatedAt: Date
}

export async function insertPending(input: {
  toolCallId: string
  taskId: string
  sessionId?: string | null
  messageId?: string | null
  toolName: string
  feature: string
  variant: string
  boardId?: string | null
  projectId?: string | null
}): Promise<void> {
  try {
    await prisma.pendingCloudTask.upsert({
      where: { toolCallId: input.toolCallId },
      create: {
        toolCallId: input.toolCallId,
        taskId: input.taskId,
        sessionId: input.sessionId ?? null,
        messageId: input.messageId ?? null,
        toolName: input.toolName,
        feature: input.feature,
        variant: input.variant,
        boardId: input.boardId ?? null,
        projectId: input.projectId ?? null,
        status: 'pending',
      },
      update: {
        taskId: input.taskId,
        status: 'pending',
        resultJson: null,
        errorMessage: null,
      },
    })
  } catch (err) {
    logger.warn(
      { toolCallId: input.toolCallId, taskId: input.taskId, err: errToMsg(err) },
      '[pending-cloud-task] insertPending failed',
    )
  }
}

export async function markDone(toolCallId: string, resultJson: string): Promise<void> {
  try {
    await prisma.pendingCloudTask.update({
      where: { toolCallId },
      data: { status: 'done', resultJson, errorMessage: null },
    })
  } catch (err) {
    logger.debug({ toolCallId, err: errToMsg(err) }, '[pending-cloud-task] markDone skipped (row missing?)')
  }
}

export async function markFailed(toolCallId: string, errorMessage: string): Promise<void> {
  try {
    await prisma.pendingCloudTask.update({
      where: { toolCallId },
      data: { status: 'failed', errorMessage },
    })
  } catch (err) {
    logger.debug({ toolCallId, err: errToMsg(err) }, '[pending-cloud-task] markFailed skipped')
  }
}

export async function markCancelled(toolCallId: string): Promise<void> {
  try {
    await prisma.pendingCloudTask.update({
      where: { toolCallId },
      data: { status: 'cancelled' },
    })
  } catch (err) {
    logger.debug({ toolCallId, err: errToMsg(err) }, '[pending-cloud-task] markCancelled skipped')
  }
}

export async function getByToolCallId(toolCallId: string): Promise<PendingCloudTaskRow | null> {
  try {
    const row = await prisma.pendingCloudTask.findUnique({ where: { toolCallId } })
    return row as PendingCloudTaskRow | null
  } catch {
    return null
  }
}

export async function listPending(): Promise<PendingCloudTaskRow[]> {
  try {
    const rows = await prisma.pendingCloudTask.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    })
    return rows as PendingCloudTaskRow[]
  } catch (err) {
    logger.warn({ err: errToMsg(err) }, '[pending-cloud-task] listPending failed')
    return []
  }
}

/** 删除已终态的行（message patch 完成后清理）。 */
export async function deleteRow(toolCallId: string): Promise<void> {
  try {
    await prisma.pendingCloudTask.delete({ where: { toolCallId } })
  } catch {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// Patch message tool part
// ---------------------------------------------------------------------------

/**
 * 把 messages.jsonl 里匹配 toolCallId 的 tool part 改成新状态。
 *
 * 用于续 poll 完成后把原本 state='input-available' 的 tool part 回填为
 * state='output-available' + output=<resultJson>，让用户重新打开会话时
 * 看到完成态。
 *
 * 如果 message 找不到（可能因为 server 在 flush 之前就挂了），返回 false。
 */
export async function patchMessageToolPart(input: {
  sessionId: string
  messageId: string
  toolCallId: string
  nextState: 'output-available' | 'output-error'
  output?: unknown
  errorText?: string
}): Promise<boolean> {
  const msg = await getMessageById({ sessionId: input.sessionId, messageId: input.messageId })
  if (!msg) return false

  let matched = false
  const nextParts = (msg.parts as unknown[]).map((part) => {
    if (!part || typeof part !== 'object') return part
    const rec = part as Record<string, unknown>
    if (rec.toolCallId !== input.toolCallId) return part
    matched = true
    if (input.nextState === 'output-error') {
      return { ...rec, state: 'output-error', errorText: input.errorText ?? 'cloud task failed' }
    }
    return { ...rec, state: 'output-available', output: input.output }
  })

  if (!matched) return false
  await updateMessageParts({
    sessionId: input.sessionId,
    messageId: input.messageId,
    parts: nextParts,
  })
  return true
}

function errToMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
