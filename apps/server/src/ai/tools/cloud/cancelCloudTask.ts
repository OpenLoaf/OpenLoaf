/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * 用户手动取消一条异步云任务的主逻辑。
 *
 * 入口：trpc ai.cancelCloudTask({ toolCallId })。
 * 步骤：查 DB 行 → 调 SaaS v3CancelTask → 标记 cancelled + patch 消息。
 */

import { getSaasClient } from '@/modules/saas/client'
import { logger } from '@/common/logger'
import {
  getByToolCallId,
  markCancelled as markPendingCloudTaskCancelled,
  patchMessageToolPart,
} from '@/ai/tools/cloud/pendingCloudTaskStore'

export async function cancelPendingCloudTask(
  toolCallId: string,
): Promise<{ ok: boolean; status?: 'cancelled' | 'not_found' | 'already_done'; message?: string }> {
  const row = await getByToolCallId(toolCallId)
  if (!row) return { ok: false, status: 'not_found', message: 'task not found' }
  if (row.status !== 'pending') {
    return { ok: false, status: 'already_done', message: `task already ${row.status}` }
  }

  const { ensureServerAccessToken } = await import('@/modules/auth/tokenStore')
  const token = (await ensureServerAccessToken()) ?? ''
  if (!token) {
    return { ok: false, message: 'cloud not signed in' }
  }

  try {
    const client = getSaasClient(token)
    const res = await client.ai.v3CancelTask(row.taskId)
    logger.info({ toolCallId, taskId: row.taskId }, '[cancel-cloud-task] SaaS cancel ok')

    await markPendingCloudTaskCancelled(toolCallId)

    if (row.sessionId && row.messageId) {
      await patchMessageToolPart({
        sessionId: row.sessionId,
        messageId: row.messageId,
        toolCallId,
        nextState: 'output-error',
        errorText: `[cancelled] ${row.toolName}(${row.feature}/${row.variant}) — user cancelled`,
      })
    }

    // 保留行（status='cancelled'）给 in-flight executor 的 runV3GenerateAndSave 读
    // —— 它 pollTaskUntilDone 返回后会查行状态，若 cancelled 则返回结构化取消 payload
    // 而不是走成功路径，避免覆盖 patchMessageToolPart。由 executor 最后删行；resumer
    // 路径不会看到这种行（resumer 只读 status='pending'）。
    return { ok: true, status: 'cancelled', message: res.message ?? 'cancel requested' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({ toolCallId, taskId: row.taskId, err: message }, '[cancel-cloud-task] failed')
    return { ok: false, message }
  }
}
