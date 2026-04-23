/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * WeChat Poll Worker
 *
 * One long-poll loop per bound WeChat account. Each loop calls `ApiClient.getUpdates()`
 * with the account's persisted `syncBuf` cursor, dispatches new messages into
 * ChatSession storage, then persists the updated cursor before looping again.
 *
 * V1 scope (see plan): text-only private messages. Group messages, media,
 * and outbound replies are deferred to later PRs.
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import type { WeixinMessage, GetUpdatesResp, MessageItem } from 'wechat-ilink-client'
import { createAccountApiClient, type AccountApiClient } from './apiClientFactory'
import { logger } from '@/common/logger'
import {
  getAccount,
  listAccounts,
  updateAccountSyncBuf,
  updateAccountStatus,
  type WeChatAccount,
} from './wechatAccountStore'
import { ensureWeChatSession, appendInboundMessage } from './wechatMessageService'
import { scheduleAiReply } from './wechatAiBridge'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { formatAttachmentTag } from '@openloaf/api/common/attachmentTag'

const LONG_POLL_TIMEOUT_MS = 30_000
const ERROR_BACKOFF_MS = 5_000
const SESSION_EXPIRED_ERRCODE = -14

const workers = new Map<string, AbortController>()

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    }, { once: true })
  })
}

/** Pick out messages we actually want to persist. */
function shouldHandle(msg: WeixinMessage, account: WeChatAccount): boolean {
  // V1: skip groups.
  if (msg.group_id) return false
  // Skip bot's own outbound echoes. In iLink Bot, the user's WeChat id is the
  // bound `ownerUserId` — user→bot messages have from=ownerUserId and are the
  // ONLY inbound messages we care about. Echoes are from=botId.
  if (msg.from_user_id === account.botId) return false
  if (!msg.from_user_id) return false
  // Require at least one payload item (text / image / voice / file / video).
  const items = msg.item_list ?? []
  if (items.length === 0) return false
  return items.some(
    (i) =>
      i.text_item?.text ||
      i.image_item ||
      i.voice_item ||
      i.file_item ||
      i.video_item,
  )
}

/** File extension heuristic per media kind. */
function extFor(kind: 'image' | 'voice' | 'video' | 'file', fileName?: string): string {
  if (fileName) {
    const ext = path.extname(fileName)
    if (ext) return ext
  }
  if (kind === 'image') return '.jpg'
  if (kind === 'voice') return '.amr'
  if (kind === 'video') return '.mp4'
  return '.bin'
}

/** Best-effort MIME type for attachment tag metadata. */
function mediaTypeFor(kind: 'image' | 'voice' | 'video' | 'file', ext: string): string {
  const e = ext.toLowerCase()
  if (kind === 'image') {
    if (e === '.png') return 'image/png'
    if (e === '.gif') return 'image/gif'
    if (e === '.webp') return 'image/webp'
    return 'image/jpeg'
  }
  if (kind === 'voice') return e === '.mp3' ? 'audio/mpeg' : 'audio/amr'
  if (kind === 'video') return 'video/mp4'
  return 'application/octet-stream'
}

/**
 * Download a single media item to the session's asset/ dir and return the
 * attachment tag + a short inline label (eg "[图片]"). Returns null if this
 * item has no downloadable media or download failed.
 */
async function persistMediaItem(input: {
  api: AccountApiClient
  sessionId: string
  item: MessageItem
}): Promise<{ inlineLabel: string; tag: string } | null> {
  const { api, sessionId, item } = input

  let kind: 'image' | 'voice' | 'video' | 'file' | null = null
  let inlineLabel = ''
  if (item.image_item) { kind = 'image'; inlineLabel = '[图片]' }
  else if (item.voice_item) { kind = 'voice'; inlineLabel = '[语音]' }
  else if (item.video_item) { kind = 'video'; inlineLabel = '[视频]' }
  else if (item.file_item) { kind = 'file'; inlineLabel = '[文件]' }
  if (!kind) return null

  let downloaded: Awaited<ReturnType<AccountApiClient['downloadMedia']>>
  try {
    downloaded = await api.downloadMedia(item)
  } catch (err) {
    logger.warn({ err: String(err), sessionId, kind }, '[wechat-poll] downloadMedia failed')
    return null
  }
  if (!downloaded) return null

  const assetDir = await resolveSessionAssetDir(sessionId)
  const origName = kind === 'file' ? downloaded.fileName : undefined
  const ext = extFor(kind, origName)
  const stem = origName
    ? path.basename(origName, path.extname(origName))
    : `wx-${kind}-${Date.now()}`
  let fileName = `${stem}${ext}`
  let absPath = path.join(assetDir, fileName)
  // Avoid collisions.
  let n = 1
  while (true) {
    try {
      await fs.access(absPath)
      fileName = `${stem}-${n}${ext}`
      absPath = path.join(assetDir, fileName)
      n += 1
    } catch {
      break
    }
  }
  await fs.writeFile(absPath, downloaded.data)

  const tag = formatAttachmentTag({
    path: `\${CURRENT_CHAT_DIR}/${fileName}`,
    mediaType: mediaTypeFor(kind, ext),
  })
  return { inlineLabel, tag }
}

/**
 * Build the canonical inbound text for a WeChat message:
 * text items inline + one attachment tag per media item (downloaded + saved).
 */
async function buildInboundText(input: {
  api: AccountApiClient
  sessionId: string
  msg: WeixinMessage
}): Promise<string> {
  const { api, sessionId, msg } = input
  const items = msg.item_list ?? []
  const parts: string[] = []
  for (const item of items) {
    if (item.text_item?.text) {
      parts.push(item.text_item.text)
      continue
    }
    const persisted = await persistMediaItem({ api, sessionId, item })
    if (persisted) {
      parts.push(`${persisted.inlineLabel}\n${persisted.tag}`)
    }
  }
  return parts.join('\n').trim()
}

async function processBatch(
  resp: GetUpdatesResp,
  account: WeChatAccount,
  api: AccountApiClient,
): Promise<void> {
  const msgs = resp.msgs ?? []
  // iLink Bot is 1:1: one account → one session (`wx-<accountId>`). No peer
  // routing needed.
  const sessionId = await ensureWeChatSession({
    accountId: account.id,
    title: account.displayName,
  })
  for (const msg of msgs) {
    if (!shouldHandle(msg, account)) {
      logger.info(
        {
          accountId: account.id,
          message_id: msg.message_id,
          from_user_id: msg.from_user_id,
          group_id: msg.group_id,
          item_types: msg.item_list?.map((i) => Object.keys(i)[0]),
          reason: msg.group_id
            ? 'group'
            : msg.from_user_id === account.botId
            ? 'bot-echo'
            : !msg.from_user_id
            ? 'no-from'
            : 'no-text',
        },
        '[wechat-poll] skipped message',
      )
      continue
    }
    try {
      // Build the canonical text once (downloads any inbound media into
      // <sessionDir>/asset/ and inlines an attachment tag per item) so the
      // persisted message and the AI bridge see the same content.
      const text = await buildInboundText({ api, sessionId, msg })
      if (!text) {
        logger.debug({ messageId: msg.message_id }, '[wechat-poll] empty after build')
        continue
      }
      await appendInboundMessage({
        sessionId,
        accountId: account.id,
        msg,
        text,
      })
      if (msg.context_token) {
        scheduleAiReply({
          sessionId,
          accountId: account.id,
          text,
          createTimeMs: msg.create_time_ms ?? Date.now(),
          contextToken: msg.context_token,
        })
      }
    } catch (err) {
      logger.warn(
        { err: String(err), accountId: account.id, messageId: msg.message_id },
        '[wechat-poll] failed to persist message',
      )
    }
  }
}

async function runLoop(accountId: string, signal: AbortSignal): Promise<void> {
  logger.info({ accountId }, '[wechat-poll] worker started')
  while (!signal.aborted) {
    const account = getAccount(accountId)
    if (!account) {
      logger.info({ accountId }, '[wechat-poll] account gone, stopping')
      return
    }
    if (account.status !== 'connected') {
      logger.info(
        { accountId, status: account.status },
        '[wechat-poll] account not connected, stopping',
      )
      return
    }

    const api = createAccountApiClient(account)

    let resp: GetUpdatesResp
    try {
      resp = await api.getUpdates(account.syncBuf, LONG_POLL_TIMEOUT_MS)
    } catch (err) {
      logger.warn({ err: String(err), accountId }, '[wechat-poll] getUpdates threw')
      await sleep(ERROR_BACKOFF_MS, signal)
      continue
    }

    if (resp.errcode === SESSION_EXPIRED_ERRCODE) {
      logger.warn({ accountId, errmsg: resp.errmsg }, '[wechat-poll] session expired, stopping')
      updateAccountStatus(accountId, 'expired')
      return
    }

    if (resp.errcode && resp.errcode !== 0) {
      logger.warn(
        { accountId, errcode: resp.errcode, errmsg: resp.errmsg },
        '[wechat-poll] non-fatal error response',
      )
      await sleep(ERROR_BACKOFF_MS, signal)
      continue
    }

    const msgCount = resp.msgs?.length ?? 0
    if (msgCount > 0) {
      logger.info(
        {
          accountId,
          msgCount,
          preview: resp.msgs?.slice(0, 3).map((m) => ({
            message_id: m.message_id,
            from_user_id: m.from_user_id,
            to_user_id: m.to_user_id,
            group_id: m.group_id,
            message_type: m.message_type,
            item_types: m.item_list?.map((i) => Object.keys(i)[0]),
          })),
        },
        '[wechat-poll] received batch',
      )
    } else {
      logger.debug({ accountId }, '[wechat-poll] empty poll tick')
    }

    await processBatch(resp, account, api)

    if (resp.get_updates_buf && resp.get_updates_buf !== account.syncBuf) {
      updateAccountSyncBuf(accountId, resp.get_updates_buf)
    }
  }
  logger.info({ accountId }, '[wechat-poll] worker stopped')
}

export function startWorkerForAccount(account: WeChatAccount): void {
  if (workers.has(account.id)) return
  if (account.status !== 'connected') return
  const controller = new AbortController()
  workers.set(account.id, controller)
  // Fire-and-forget; loop owns its lifetime.
  void runLoop(account.id, controller.signal).catch((err) => {
    logger.error({ err: String(err), accountId: account.id }, '[wechat-poll] worker crashed')
  }).finally(() => {
    if (workers.get(account.id) === controller) workers.delete(account.id)
  })
}

export function stopWorkerForAccount(accountId: string): void {
  const controller = workers.get(accountId)
  if (!controller) return
  controller.abort()
  workers.delete(accountId)
}

export function stopAllWorkers(): void {
  for (const controller of workers.values()) controller.abort()
  workers.clear()
}

/** Called at server bootstrap to resume workers for all connected accounts. */
export function startAllWorkers(): void {
  for (const account of listAccounts()) {
    if (account.status === 'connected') startWorkerForAccount(account)
  }
}
