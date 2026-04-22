/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * ApiClient factory — returns a real `wechat-ilink-client` ApiClient, or a
 * structurally compatible mock when the account has been registered in
 * `wechatMockStore`. This is the single choke point used by the poll worker
 * and the outbound send service; nothing else should `new ApiClient` directly
 * for account-scoped calls.
 *
 * Binding / QR login still uses the real ApiClient (see `wechatService.ts`)
 * because QR flow isn't covered by the mock layer.
 */

import { ApiClient, sendText as ilinkSendText, type GetUpdatesResp, type WeixinMessage } from 'wechat-ilink-client'
import type { WeChatAccount } from './wechatAccountStore'
import {
  hasMockAccount,
  drainInbox,
  recordOutbound,
  getMockMode,
} from './wechatMockStore'

/** The narrow slice of ApiClient the rest of the code uses. */
export interface AccountApiClient {
  getUpdates(buf: string, timeoutMs?: number): Promise<GetUpdatesResp>
  /** contextToken is required by iLink protocol (echoed from getUpdates). */
  sendText(to: string, text: string, contextToken: string): Promise<string>
}

class RealApiClient implements AccountApiClient {
  private api: ApiClient
  constructor(account: WeChatAccount) {
    this.api = new ApiClient({ baseUrl: account.baseUrl, token: account.botToken })
  }
  getUpdates(buf: string, timeoutMs?: number): Promise<GetUpdatesResp> {
    return this.api.getUpdates(buf, timeoutMs)
  }
  sendText(to: string, text: string, contextToken: string): Promise<string> {
    return ilinkSendText(this.api, to, text, contextToken)
  }
}

class MockApiClient implements AccountApiClient {
  constructor(private accountId: string) {}

  async getUpdates(buf: string, timeoutMs?: number): Promise<GetUpdatesResp> {
    const msgs = drainInbox(this.accountId)
    if (msgs.length === 0) {
      // Emulate long-poll empty tick — resolve after a short delay so the
      // worker loop doesn't spin tight.
      await new Promise((r) => setTimeout(r, Math.min(timeoutMs ?? 1000, 1000)))
      return { errcode: 0, msgs: [], get_updates_buf: buf }
    }
    return { errcode: 0, msgs, get_updates_buf: buf + '.mock' }
  }

  async sendText(to: string, text: string, contextToken?: string): Promise<string> {
    const mode = getMockMode(this.accountId)
    if (mode === 'sendFails') {
      throw new Error('mock: simulated iLink sendText failure')
    }
    const messageId = `mock-out-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    recordOutbound(this.accountId, { to, text, contextToken, at: Date.now(), messageId })
    return messageId
  }
}

export function createAccountApiClient(account: WeChatAccount): AccountApiClient {
  if (hasMockAccount(account.id)) {
    return new MockApiClient(account.id)
  }
  return new RealApiClient(account)
}

export type { WeixinMessage, GetUpdatesResp }
