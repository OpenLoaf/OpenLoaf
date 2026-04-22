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
 * One ChatSession per (accountId, peerId) pair — a peer is either another WeChat
 * user (私聊) or a group (群). Session id is derived from a stable hash so the
 * same peer always lands in the same thread across restarts.
 */

import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@openloaf/db'
import type { WeixinMessage, MessageItem } from 'wechat-ilink-client'
import { appendMessage } from '@/ai/services/chat/repositories/chatFileStore'
import type { StoredMessage } from '@/ai/services/chat/repositories/chatFileStore'
import { logger } from '@/common/logger'

export const WECHAT_SESSION_KIND = 'wechat'

function deriveSessionId(accountId: string, peerId: string): string {
  const hash = createHash('sha256').update(`${accountId}\0${peerId}`).digest('hex')
  return `wx-${hash.slice(0, 16)}`
}

/** Ensure a ChatSession row exists for the given (account, peer). Returns sessionId. */
export async function ensureWeChatSession(input: {
  accountId: string
  peerId: string
  peerDisplayName?: string
}): Promise<string> {
  const { accountId, peerId } = input
  const sessionId = deriveSessionId(accountId, peerId)
  const title = input.peerDisplayName || peerId.split('@')[0] || peerId

  await prisma.chatSession.upsert({
    where: { id: sessionId },
    update: {
      // Do NOT overwrite title if the user has renamed the session.
      // isUserRename defaults false; once true we leave title alone.
    },
    create: {
      id: sessionId,
      title,
      kind: WECHAT_SESSION_KIND,
      wechatAccountId: accountId,
      wechatPeerId: peerId,
    },
  })

  return sessionId
}

/** Extract a best-effort text representation from an iLink item_list. */
function extractText(items: MessageItem[] | undefined): string {
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
  peerId: string
  msg: WeixinMessage
}): Promise<void> {
  const { sessionId, msg } = input
  const text = extractText(msg.item_list)
  if (!text) {
    logger.debug(
      { sessionId, messageId: msg.message_id },
      '[wechat-msg] skipping empty message after extraction',
    )
    return
  }

  const stored: StoredMessage = {
    id: newMessageId(),
    parentMessageId: null,
    role: 'user',
    messageKind: 'normal',
    parts: [{ type: 'text', text }],
    metadata: {
      wechat: {
        accountId: input.accountId,
        peerId: input.peerId,
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

  // Pull current row to decide: is this the first message? Should we rename?
  const current = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { messageCount: true, isUserRename: true },
  })

  const shouldSetTitleFromFirstMessage =
    current != null && current.messageCount === 0 && !current.isUserRename

  // Bump updatedAt + messageCount so the sidebar can sort by recency. On the
  // very first inbound message (and while the user hasn't manually renamed),
  // overwrite the placeholder peerId title with a short preview of the text.
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
