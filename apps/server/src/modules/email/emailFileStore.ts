import { promises as fs } from 'node:fs'
import fsSync from 'node:fs'
import path from 'node:path'
import { getDefaultWorkspaceRootDir } from '@openloaf/config'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredEmailIndex = {
  id: string
  externalId: string
  messageId: string | null
  subject: string | null
  from: unknown
  to: unknown
  cc: unknown | null
  bcc: unknown | null
  date: string | null
  flags: string[]
  snippet: string | null
  attachments: Array<{
    filename?: string
    contentType?: string
    size?: number
    cid?: string
  }> | null
  size: number | null
  createdAt: string
  updatedAt: string
}

export type StoredEmailMeta = StoredEmailIndex & {
  accountEmail: string
  mailboxPath: string
  workspaceId: string
  hasBodyHtml: boolean
  hasBodyMd: boolean
  hasEml: boolean
  cachedAttachments: string[]
}

export type StoredMailbox = {
  id: string
  path: string
  name: string
  parentPath: string | null
  delimiter: string | null
  attributes: string[]
  sort: number
  createdAt: string
  updatedAt: string
}

export type StoredDraft = {
  id: string
  accountEmail: string
  mode: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  inReplyTo: string | null
  references: string[] | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_STORE_DIR = 'email-store'
const LRU_MAX_SIZE = 30

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Encode mailbox path to filesystem-safe base64url. */
export function encodeMailboxPath(mailboxPath: string): string {
  return Buffer.from(mailboxPath, 'utf8').toString('base64url')
}

/** Decode base64url-encoded mailbox path. */
export function decodeMailboxPath(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

/** Resolve workspace root for email store. */
function resolveWorkspaceRoot(workspaceId: string): string {
  // 逻辑：email-store 存放在默认工作区根目录下。
  const root = getDefaultWorkspaceRootDir()
  return path.join(root, '.openloaf', EMAIL_STORE_DIR)
}

/** Resolve account directory. */
export function resolveAccountDir(workspaceId: string, accountEmail: string): string {
  const storeRoot = resolveWorkspaceRoot(workspaceId)
  return path.join(storeRoot, accountEmail.trim().toLowerCase())
}

/** Resolve mailbox directory. */
export function resolveMailboxDir(
  workspaceId: string,
  accountEmail: string,
  mailboxPath: string,
): string {
  const accountDir = resolveAccountDir(workspaceId, accountEmail)
  return path.join(accountDir, encodeMailboxPath(mailboxPath))
}

/** Resolve message directory. */
export function resolveMessageDir(
  workspaceId: string,
  accountEmail: string,
  mailboxPath: string,
  externalId: string,
): string {
  const mailboxDir = resolveMailboxDir(workspaceId, accountEmail, mailboxPath)
  return path.join(mailboxDir, externalId)
}

// ---------------------------------------------------------------------------
// Per-mailbox mutex (Promise-based queue)
// ---------------------------------------------------------------------------

const mailboxLocks = new Map<string, Promise<void>>()

async function withMailboxLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = mailboxLocks.get(lockKey) ?? Promise.resolve()
  let resolve: () => void
  const next = new Promise<void>((r) => {
    resolve = r
  })
  mailboxLocks.set(lockKey, next)
  try {
    await prev
    return await fn()
  } finally {
    resolve!()
    if (mailboxLocks.get(lockKey) === next) {
      mailboxLocks.delete(lockKey)
    }
  }
}

function mailboxLockKey(workspaceId: string, accountEmail: string, mailboxPath: string): string {
  return `${workspaceId}::${accountEmail.trim().toLowerCase()}::${mailboxPath}`
}

// ---------------------------------------------------------------------------
// LRU Cache for mailbox index
// ---------------------------------------------------------------------------

type IndexCacheEntry = {
  index: Map<string, StoredEmailIndex>
  mtimeMs: number
}

const lruCache = new Map<string, IndexCacheEntry>()
const lruOrder: string[] = []

function evictLru() {
  while (lruOrder.length > LRU_MAX_SIZE) {
    const oldest = lruOrder.shift()
    if (oldest) lruCache.delete(oldest)
  }
}

function touchLru(key: string) {
  const idx = lruOrder.indexOf(key)
  if (idx >= 0) lruOrder.splice(idx, 1)
  lruOrder.push(key)
  evictLru()
}

function invalidateIndexCache(key: string) {
  lruCache.delete(key)
  const idx = lruOrder.indexOf(key)
  if (idx >= 0) lruOrder.splice(idx, 1)
}

/** Clear all LRU caches (for testing). */
export function clearEmailFileStoreCache() {
  lruCache.clear()
  lruOrder.length = 0
}

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

function parseJsonlLine(line: string): StoredEmailIndex | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as StoredEmailIndex
  } catch {
    return null
  }
}

async function readIndexJsonlRaw(indexPath: string): Promise<StoredEmailIndex[]> {
  try {
    const content = await fs.readFile(indexPath, 'utf8')
    const lines = content.split('\n')
    const entries: StoredEmailIndex[] = []
    for (const line of lines) {
      const entry = parseJsonlLine(line)
      if (entry) entries.push(entry)
    }
    return entries
  } catch (err: any) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
}

// ---------------------------------------------------------------------------
// Email message write
// ---------------------------------------------------------------------------

export type WriteEmailMessageInput = {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  id: string
  externalId: string
  messageId?: string | null
  subject?: string | null
  from: unknown
  to: unknown
  cc?: unknown | null
  bcc?: unknown | null
  date?: string | null
  flags: string[]
  snippet?: string | null
  attachments?: Array<{
    filename?: string
    contentType?: string
    size?: number
    cid?: string
  }> | null
  size?: number | null
  bodyHtml?: string | null
  bodyHtmlRaw?: string | null
  bodyText?: string | null
  rawRfc822?: string | null
  createdAt?: string
  updatedAt?: string
}

/** Write email message to file system (directory + meta.json + body files + index). */
export async function writeEmailMessage(input: WriteEmailMessageInput): Promise<void> {
  const lockKey = mailboxLockKey(input.workspaceId, input.accountEmail, input.mailboxPath)
  await withMailboxLock(lockKey, async () => {
    const msgDir = resolveMessageDir(
      input.workspaceId,
      input.accountEmail,
      input.mailboxPath,
      input.externalId,
    )
    await fs.mkdir(msgDir, { recursive: true })

    const now = new Date().toISOString()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? now

    const hasBodyHtml = Boolean(input.bodyHtml)
    const hasBodyMd = Boolean(input.bodyText)
    const hasEml = Boolean(input.rawRfc822)

    // 逻辑：构建 meta.json，包含完整元数据用于目录自包含恢复。
    const meta: StoredEmailMeta = {
      id: input.id,
      externalId: input.externalId,
      messageId: input.messageId ?? null,
      subject: input.subject ?? null,
      from: input.from,
      to: input.to,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      date: input.date ?? null,
      flags: input.flags,
      snippet: input.snippet ?? null,
      attachments: input.attachments ?? null,
      size: input.size ?? null,
      createdAt,
      updatedAt,
      accountEmail: input.accountEmail.trim().toLowerCase(),
      mailboxPath: input.mailboxPath,
      workspaceId: input.workspaceId,
      hasBodyHtml,
      hasBodyMd,
      hasEml,
      cachedAttachments: [],
    }
    await fs.writeFile(path.join(msgDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

    // 逻辑：内容为空则不创建对应文件。
    if (input.bodyHtml) {
      await fs.writeFile(path.join(msgDir, 'body.html'), input.bodyHtml, 'utf8')
    }
    if (input.bodyHtmlRaw) {
      await fs.writeFile(path.join(msgDir, 'body-raw.html'), input.bodyHtmlRaw, 'utf8')
    }
    if (input.bodyText) {
      await fs.writeFile(path.join(msgDir, 'body.md'), input.bodyText, 'utf8')
    }
    if (input.rawRfc822) {
      await fs.writeFile(path.join(msgDir, 'message.eml'), input.rawRfc822, 'utf8')
    }

    // 逻辑：追加 index.jsonl 索引行。
    const indexEntry: StoredEmailIndex = {
      id: input.id,
      externalId: input.externalId,
      messageId: input.messageId ?? null,
      subject: input.subject ?? null,
      from: input.from,
      to: input.to,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      date: input.date ?? null,
      flags: input.flags,
      snippet: input.snippet ?? null,
      attachments: input.attachments ?? null,
      size: input.size ?? null,
      createdAt,
      updatedAt,
    }
    const mailboxDir = resolveMailboxDir(input.workspaceId, input.accountEmail, input.mailboxPath)
    await fs.mkdir(mailboxDir, { recursive: true })
    await fs.appendFile(
      path.join(mailboxDir, 'index.jsonl'),
      `${JSON.stringify(indexEntry)}\n`,
      'utf8',
    )

    // 逻辑：写入后使缓存失效。
    const cacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.mailboxPath}`
    invalidateIndexCache(cacheKey)
  })
}

// ---------------------------------------------------------------------------
// Email message read
// ---------------------------------------------------------------------------

/** Append a single index entry (used by updateEmailFlags). */
export async function appendEmailIndex(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  entry: StoredEmailIndex
}): Promise<void> {
  const mailboxDir = resolveMailboxDir(input.workspaceId, input.accountEmail, input.mailboxPath)
  await fs.mkdir(mailboxDir, { recursive: true })
  await fs.appendFile(
    path.join(mailboxDir, 'index.jsonl'),
    `${JSON.stringify(input.entry)}\n`,
    'utf8',
  )
  const cacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.mailboxPath}`
  invalidateIndexCache(cacheKey)
}

/** Load mailbox index with LRU cache + mtime check. */
export async function loadMailboxIndex(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
}): Promise<Map<string, StoredEmailIndex>> {
  const cacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.mailboxPath}`
  const mailboxDir = resolveMailboxDir(input.workspaceId, input.accountEmail, input.mailboxPath)
  const indexPath = path.join(mailboxDir, 'index.jsonl')

  let mtimeMs = 0
  try {
    const stat = await fs.stat(indexPath)
    mtimeMs = stat.mtimeMs
  } catch {
    return new Map()
  }

  const cached = lruCache.get(cacheKey)
  if (cached && cached.mtimeMs === mtimeMs) {
    touchLru(cacheKey)
    return cached.index
  }

  // 逻辑：last-write-wins 去重，同一 externalId 取最后一行。
  const entries = await readIndexJsonlRaw(indexPath)
  const index = new Map<string, StoredEmailIndex>()
  for (const entry of entries) {
    index.set(entry.externalId, entry)
  }

  lruCache.set(cacheKey, { index, mtimeMs })
  touchLru(cacheKey)
  return index
}

/** Read meta.json for a message. */
export async function readEmailMeta(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<StoredEmailMeta | null> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  try {
    const content = await fs.readFile(path.join(msgDir, 'meta.json'), 'utf8')
    return JSON.parse(content) as StoredEmailMeta
  } catch {
    return null
  }
}

/** Read body.html for a message. */
export async function readEmailBodyHtml(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<string | null> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  try {
    return await fs.readFile(path.join(msgDir, 'body.html'), 'utf8')
  } catch {
    return null
  }
}

/** Read body-raw.html (original unfiltered HTML) for a message. */
export async function readEmailBodyHtmlRaw(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<string | null> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  try {
    return await fs.readFile(path.join(msgDir, 'body-raw.html'), 'utf8')
  } catch {
    return null
  }
}

/** Read body.md for a message. */
export async function readEmailBodyMd(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<string | null> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  try {
    return await fs.readFile(path.join(msgDir, 'body.md'), 'utf8')
  } catch {
    return null
  }
}

/** Read message.eml for a message. */
export async function readEmailEml(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<string | null> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  try {
    return await fs.readFile(path.join(msgDir, 'message.eml'), 'utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Attachment caching
// ---------------------------------------------------------------------------

/** Cache a downloaded attachment to local filesystem. */
export async function cacheAttachment(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
  filename: string
  content: Buffer
  contentType: string
}): Promise<void> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  const attachDir = path.join(msgDir, 'attachments')
  await fs.mkdir(attachDir, { recursive: true })
  await fs.writeFile(path.join(attachDir, input.filename), input.content)

  // 逻辑：更新 meta.json 中的 cachedAttachments 列表。
  const metaPath = path.join(msgDir, 'meta.json')
  try {
    const raw = await fs.readFile(metaPath, 'utf8')
    const meta = JSON.parse(raw) as StoredEmailMeta
    if (!meta.cachedAttachments.includes(input.filename)) {
      meta.cachedAttachments.push(input.filename)
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    }
  } catch {
    // 逻辑：meta.json 不存在时忽略。
  }
}

/** Read a cached attachment. */
export async function readCachedAttachment(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
  filename: string
}): Promise<{ content: Buffer; contentType: string } | null> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  const filePath = path.join(msgDir, 'attachments', input.filename)
  try {
    const content = await fs.readFile(filePath)
    // 逻辑：从 meta.json 的 attachments 元信息推断 contentType。
    const meta = await readEmailMeta(input)
    const attachMeta = meta?.attachments?.find((a) => a.filename === input.filename)
    return { content, contentType: attachMeta?.contentType ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** List cached attachment filenames. */
export async function listCachedAttachments(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<string[]> {
  const msgDir = resolveMessageDir(
    input.workspaceId,
    input.accountEmail,
    input.mailboxPath,
    input.externalId,
  )
  const attachDir = path.join(msgDir, 'attachments')
  try {
    return await fs.readdir(attachDir)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Flags update
// ---------------------------------------------------------------------------

/** Update email flags in meta.json and append new index line. */
export async function updateEmailFlags(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
  flags: string[]
}): Promise<void> {
  const lockKey = mailboxLockKey(input.workspaceId, input.accountEmail, input.mailboxPath)
  await withMailboxLock(lockKey, async () => {
    const msgDir = resolveMessageDir(
      input.workspaceId,
      input.accountEmail,
      input.mailboxPath,
      input.externalId,
    )
    const metaPath = path.join(msgDir, 'meta.json')
    try {
      const raw = await fs.readFile(metaPath, 'utf8')
      const meta = JSON.parse(raw) as StoredEmailMeta
      meta.flags = input.flags
      meta.updatedAt = new Date().toISOString()
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')

      // 逻辑：追加 index.jsonl 新行（last-write-wins）。
      const indexEntry: StoredEmailIndex = {
        id: meta.id,
        externalId: meta.externalId,
        messageId: meta.messageId,
        subject: meta.subject,
        from: meta.from,
        to: meta.to,
        cc: meta.cc,
        bcc: meta.bcc,
        date: meta.date,
        flags: input.flags,
        snippet: meta.snippet,
        attachments: meta.attachments,
        size: meta.size,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      }
      const mailboxDir = resolveMailboxDir(
        input.workspaceId,
        input.accountEmail,
        input.mailboxPath,
      )
      await fs.appendFile(
        path.join(mailboxDir, 'index.jsonl'),
        `${JSON.stringify(indexEntry)}\n`,
        'utf8',
      )
    } catch {
      // 逻辑：meta.json 不存在时忽略。
    }

    const cacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.mailboxPath}`
    invalidateIndexCache(cacheKey)
  })
}

// ---------------------------------------------------------------------------
// Delete / Move
// ---------------------------------------------------------------------------

/** Delete email message directory and remove from index. */
export async function deleteEmailMessage(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
  externalId: string
}): Promise<void> {
  const lockKey = mailboxLockKey(input.workspaceId, input.accountEmail, input.mailboxPath)
  await withMailboxLock(lockKey, async () => {
    const msgDir = resolveMessageDir(
      input.workspaceId,
      input.accountEmail,
      input.mailboxPath,
      input.externalId,
    )
    await fs.rm(msgDir, { recursive: true, force: true })

    // 逻辑：重写 index.jsonl，移除该 externalId 的所有行。
    const mailboxDir = resolveMailboxDir(input.workspaceId, input.accountEmail, input.mailboxPath)
    const indexPath = path.join(mailboxDir, 'index.jsonl')
    const entries = await readIndexJsonlRaw(indexPath)
    const filtered = entries.filter((e) => e.externalId !== input.externalId)
    const content = filtered.map((e) => `${JSON.stringify(e)}\n`).join('')
    await fs.writeFile(indexPath, content, 'utf8')

    const cacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.mailboxPath}`
    invalidateIndexCache(cacheKey)
  })
}

/** Move email message from one mailbox to another. */
export async function moveEmailMessage(input: {
  workspaceId: string
  accountEmail: string
  fromMailboxPath: string
  toMailboxPath: string
  externalId: string
}): Promise<void> {
  // 逻辑：先读取源 meta，移动目录，更新两个 index.jsonl。
  const srcLockKey = mailboxLockKey(input.workspaceId, input.accountEmail, input.fromMailboxPath)
  const dstLockKey = mailboxLockKey(input.workspaceId, input.accountEmail, input.toMailboxPath)

  // 逻辑：按字典序加锁避免死锁。
  const [firstKey, secondKey] =
    srcLockKey < dstLockKey ? [srcLockKey, dstLockKey] : [dstLockKey, srcLockKey]

  await withMailboxLock(firstKey, () =>
    withMailboxLock(secondKey, async () => {
      const srcDir = resolveMessageDir(
        input.workspaceId,
        input.accountEmail,
        input.fromMailboxPath,
        input.externalId,
      )
      const dstMailboxDir = resolveMailboxDir(
        input.workspaceId,
        input.accountEmail,
        input.toMailboxPath,
      )
      const dstDir = path.join(dstMailboxDir, input.externalId)

      // 逻辑：读取源 meta 用于更新目标 index。
      let meta: StoredEmailMeta | null = null
      try {
        const raw = await fs.readFile(path.join(srcDir, 'meta.json'), 'utf8')
        meta = JSON.parse(raw) as StoredEmailMeta
      } catch {
        return
      }

      await fs.mkdir(dstMailboxDir, { recursive: true })
      await fs.rename(srcDir, dstDir)

      // 逻辑：更新目标 meta.json 的 mailboxPath。
      meta.mailboxPath = input.toMailboxPath
      meta.updatedAt = new Date().toISOString()
      await fs.writeFile(path.join(dstDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

      // 逻辑：从源 index 移除。
      const srcMailboxDir = resolveMailboxDir(
        input.workspaceId,
        input.accountEmail,
        input.fromMailboxPath,
      )
      const srcIndexPath = path.join(srcMailboxDir, 'index.jsonl')
      const srcEntries = await readIndexJsonlRaw(srcIndexPath)
      const srcFiltered = srcEntries.filter((e) => e.externalId !== input.externalId)
      await fs.writeFile(
        srcIndexPath,
        srcFiltered.map((e) => `${JSON.stringify(e)}\n`).join(''),
        'utf8',
      )

      // 逻辑：追加到目标 index。
      const dstIndexEntry: StoredEmailIndex = {
        id: meta.id,
        externalId: meta.externalId,
        messageId: meta.messageId,
        subject: meta.subject,
        from: meta.from,
        to: meta.to,
        cc: meta.cc,
        bcc: meta.bcc,
        date: meta.date,
        flags: meta.flags,
        snippet: meta.snippet,
        attachments: meta.attachments,
        size: meta.size,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      }
      await fs.appendFile(
        path.join(dstMailboxDir, 'index.jsonl'),
        `${JSON.stringify(dstIndexEntry)}\n`,
        'utf8',
      )

      const srcCacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.fromMailboxPath}`
      const dstCacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.toMailboxPath}`
      invalidateIndexCache(srcCacheKey)
      invalidateIndexCache(dstCacheKey)
    }),
  )
}

// ---------------------------------------------------------------------------
// Mailbox metadata
// ---------------------------------------------------------------------------

/** Write mailboxes.json for an account. */
export async function writeMailboxes(input: {
  workspaceId: string
  accountEmail: string
  mailboxes: StoredMailbox[]
}): Promise<void> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  await fs.mkdir(accountDir, { recursive: true })
  await fs.writeFile(
    path.join(accountDir, 'mailboxes.json'),
    JSON.stringify(input.mailboxes, null, 2),
    'utf8',
  )
}

/** Read mailboxes.json for an account. */
export async function readMailboxes(input: {
  workspaceId: string
  accountEmail: string
}): Promise<StoredMailbox[]> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  try {
    const content = await fs.readFile(path.join(accountDir, 'mailboxes.json'), 'utf8')
    return JSON.parse(content) as StoredMailbox[]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Draft operations
// ---------------------------------------------------------------------------

/** Save draft to file. */
export async function saveDraftFile(input: {
  workspaceId: string
  accountEmail: string
  draft: StoredDraft
}): Promise<void> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  const draftsDir = path.join(accountDir, 'drafts')
  await fs.mkdir(draftsDir, { recursive: true })
  await fs.writeFile(
    path.join(draftsDir, `${input.draft.id}.json`),
    JSON.stringify(input.draft, null, 2),
    'utf8',
  )
}

/** Read a single draft file. */
export async function readDraftFile(input: {
  workspaceId: string
  accountEmail: string
  draftId: string
}): Promise<StoredDraft | null> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  try {
    const content = await fs.readFile(
      path.join(accountDir, 'drafts', `${input.draftId}.json`),
      'utf8',
    )
    return JSON.parse(content) as StoredDraft
  } catch {
    return null
  }
}

/** List all draft files for an account. */
export async function listDraftFiles(input: {
  workspaceId: string
  accountEmail: string
}): Promise<StoredDraft[]> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  const draftsDir = path.join(accountDir, 'drafts')
  try {
    const entries = await fs.readdir(draftsDir)
    const drafts: StoredDraft[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const content = await fs.readFile(path.join(draftsDir, entry), 'utf8')
        drafts.push(JSON.parse(content) as StoredDraft)
      } catch {
        // 逻辑：跳过损坏的草稿文件。
      }
    }
    return drafts.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  } catch {
    return []
  }
}

/** Delete a draft file. */
export async function deleteDraftFile(input: {
  workspaceId: string
  accountEmail: string
  draftId: string
}): Promise<void> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  try {
    await fs.unlink(path.join(accountDir, 'drafts', `${input.draftId}.json`))
  } catch {
    // 逻辑：文件不存在时忽略。
  }
}

// ---------------------------------------------------------------------------
// JSONL compaction
// ---------------------------------------------------------------------------

/** Compact mailbox index: deduplicate, keep only latest entry per externalId. */
export async function compactMailboxIndex(input: {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
}): Promise<void> {
  const lockKey = mailboxLockKey(input.workspaceId, input.accountEmail, input.mailboxPath)
  await withMailboxLock(lockKey, async () => {
    const mailboxDir = resolveMailboxDir(input.workspaceId, input.accountEmail, input.mailboxPath)
    const indexPath = path.join(mailboxDir, 'index.jsonl')
    const entries = await readIndexJsonlRaw(indexPath)

    // 逻辑：last-write-wins 去重。
    const deduped = new Map<string, StoredEmailIndex>()
    for (const entry of entries) {
      deduped.set(entry.externalId, entry)
    }

    const content = Array.from(deduped.values())
      .map((e) => `${JSON.stringify(e)}\n`)
      .join('')
    await fs.writeFile(indexPath, content, 'utf8')

    const cacheKey = `${input.workspaceId}::${input.accountEmail.trim().toLowerCase()}::${input.mailboxPath}`
    invalidateIndexCache(cacheKey)
  })
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Delete all files for an email account. */
export async function deleteAccountFiles(input: {
  workspaceId: string
  accountEmail: string
}): Promise<void> {
  const accountDir = resolveAccountDir(input.workspaceId, input.accountEmail)
  try {
    await fs.rm(accountDir, { recursive: true, force: true })
  } catch {
    // 逻辑：目录不存在时忽略。
  }
}
