/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * WeChat outbound — the single call-site for sending text back to the bound
 * user's phone WeChat via iLink. On failure, writes the error message to
 * ChatSession.errorMessage so the OpenLoaf UI can surface it.
 */

import { prisma } from '@openloaf/db'
import { createAccountApiClient } from './apiClientFactory'
import { getAccount } from './wechatAccountStore'
import { logger } from '@/common/logger'

export async function sendWeChatText(input: {
  accountId: string
  text: string
  /** iLink context token echoed from the most recent inbound message. Required by protocol. */
  contextToken: string
}): Promise<string | null> {
  const acc = getAccount(input.accountId)
  if (!acc) {
    logger.warn({ accountId: input.accountId }, '[wechat-send] account not found')
    return null
  }
  if (!acc.ownerUserId) {
    logger.warn({ accountId: input.accountId }, '[wechat-send] ownerUserId missing')
    return null
  }
  const api = createAccountApiClient(acc)
  try {
    const id = await api.sendText(acc.ownerUserId, input.text, input.contextToken)
    logger.info(
      { accountId: input.accountId, ilinkMessageId: id, len: input.text.length },
      '[wechat-send] sent',
    )
    return id
  } catch (err) {
    logger.warn({ err: String(err), accountId: input.accountId }, '[wechat-send] failed')
    try {
      // Update by compound key — works regardless of legacy session id.
      await prisma.chatSession.update({
        where: { kind_wechatAccountId: { kind: 'wechat', wechatAccountId: input.accountId } },
        data: { errorMessage: `微信发送失败：${String(err)}` },
      })
    } catch {
      /* session may not exist yet — ignore */
    }
    return null
  }
}
