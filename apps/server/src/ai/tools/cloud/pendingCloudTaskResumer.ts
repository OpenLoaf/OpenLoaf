/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Pending cloud task resumer.
 *
 * Scans the PendingCloudTask table on server start, continues polling any row
 * that's still in `pending` state (i.e. a prior execute() was interrupted by
 * a connection drop / process restart before it could write the terminal
 * result), then patches the owning assistant message's tool part so the next
 * time the user opens the chat the part reads as `state: 'output-available'`.
 */

import { getSaasClient } from '@/modules/saas/client'
import { logger } from '@/common/logger'
import {
  autoSaveCloudResultUrls,
  pollCloudTaskUntilDone,
  CloudPollTaskTimeoutError,
} from '@/ai/tools/cloud/cloudTools'
import type { ToolProgressEmitter } from '@/ai/tools/toolProgress'
import {
  deleteRow as deletePendingCloudTaskRow,
  listPending,
  markDone as markPendingCloudTaskDone,
  markFailed as markPendingCloudTaskFailed,
  patchMessageToolPart,
  type PendingCloudTaskRow,
} from '@/ai/tools/cloud/pendingCloudTaskStore'

/** No-op progress emitter — resumer runs outside of any active SSE. */
const silentProgress: ToolProgressEmitter = {
  start() {},
  delta() {},
  done() {},
  error() {},
}

/**
 * 在 server 启动完毕后调用一次。非阻塞：扫表 → 异步并行续 poll。
 *
 * 返回值仅用于测试/诊断，生产环境调用方 `void` 掉即可。
 */
export async function resumePendingCloudTasks(): Promise<{
  scanned: number
  resumed: number
}> {
  let rows: PendingCloudTaskRow[] = []
  try {
    rows = await listPending()
  } catch (err) {
    logger.warn({ err: errToMsg(err) }, '[pending-cloud-task-resumer] listPending failed')
    return { scanned: 0, resumed: 0 }
  }

  if (rows.length === 0) return { scanned: 0, resumed: 0 }

  logger.info(
    { count: rows.length },
    '[pending-cloud-task-resumer] resuming interrupted cloud tasks',
  )

  let resumed = 0
  for (const row of rows) {
    // 并行续查。每个 task 独立错误处理，一个 row 挂掉不阻断其他。
    void resumeOne(row).catch((err) => {
      logger.warn(
        { toolCallId: row.toolCallId, taskId: row.taskId, err: errToMsg(err) },
        '[pending-cloud-task-resumer] resume task failed',
      )
    })
    resumed++
  }

  return { scanned: rows.length, resumed }
}

async function resumeOne(row: PendingCloudTaskRow): Promise<void> {
  const { ensureServerAccessToken } = await import('@/modules/auth/tokenStore')
  const token = (await ensureServerAccessToken()) ?? ''
  if (!token) {
    // 用户还没登录云端，没法续查。行保留，下次登录后再试（每次启动都会扫）。
    logger.info(
      { toolCallId: row.toolCallId },
      '[pending-cloud-task-resumer] no cloud token yet, deferring',
    )
    return
  }

  const client = getSaasClient(token)

  try {
    const result = await pollCloudTaskUntilDone(client, row.taskId, silentProgress)
    const urls = Array.isArray(result.resultUrls) ? result.resultUrls : []
    const { files, pending, target } = await autoSaveCloudResultUrls({
      resultUrls: urls,
      variantId: row.variant,
      progress: silentProgress,
      explicitScope: {
        sessionId: row.sessionId,
        boardId: row.boardId,
        projectId: row.projectId,
      },
    })

    const payload = {
      ok: true,
      mode: 'sync',
      resumed: true,
      feature: row.feature,
      variant: row.variant,
      taskId: row.taskId,
      status: result.status,
      files,
      pendingUrls: pending,
      resultText: result.resultText,
      creditsConsumed: result.creditsConsumed,
      destination: target?.destination,
      sessionId: target?.sessionId,
      boardId: target?.boardId,
      projectId: target?.projectId,
      hint:
        '(resumed after reconnect) ' +
        (files.length > 0
          ? 'Files saved to asset dir.'
          : 'Task completed.'),
    }
    const payloadJson = JSON.stringify(payload)

    await markPendingCloudTaskDone(row.toolCallId, payloadJson)

    if (row.sessionId && row.messageId) {
      const patched = await patchMessageToolPart({
        sessionId: row.sessionId,
        messageId: row.messageId,
        toolCallId: row.toolCallId,
        nextState: 'output-available',
        output: payloadJson,
      })
      if (!patched) {
        logger.info(
          { toolCallId: row.toolCallId },
          '[pending-cloud-task-resumer] message/part not found — keeping DB row for diagnostics',
        )
        // 消息找不到就不删行，方便调试（下次启动还会尝试再 patch 一次也是无害的 — 任务已终态）。
        return
      }
    }

    // Message 成功回写或本来就没有 message（边缘场景）→ 可以安全删行。
    await deletePendingCloudTaskRow(row.toolCallId)
    logger.info(
      { toolCallId: row.toolCallId, taskId: row.taskId, files: files.length },
      '[pending-cloud-task-resumer] resumed task completed',
    )
  } catch (err) {
    // 如果又超时了，保留行，下次启动再续。其他错误标 failed + patch。
    if (err instanceof CloudPollTaskTimeoutError) {
      logger.info(
        { toolCallId: row.toolCallId, taskId: row.taskId },
        '[pending-cloud-task-resumer] still running, will retry next boot',
      )
      return
    }
    const message = errToMsg(err)
    await markPendingCloudTaskFailed(row.toolCallId, message)

    if (row.sessionId && row.messageId) {
      await patchMessageToolPart({
        sessionId: row.sessionId,
        messageId: row.messageId,
        toolCallId: row.toolCallId,
        nextState: 'output-error',
        errorText: `[resumed] ${row.toolName}(${row.feature}/${row.variant}) — ${message}`,
      })
    }
    await deletePendingCloudTaskRow(row.toolCallId)
  }
}

function errToMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
