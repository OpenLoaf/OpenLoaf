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
 * WeChat Service
 *
 * Orchestrates the QR-code binding flow for iLink Bot accounts.
 * Binding is a 3-step dance driven by the frontend:
 *   1. startBind()        → allocate session, fetch QR code
 *   2. pollBindStatus()   → short-poll from UI (1.5s) until confirmed/expired
 *   3. confirmed          → persist account to wechat-accounts.json
 *
 * Long-poll message receive / send workers are NOT wired here yet; they'll
 * be added in a follow-up once binding is verified.
 */

import { ApiClient } from 'wechat-ilink-client'
import QRCode from 'qrcode'
import { logger } from '@/common/logger'
import {
  createSession,
  deleteSession,
  getSession,
  updateSession,
  type BindSession,
} from './wechatBindSessions'
import {
  generateAccountId,
  listAccounts as storeListAccounts,
  removeAccount as storeRemoveAccount,
  upsertAccount,
  findAccountByBotId,
  type WeChatAccount,
} from './wechatAccountStore'

export interface PublicWeChatAccount {
  id: string
  botId: string
  displayName: string
  status: WeChatAccount['status']
  boundAt: string
  lastActiveAt?: string
}

export interface StartBindResult {
  sessionId: string
  /** Data URL (PNG) that the frontend can render via <img src=...>. */
  qrcodeDataUrl: string
  expiresAt: number
}

/**
 * Encode the `qrcode_img_content` field into a PNG data URL.
 *
 * iLink returns an `https://liteapp.weixin.qq.com/q/...` landing URL that
 * must be embedded inside a QR code (WeChat scanners jump to this URL on
 * scan). It is NOT an image URL — fetching it as `<img src>` loads an HTML
 * page and fails to render.
 */
async function encodeQrToDataUrl(raw: string): Promise<string> {
  return QRCode.toDataURL(raw, { margin: 1, width: 280 })
}

export interface PollBindStatusResult {
  status: BindSession['status']
  account?: PublicWeChatAccount
}

function toPublic(acc: WeChatAccount): PublicWeChatAccount {
  return {
    id: acc.id,
    botId: acc.botId,
    displayName: acc.displayName,
    status: acc.status,
    boundAt: acc.boundAt,
    lastActiveAt: acc.lastActiveAt,
  }
}

export function listAccounts(): PublicWeChatAccount[] {
  return storeListAccounts().map(toPublic)
}

export async function startBind(): Promise<StartBindResult> {
  const api = new ApiClient()
  const qr = await api.getQRCode()
  const session = createSession(api, qr)
  const qrcodeDataUrl = await encodeQrToDataUrl(session.qrcodeImgContent)
  logger.info(
    { sessionId: session.sessionId, expiresAt: session.expiresAt },
    '[wechat] bind session started',
  )
  return {
    sessionId: session.sessionId,
    qrcodeDataUrl,
    expiresAt: session.expiresAt,
  }
}

export async function pollBindStatus(sessionId: string): Promise<PollBindStatusResult> {
  const session = getSession(sessionId)
  if (!session) return { status: 'expired' }

  // Terminal states: short-circuit (but still return persisted account on confirmed).
  if (session.status === 'confirmed' && session.result) {
    const existing = findAccountByBotId(session.result.ilinkBotId)
    return { status: 'confirmed', account: existing ? toPublic(existing) : undefined }
  }
  if (session.status === 'expired') return { status: 'expired' }

  let resp
  try {
    resp = await session.api.pollQRCodeStatus(session.qrcode)
  } catch (err) {
    logger.warn({ err: String(err), sessionId }, '[wechat] pollQRCodeStatus failed')
    return { status: session.status }
  }

  updateSession(sessionId, { status: resp.status })

  if (resp.status !== 'confirmed') {
    if (resp.status === 'expired') deleteSession(sessionId)
    return { status: resp.status }
  }

  // Confirmed — persist account.
  if (!resp.bot_token || !resp.ilink_bot_id || !resp.baseurl) {
    logger.error(
      { sessionId, resp },
      '[wechat] confirmed response missing required fields',
    )
    return { status: 'wait' }
  }

  const botId = resp.ilink_bot_id
  // iLink SDK doesn't expose WeChat nickname/avatar — strip the `@im.bot`
  // suffix so the card shows `hex` instead of `hex@im.bot`.
  const friendlyName = botId.split('@')[0] || botId
  const existing = findAccountByBotId(botId)
  const account: WeChatAccount = existing
    ? {
        ...existing,
        botToken: resp.bot_token,
        baseUrl: resp.baseurl,
        ownerUserId: resp.ilink_user_id ?? existing.ownerUserId,
        status: 'connected',
        syncBuf: '', // reset cursor; stale cursor may be rejected after re-login
        lastActiveAt: new Date().toISOString(),
      }
    : {
        id: generateAccountId(),
        botId,
        displayName: friendlyName,
        botToken: resp.bot_token,
        baseUrl: resp.baseurl,
        ownerUserId: resp.ilink_user_id,
        syncBuf: '',
        status: 'connected',
        boundAt: new Date().toISOString(),
      }

  const saved = upsertAccount(account)
  updateSession(sessionId, {
    status: 'confirmed',
    result: {
      botToken: resp.bot_token,
      ilinkBotId: resp.ilink_bot_id,
      baseUrl: resp.baseurl,
      ilinkUserId: resp.ilink_user_id,
    },
  })
  logger.info({ accountId: saved.id, botId: saved.botId }, '[wechat] account bound')
  return { status: 'confirmed', account: toPublic(saved) }
}

export function cancelBind(sessionId: string): { ok: boolean } {
  const existed = getSession(sessionId) !== undefined
  deleteSession(sessionId)
  return { ok: existed }
}

export function unbindAccount(accountId: string): { ok: boolean } {
  const removed = storeRemoveAccount(accountId)
  if (removed) logger.info({ accountId }, '[wechat] account unbound')
  return { ok: removed }
}
