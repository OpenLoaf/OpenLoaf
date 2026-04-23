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
 * WeChat Message Service
 *
 * Persists inbound iLink Bot messages as ChatSession + messages.jsonl entries.
 * iLink Bot is strictly 1:1 — each bound WeChat account maps to exactly one
 * session (the conversation with the binding user). sessionId is deterministic
 * (`wx-<accountId>`) so a bound account always lands in the same thread.
 */

import { randomBytes } from 'node:crypto'
import { prisma } from '@openloaf/db'
import type { WeixinMessage, MessageItem } from 'wechat-ilink-client'
import { appendMessage } from '@/ai/services/chat/repositories/chatFileStore'
import type { StoredMessage } from '@/ai/services/chat/repositories/chatFileStore'
import { resolveRightmostLeafId } from '@/ai/services/chat/repositories/messageStore'
import { logger } from '@/common/logger'

export const WECHAT_SESSION_KIND = 'wechat'

/** Derive the deterministic per-account sessionId. */
export function deriveWeChatSessionId(accountId: string): string {
  return `wx-${accountId}`
}

/** Ensure a ChatSession row exists for the given account. Returns sessionId. */
export async function ensureWeChatSession(input: {
  accountId: string
  /** Optional initial title (usually the bot's friendly name). Ignored on subsequent calls. */
  title?: string
}): Promise<string> {
  const { accountId } = input
  const sessionId = deriveWeChatSessionId(accountId)
  const title = input.title?.trim() || 'WeChat'

  // Look up by (kind, wechatAccountId) compound key first — handles legacy rows
  // where the session id doesn't match the current `wx-<accountId>` convention.
  // Only create a fresh row if no wechat session for this account exists yet.
  const existing = await prisma.chatSession.findUnique({
    where: { kind_wechatAccountId: { kind: WECHAT_SESSION_KIND, wechatAccountId: accountId } },
    select: { id: true },
  })
  if (existing) return existing.id

  await prisma.chatSession.create({
    data: {
      id: sessionId,
      title,
      kind: WECHAT_SESSION_KIND,
      wechatAccountId: accountId,
    },
  })

  return sessionId
}

/** Extract a best-effort text representation from an iLink item_list. */
export function extractText(items: MessageItem[] | undefined): string {
  if (!items || items.length === 0) return ''
  const parts: string[] = []
  for (const item of items) {
    if (item.text_item?.text) {
      parts.push(item.text_item.text)
    } else if (item.image_item) {
      parts.push('[图片]')
    } else if (item.voice_item) {
      parts.push('[语音]')
    } else if (item.video_item) {
      parts.push('[视频]')
    } else if (item.file_item) {
      parts.push('[文件]')
    }
  }
  return parts.join('\n').trim()
}

function newMessageId(): string {
  return `wx-msg-${Date.now()}-${randomBytes(3).toString('hex')}`
}

/**
 * Append an inbound WeChat message to the session's messages.jsonl.
 * Messages are stored as `role: 'user'` with a single text part.
 */
export async function appendInboundMessage(input: {
  sessionId: string
  accountId: string
  msg: WeixinMessage
  /**
   * Pre-rendered text body for the message. Callers build this (typically
   * combining text items + `<system-tag type="attachment" ... />` for any
   * downloaded media) so persistence and AI routing share one canonical form.
   * Fallback: derive from text items only.
   */
  text?: string
}): Promise<void> {
  const { sessionId, msg } = input
  const text = input.text ?? extractText(msg.item_list)
  if (!text) {
    logger.debug(
      { sessionId, messageId: msg.message_id },
      '[wechat-msg] skipping empty message after extraction',
    )
    return
  }

  // Chain into the existing message tree so inbound messages don't all sit at
  // the root with parent=null (which breaks the chat-history viewer's thread
  // reconstruction).
  const parentLeafId = await resolveRightmostLeafId(sessionId)

  const stored: StoredMessage = {
    id: newMessageId(),
    parentMessageId: parentLeafId,
    role: 'user',
    messageKind: 'normal',
    parts: [{ type: 'text', text }],
    metadata: {
      wechat: {
        accountId: input.accountId,
        direction: 'inbound',
        messageId: msg.message_id,
        fromUserId: msg.from_user_id,
        contextToken: msg.context_token,
        createTimeMs: msg.create_time_ms,
        rawMessageType: msg.message_type,
      },
    },
    createdAt: new Date(msg.create_time_ms ?? Date.now()).toISOString(),
  }

  await appendMessage({ sessionId, message: stored })

  const current = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { messageCount: true, isUserRename: true },
  })

  const shouldSetTitleFromFirstMessage =
    current != null && current.messageCount === 0 && !current.isUserRename

  // On the very first inbound message (and while the user hasn't manually
  // renamed), overwrite the placeholder title with a short preview of the text.
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      updatedAt: new Date(),
      messageCount: { increment: 1 },
      ...(shouldSetTitleFromFirstMessage
        ? { title: text.replace(/\s+/g, ' ').slice(0, 40) }
        : {}),
    },
  })
}
