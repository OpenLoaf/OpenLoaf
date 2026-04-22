/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * WeChat iLink mock store — drives the ai-browser-test "wechat" suite without
 * hitting the real iLink Bot. The real bot touches the user's phone WeChat,
 * so browser tests would leak real messages. Mocks let us verify the full
 * poll → debounce → runChatStream → sendText loop end-to-end in isolation.
 *
 * Activation is dev/test by default (NODE_ENV !== 'production'). Mock is
 * inert unless a test explicitly registers the account via the debug endpoint
 * `/debug/wechat/reset` + `/debug/wechat/createAccount`.
 *
 * Mock surface per accountId:
 *   - inbox: messages a future `getUpdates` will return
 *   - outbox: a log of `sendText` calls (for assertions)
 *   - mode:  'normal' | 'sendFails' (simulate iLink errors)
 */

import type { WeixinMessage } from 'wechat-ilink-client'

export type MockMode = 'normal' | 'sendFails'

export interface OutboundCall {
  to: string
  text: string
  contextToken?: string
  at: number
  messageId: string
}

interface AccountState {
  inbox: WeixinMessage[]
  outbox: OutboundCall[]
  mode: MockMode
}

const accountStates = new Map<string, AccountState>()

export function wechatMockEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return process.env.OPENLOAF_WECHAT_MOCK === '1'
  }
  return true
}

/** True when caller (factory / helpers) should substitute the mock for this account. */
export function hasMockAccount(accountId: string): boolean {
  if (!wechatMockEnabled()) return false
  return accountStates.has(accountId)
}

export function registerMockAccount(accountId: string, mode: MockMode = 'normal'): void {
  if (!wechatMockEnabled()) throw new Error('wechat mock not enabled')
  accountStates.set(accountId, { inbox: [], outbox: [], mode })
}

export function resetAllMocks(): void {
  accountStates.clear()
}

export function setMockMode(accountId: string, mode: MockMode): void {
  const s = accountStates.get(accountId)
  if (!s) throw new Error(`account ${accountId} not registered in mock`)
  s.mode = mode
}

export function injectInbound(accountId: string, msgs: WeixinMessage[]): void {
  const s = accountStates.get(accountId)
  if (!s) throw new Error(`account ${accountId} not registered in mock`)
  s.inbox.push(...msgs)
}

/** Drain pending inbox — caller (mock getUpdates) returns these and clears the buffer. */
export function drainInbox(accountId: string): WeixinMessage[] {
  const s = accountStates.get(accountId)
  if (!s) return []
  const out = s.inbox
  s.inbox = []
  return out
}

export function recordOutbound(accountId: string, call: OutboundCall): void {
  const s = accountStates.get(accountId)
  if (!s) return
  s.outbox.push(call)
}

export function getOutbound(accountId: string): OutboundCall[] {
  const s = accountStates.get(accountId)
  return s ? [...s.outbox] : []
}

export function getMockMode(accountId: string): MockMode {
  return accountStates.get(accountId)?.mode ?? 'normal'
}
