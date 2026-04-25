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

import type { WeixinMessage, DownloadedMedia } from 'wechat-ilink-client'

export type MockMode = 'normal' | 'sendFails'

/**
 * An outbound send to WeChat. `kind` partitions the record:
 *   - 'text': `text` is set
 *   - 'image' | 'video' | 'file': `localPath` + `mediaType` are set;
 *     `fileName` is required when kind='file'
 * `caption` is optional on media sends. Existing tests (001-008) read
 * `outbox[0].text` — kind='text' keeps that shape intact.
 */
export interface OutboundCall {
  to: string
  kind: 'text' | 'image' | 'video' | 'file'
  text?: string
  localPath?: string
  mediaType?: string
  fileName?: string
  caption?: string
  contextToken?: string
  at: number
  messageId: string
}

/**
 * Registered mock media payload keyed by a lookup string derived from the
 * inbound MessageItem. Mock `downloadMedia` finds the matching entry and
 * returns it so persistMediaItem can write a real file + attachment tag.
 * Without this, all inbound media inject under the mock drops silently
 * because SDK downloadMediaFromItem is a no-op without a real CDN.
 */
interface AccountState {
  inbox: WeixinMessage[]
  outbox: OutboundCall[]
  mode: MockMode
  /** lookupKey → media payload. lookupKey = aes_key (or encrypt_query_param fallback). */
  media: Map<string, DownloadedMedia>
  /**
   * Test-only: when true, the bridge treats the SaaS login as missing even if
   * a real token is in the store. Drives the `[会话上下文：用户尚未登录...]`
   * prompt prefix path so tests can assert identity.md rule 9 compliance.
   */
  fakeLoggedOut: boolean
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
  accountStates.set(accountId, {
    inbox: [],
    outbox: [],
    mode,
    media: new Map(),
    fakeLoggedOut: false,
  })
}

export function resetAllMocks(): void {
  accountStates.clear()
}

/**
 * Reset only one account's mock state — used by parallel browser tests so
 * one test's reset doesn't wipe other concurrent tests' inboxes/outboxes.
 */
export function resetMockAccount(accountId: string): void {
  accountStates.delete(accountId)
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

/**
 * Register a mock media buffer so MockApiClient.downloadMedia can return real
 * bytes for inbound image/voice/video/file items. `lookupKey` must match what
 * `resolveMockMediaLookupKey` extracts from the MessageItem — normally use
 * the item's aes_key (from image_item.aeskey or *_item.media.aes_key).
 *
 * Without this registration, downloadMedia returns null and persistMediaItem
 * drops the item silently, so inbound media tests see empty message text.
 */
export function registerMockMediaBuffer(
  accountId: string,
  lookupKey: string,
  media: DownloadedMedia,
): void {
  const s = accountStates.get(accountId)
  if (!s) throw new Error(`account ${accountId} not registered in mock`)
  s.media.set(lookupKey, media)
}

/**
 * Look up a registered mock media payload by one of the candidate keys
 * extracted from a MessageItem. Returns undefined when no match — MockApiClient
 * then returns null (same as SDK behaviour on missing CDN data).
 */
export function resolveMockMedia(
  accountId: string,
  lookupKeys: string[],
): DownloadedMedia | undefined {
  const s = accountStates.get(accountId)
  if (!s) return undefined
  for (const key of lookupKeys) {
    if (!key) continue
    const hit = s.media.get(key)
    if (hit) return hit
  }
  return undefined
}

/** Toggle the per-account "pretend SaaS is not logged in" flag (test-only). */
export function setFakeLoggedOut(accountId: string, value: boolean): void {
  const s = accountStates.get(accountId)
  if (!s) throw new Error(`account ${accountId} not registered in mock`)
  s.fakeLoggedOut = value
}

/** True when a registered mock account has the fake-logged-out flag on. */
export function isFakeLoggedOut(accountId: string): boolean {
  return accountStates.get(accountId)?.fakeLoggedOut === true
}
