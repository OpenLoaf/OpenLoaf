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
 * WeChat Account Store
 *
 * Persists bound WeChat (iLink Bot) accounts to ~/.openloaf/wechat-accounts.json.
 * Tokens are stored in plaintext with the same security posture as other local
 * credentials (e.g. Notion token in mcp-servers.json) — the file lives inside
 * the user's OpenLoaf data directory.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { resolveOpenLoafPath } from '@openloaf/config'

const FILENAME = 'wechat-accounts.json'

export type WeChatAccountStatus = 'connected' | 'expired' | 'disconnected'

export interface WeChatAccount {
  /** Internal OpenLoaf ID, e.g. "openloaf-wx-ab12cd". */
  id: string
  /** iLink bot identifier (e.g. "hex@im.bot") — used as display name fallback. */
  botId: string
  /** Human-visible name. Defaults to botId; future: allow rename. */
  displayName: string
  /** Bearer token for iLink CGI. */
  botToken: string
  /** iLink API base URL returned at login. */
  baseUrl: string
  /** ilink_user_id of the WeChat user who scanned the QR. */
  ownerUserId?: string
  /** Long-poll cursor for getupdates. */
  syncBuf: string
  status: WeChatAccountStatus
  boundAt: string
  lastActiveAt?: string
}

interface StoreFile {
  version: 1
  accounts: WeChatAccount[]
}

function getStorePath(): string {
  return resolveOpenLoafPath(FILENAME)
}

function readStore(): StoreFile {
  const filePath = getStorePath()
  if (!existsSync(filePath)) return { version: 1, accounts: [] }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as StoreFile
    return {
      version: 1,
      accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
    }
  } catch {
    return { version: 1, accounts: [] }
  }
}

function writeStore(store: StoreFile): void {
  const filePath = getStorePath()
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${Date.now()}.tmp`
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

export function generateAccountId(): string {
  return `openloaf-wx-${randomBytes(3).toString('hex')}`
}

/**
 * In-memory overlay for ephemeral test accounts (browser test mocks). Reads
 * unify disk+memory; writes go to disk only when not ephemeral. This prevents
 * mock account spam from polluting wechat-accounts.json across runs.
 */
const ephemeralAccounts = new Map<string, WeChatAccount>()

export function listAccounts(): WeChatAccount[] {
  const disk = readStore().accounts
  if (ephemeralAccounts.size === 0) return disk
  const map = new Map(disk.map((a) => [a.id, a]))
  for (const [id, a] of ephemeralAccounts) map.set(id, a)
  return [...map.values()]
}

export function getAccount(id: string): WeChatAccount | undefined {
  return ephemeralAccounts.get(id) ?? readStore().accounts.find((a) => a.id === id)
}

export function findAccountByBotId(botId: string): WeChatAccount | undefined {
  for (const a of ephemeralAccounts.values()) if (a.botId === botId) return a
  return readStore().accounts.find((a) => a.botId === botId)
}

export function upsertAccount(
  account: WeChatAccount,
  opts?: { ephemeral?: boolean },
): WeChatAccount {
  if (opts?.ephemeral) {
    ephemeralAccounts.set(account.id, account)
    return account
  }
  const store = readStore()
  const idx = store.accounts.findIndex((a) => a.id === account.id)
  if (idx >= 0) store.accounts[idx] = account
  else store.accounts.push(account)
  writeStore(store)
  return account
}

export function removeEphemeralAccount(id: string): void {
  ephemeralAccounts.delete(id)
}

export function removeAccount(id: string): boolean {
  const store = readStore()
  const before = store.accounts.length
  store.accounts = store.accounts.filter((a) => a.id !== id)
  if (store.accounts.length === before) return false
  writeStore(store)
  return true
}

export function updateAccountSyncBuf(id: string, syncBuf: string): void {
  const store = readStore()
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) return
  acc.syncBuf = syncBuf
  acc.lastActiveAt = new Date().toISOString()
  writeStore(store)
}

export function updateAccountStatus(id: string, status: WeChatAccountStatus): void {
  const store = readStore()
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) return
  acc.status = status
  writeStore(store)
}
