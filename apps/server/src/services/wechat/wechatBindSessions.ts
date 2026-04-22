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
 * WeChat Bind Sessions
 *
 * In-memory registry of in-progress QR-code binding attempts. Each session
 * owns a dedicated ApiClient instance (because the iLink QR is tied to the
 * client that fetched it). Sessions expire after 10 minutes.
 */

import { randomBytes } from 'node:crypto'
import { ApiClient, type QRCodeStatusResponse } from 'wechat-ilink-client'

export type BindSessionStatus = QRCodeStatusResponse['status']

export interface BindSession {
  sessionId: string
  api: ApiClient
  qrcode: string
  qrcodeImgContent: string
  status: BindSessionStatus
  /** Populated once status === 'confirmed'. */
  result?: {
    botToken: string
    ilinkBotId: string
    baseUrl: string
    ilinkUserId?: string
  }
  createdAt: number
  expiresAt: number
}

const TTL_MS = 10 * 60 * 1000
const sessions = new Map<string, BindSession>()

function generateSessionId(): string {
  return `wxbind-${randomBytes(6).toString('hex')}`
}

function purgeExpired(now = Date.now()): void {
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(id)
  }
}

export function createSession(api: ApiClient, qr: { qrcode: string; qrcode_img_content: string }): BindSession {
  purgeExpired()
  const now = Date.now()
  const sessionId = generateSessionId()
  const session: BindSession = {
    sessionId,
    api,
    qrcode: qr.qrcode,
    qrcodeImgContent: qr.qrcode_img_content,
    status: 'wait',
    createdAt: now,
    expiresAt: now + TTL_MS,
  }
  sessions.set(sessionId, session)
  return session
}

export function getSession(sessionId: string): BindSession | undefined {
  purgeExpired()
  return sessions.get(sessionId)
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId)
}

export function updateSession(sessionId: string, patch: Partial<BindSession>): BindSession | undefined {
  const s = sessions.get(sessionId)
  if (!s) return undefined
  Object.assign(s, patch)
  return s
}
