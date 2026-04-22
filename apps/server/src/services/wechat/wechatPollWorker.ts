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

import { ApiClient, type WeixinMessage, type GetUpdatesResp } from 'wechat-ilink-client'
import { logger } from '@/common/logger'
import {
  getAccount,
  listAccounts,
  updateAccountSyncBuf,
  updateAccountStatus,
  type WeChatAccount,
} from './wechatAccountStore'
import { ensureWeChatSession, appendInboundMessage } from './wechatMessageService'

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
  // V1: require at least one text item. Other media types are ignored for now.
  const items = msg.item_list ?? []
  if (!items.some((i) => i.text_item?.text)) return false
  return true
}

async function processBatch(
  resp: GetUpdatesResp,
  account: WeChatAccount,
): Promise<void> {
  const msgs = resp.msgs ?? []
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
      const peerId = msg.from_user_id!
      const peerDisplayName = peerId.split('@')[0] || peerId
      const sessionId = await ensureWeChatSession({
        accountId: account.id,
        peerId,
        peerDisplayName,
      })
      await appendInboundMessage({
        sessionId,
        accountId: account.id,
        peerId,
        msg,
      })
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

    const api = new ApiClient({ baseUrl: account.baseUrl, token: account.botToken })

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

    await processBatch(resp, account)

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
