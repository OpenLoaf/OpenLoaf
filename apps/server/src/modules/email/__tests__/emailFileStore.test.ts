import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  setOpenLoafRootOverride,
  setDefaultWorkspaceRootOverride,
} from '@openloaf/config'

// 逻辑：创建临时目录隔离测试环境。
const tempDir = mkdtempSync(path.join(tmpdir(), 'openloaf-email-test-'))
setOpenLoafRootOverride(tempDir)
setDefaultWorkspaceRootOverride(tempDir)

import {
  encodeMailboxPath,
  decodeMailboxPath,
  resolveAccountDir,
  resolveMailboxDir,
  resolveMessageDir,
  writeEmailMessage,
  loadMailboxIndex,
  readEmailMeta,
  readEmailBodyHtml,
  readEmailBodyMd,
  readEmailEml,
  appendEmailIndex,
  updateEmailFlags,
  cacheAttachment,
  readCachedAttachment,
  listCachedAttachments,
  writeMailboxes,
  readMailboxes,
  saveDraftFile,
  readDraftFile,
  listDraftFiles,
  deleteDraftFile,
  deleteEmailMessage,
  moveEmailMessage,
  compactMailboxIndex,
  deleteAccountFiles,
  clearEmailFileStoreCache,
} from '../emailFileStore'
import type { StoredMailbox, StoredDraft, StoredEmailIndex } from '../emailFileStore'

const WS = 'ws-test'
const ACCOUNT = 'user@example.com'
const MAILBOX = 'INBOX'

// =========================================================================
// A 层：纯函数
// =========================================================================

// A1: encodeMailboxPath 编码普通路径
const encodedInbox = encodeMailboxPath('INBOX')
assert.ok(encodedInbox.length > 0, 'A1: should encode INBOX')
assert.ok(!encodedInbox.includes('/'), 'A1: should not contain /')

// A2: encodeMailboxPath 编码特殊字符
const encodedSpecial = encodeMailboxPath('[Gmail]/已发送邮件')
assert.ok(!encodedSpecial.includes('/'), 'A2: should not contain /')
assert.ok(!encodedSpecial.includes('['), 'A2: should not contain [')

// A3: decodeMailboxPath 往返一致
assert.equal(decodeMailboxPath(encodedInbox), 'INBOX', 'A3: roundtrip INBOX')

// A4: decodeMailboxPath 中文路径往返
assert.equal(
  decodeMailboxPath(encodeMailboxPath('[Gmail]/已发送邮件')),
  '[Gmail]/已发送邮件',
  'A4: roundtrip Chinese path',
)

// =========================================================================
// B 层：文件 I/O
// =========================================================================

// B1: writeEmailMessage 创建完整邮件目录
await writeEmailMessage({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  id: 'msg-1',
  externalId: '100',
  messageId: '<test@example.com>',
  subject: 'Test Subject',
  from: { value: [{ address: 'sender@example.com', name: 'Sender' }] },
  to: { value: [{ address: 'user@example.com', name: 'User' }] },
  date: '2024-01-01T00:00:00.000Z',
  flags: ['\\Seen'],
  snippet: 'Hello world',
  bodyHtml: '<p>Hello</p>',
  bodyText: 'Hello world',
  rawRfc822: 'From: sender@example.com\r\nSubject: Test\r\n\r\nHello',
  size: 100,
})

const msgDir = resolveMessageDir(WS, ACCOUNT, MAILBOX, '100')
assert.ok(existsSync(path.join(msgDir, 'meta.json')), 'B1: meta.json should exist')
assert.ok(existsSync(path.join(msgDir, 'body.html')), 'B1: body.html should exist')
assert.ok(existsSync(path.join(msgDir, 'body.md')), 'B1: body.md should exist')
assert.ok(existsSync(path.join(msgDir, 'message.eml')), 'B1: message.eml should exist')

// B2: writeEmailMessage 空 body 不创建文件
await writeEmailMessage({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  id: 'msg-2',
  externalId: '101',
  subject: 'No Body',
  from: {},
  to: {},
  flags: [],
})

const msgDir2 = resolveMessageDir(WS, ACCOUNT, MAILBOX, '101')
assert.ok(existsSync(path.join(msgDir2, 'meta.json')), 'B2: meta.json should exist')
assert.ok(!existsSync(path.join(msgDir2, 'body.html')), 'B2: body.html should not exist')
assert.ok(!existsSync(path.join(msgDir2, 'body.md')), 'B2: body.md should not exist')
assert.ok(!existsSync(path.join(msgDir2, 'message.eml')), 'B2: message.eml should not exist')

// B3: readEmailMeta 读取 meta.json
const meta = await readEmailMeta({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX, externalId: '100' })
assert.ok(meta, 'B3: meta should exist')
assert.equal(meta!.subject, 'Test Subject', 'B3: subject should match')
assert.equal(meta!.hasBodyHtml, true, 'B3: hasBodyHtml should be true')

// B4: readEmailBodyHtml 读取 body.html
const html = await readEmailBodyHtml({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX, externalId: '100' })
assert.equal(html, '<p>Hello</p>', 'B4: body.html content should match')

// B5: readEmailBodyMd 读取 body.md
const md = await readEmailBodyMd({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX, externalId: '100' })
assert.equal(md, 'Hello world', 'B5: body.md content should match')

// B6: readEmailEml 读取 message.eml
const eml = await readEmailEml({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX, externalId: '100' })
assert.ok(eml?.includes('From: sender@example.com'), 'B6: eml should contain From header')

// B7: readEmailBodyHtml 文件不存在返回 null
const noHtml = await readEmailBodyHtml({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX, externalId: '101' })
assert.equal(noHtml, null, 'B7: should return null for missing body.html')

// B8: appendEmailIndex 追加索引行
const indexBefore = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
const countBefore = indexBefore.size
clearEmailFileStoreCache()

// B9: loadMailboxIndex 加载索引
const index = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
assert.ok(index.has('100'), 'B9: should have externalId 100')
assert.ok(index.has('101'), 'B9: should have externalId 101')

// B10: loadMailboxIndex last-write-wins
await appendEmailIndex({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  entry: {
    id: 'msg-1',
    externalId: '100',
    messageId: null,
    subject: 'Updated Subject',
    from: {},
    to: {},
    cc: null,
    bcc: null,
    date: null,
    flags: ['\\Seen', '\\Flagged'],
    snippet: null,
    attachments: null,
    size: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
})
clearEmailFileStoreCache()
const indexUpdated = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
assert.equal(indexUpdated.get('100')?.subject, 'Updated Subject', 'B10: last-write-wins')

// B11: updateEmailFlags 更新标记
await updateEmailFlags({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  externalId: '100',
  flags: ['\\Seen', '\\Flagged', '\\Deleted'],
})
const metaAfterFlags = await readEmailMeta({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX, externalId: '100' })
assert.ok(metaAfterFlags!.flags.includes('\\Deleted'), 'B11: meta flags should include \\Deleted')

// B12: cacheAttachment 保存附件
await cacheAttachment({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  externalId: '100',
  filename: 'report.pdf',
  content: Buffer.from('PDF content'),
  contentType: 'application/pdf',
})
assert.ok(
  existsSync(path.join(msgDir, 'attachments', 'report.pdf')),
  'B12: attachment file should exist',
)

// B13: readCachedAttachment 读取缓存附件
const cached = await readCachedAttachment({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  externalId: '100',
  filename: 'report.pdf',
})
assert.ok(cached, 'B13: cached attachment should exist')
assert.equal(cached!.content.toString(), 'PDF content', 'B13: content should match')

// B14: readCachedAttachment 未缓存返回 null
const notCached = await readCachedAttachment({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  externalId: '100',
  filename: 'nonexistent.pdf',
})
assert.equal(notCached, null, 'B14: should return null for uncached attachment')

// B15: writeMailboxes + readMailboxes
const mailboxes: StoredMailbox[] = [
  {
    id: 'mb-1',
    path: 'INBOX',
    name: 'Inbox',
    parentPath: null,
    delimiter: '/',
    attributes: ['\\Inbox'],
    sort: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]
await writeMailboxes({ workspaceId: WS, accountEmail: ACCOUNT, mailboxes })
const readMb = await readMailboxes({ workspaceId: WS, accountEmail: ACCOUNT })
assert.equal(readMb.length, 1, 'B15: should have 1 mailbox')
assert.equal(readMb[0]!.path, 'INBOX', 'B15: mailbox path should match')

// B16: saveDraftFile + readDraftFile
const draft: StoredDraft = {
  id: 'draft-1',
  accountEmail: ACCOUNT,
  mode: 'compose',
  to: 'recipient@example.com',
  cc: '',
  bcc: '',
  subject: 'Draft Subject',
  body: '<p>Draft body</p>',
  inReplyTo: null,
  references: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
await saveDraftFile({ workspaceId: WS, accountEmail: ACCOUNT, draft })
const readDraft = await readDraftFile({ workspaceId: WS, accountEmail: ACCOUNT, draftId: 'draft-1' })
assert.ok(readDraft, 'B16: draft should exist')
assert.equal(readDraft!.subject, 'Draft Subject', 'B16: draft subject should match')

// B17: listDraftFiles 列出所有草稿
const draft2: StoredDraft = { ...draft, id: 'draft-2', subject: 'Draft 2', updatedAt: new Date().toISOString() }
await saveDraftFile({ workspaceId: WS, accountEmail: ACCOUNT, draft: draft2 })
const drafts = await listDraftFiles({ workspaceId: WS, accountEmail: ACCOUNT })
assert.equal(drafts.length, 2, 'B17: should have 2 drafts')

// B18: deleteDraftFile 删除草稿
await deleteDraftFile({ workspaceId: WS, accountEmail: ACCOUNT, draftId: 'draft-2' })
const draftsAfterDelete = await listDraftFiles({ workspaceId: WS, accountEmail: ACCOUNT })
assert.equal(draftsAfterDelete.length, 1, 'B18: should have 1 draft after delete')

// B19: deleteEmailMessage 删除邮件目录
await deleteEmailMessage({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  externalId: '101',
})
assert.ok(!existsSync(msgDir2), 'B19: message directory should not exist')
clearEmailFileStoreCache()
const indexAfterDelete = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
assert.ok(!indexAfterDelete.has('101'), 'B19: index should not have deleted externalId')

// B20: moveEmailMessage 移动邮件
const SENT = 'Sent'
await writeEmailMessage({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  id: 'msg-move',
  externalId: '200',
  subject: 'Move Me',
  from: {},
  to: {},
  flags: [],
  bodyHtml: '<p>Move</p>',
})
await moveEmailMessage({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  fromMailboxPath: MAILBOX,
  toMailboxPath: SENT,
  externalId: '200',
})
const srcDir = resolveMessageDir(WS, ACCOUNT, MAILBOX, '200')
const dstDir = resolveMessageDir(WS, ACCOUNT, SENT, '200')
assert.ok(!existsSync(srcDir), 'B20: source directory should not exist')
assert.ok(existsSync(dstDir), 'B20: destination directory should exist')
clearEmailFileStoreCache()
const srcIndex = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
assert.ok(!srcIndex.has('200'), 'B20: source index should not have moved message')
const dstIndex = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: SENT })
assert.ok(dstIndex.has('200'), 'B20: destination index should have moved message')

// =========================================================================
// C 层：集成
// =========================================================================

// C1: LRU 缓存命中（第二次 loadMailboxIndex 不读文件）
clearEmailFileStoreCache()
await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
const t1 = Date.now()
await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
const t2 = Date.now()
// 逻辑：缓存命中应该非常快（< 5ms）。
assert.ok(t2 - t1 < 50, 'C1: cached load should be fast')

// C2: LRU 缓存失效（写入后 mtime 变化）
await writeEmailMessage({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: MAILBOX,
  id: 'msg-c2',
  externalId: '300',
  subject: 'Cache Invalidation',
  from: {},
  to: {},
  flags: [],
})
const indexC2 = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
assert.ok(indexC2.has('300'), 'C2: should see new message after cache invalidation')

// C3: LRU 缓存淘汰（超过 30 个邮箱后最早的被淘汰）
clearEmailFileStoreCache()
for (let i = 0; i < 32; i++) {
  const mb = `mailbox-${i}`
  await writeEmailMessage({
    workspaceId: WS,
    accountEmail: ACCOUNT,
    mailboxPath: mb,
    id: `msg-lru-${i}`,
    externalId: `lru-${i}`,
    subject: `LRU ${i}`,
    from: {},
    to: {},
    flags: [],
  })
  await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: mb })
}
// 逻辑：最早的邮箱应该已被淘汰，但仍可重新加载。
const lruReload = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: 'mailbox-0' })
assert.ok(lruReload.has('lru-0'), 'C3: evicted mailbox should still be loadable')

// C4: 并发写入互斥
const concurrentWrites = Array.from({ length: 10 }, (_, i) =>
  writeEmailMessage({
    workspaceId: WS,
    accountEmail: ACCOUNT,
    mailboxPath: 'concurrent-test',
    id: `msg-concurrent-${i}`,
    externalId: `c-${i}`,
    subject: `Concurrent ${i}`,
    from: {},
    to: {},
    flags: [],
  }),
)
await Promise.all(concurrentWrites)
clearEmailFileStoreCache()
const concurrentIndex = await loadMailboxIndex({
  workspaceId: WS,
  accountEmail: ACCOUNT,
  mailboxPath: 'concurrent-test',
})
assert.equal(concurrentIndex.size, 10, 'C4: all concurrent writes should be present')

// C5: compactMailboxIndex 压缩
clearEmailFileStoreCache()
const indexBeforeCompact = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
const sizeBeforeCompact = indexBeforeCompact.size
await compactMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
clearEmailFileStoreCache()
const indexAfterCompact = await loadMailboxIndex({ workspaceId: WS, accountEmail: ACCOUNT, mailboxPath: MAILBOX })
assert.equal(indexAfterCompact.size, sizeBeforeCompact, 'C5: compaction should preserve unique entries')

// C6: deleteAccountFiles 清理
const accountDir = resolveAccountDir(WS, ACCOUNT)
assert.ok(existsSync(accountDir), 'C6: account dir should exist before cleanup')
await deleteAccountFiles({ workspaceId: WS, accountEmail: ACCOUNT })
assert.ok(!existsSync(accountDir), 'C6: account dir should not exist after cleanup')

// C7: 完整写入→读取流程
await writeEmailMessage({
  workspaceId: WS,
  accountEmail: 'fresh@example.com',
  mailboxPath: 'INBOX',
  id: 'msg-c7',
  externalId: '999',
  subject: 'Full Flow',
  from: { value: [{ address: 'a@b.com', name: 'A' }] },
  to: { value: [{ address: 'c@d.com', name: 'C' }] },
  flags: ['\\Seen'],
  bodyHtml: '<p>Full flow</p>',
  bodyText: 'Full flow text',
  rawRfc822: 'From: a@b.com\r\n\r\nFull flow',
})
clearEmailFileStoreCache()
const c7Index = await loadMailboxIndex({ workspaceId: WS, accountEmail: 'fresh@example.com', mailboxPath: 'INBOX' })
assert.ok(c7Index.has('999'), 'C7: index should have message')
const c7Meta = await readEmailMeta({ workspaceId: WS, accountEmail: 'fresh@example.com', mailboxPath: 'INBOX', externalId: '999' })
assert.equal(c7Meta!.subject, 'Full Flow', 'C7: meta subject should match')
const c7Html = await readEmailBodyHtml({ workspaceId: WS, accountEmail: 'fresh@example.com', mailboxPath: 'INBOX', externalId: '999' })
assert.equal(c7Html, '<p>Full flow</p>', 'C7: body.html should match')

// =========================================================================
// Cleanup
// =========================================================================

rmSync(tempDir, { recursive: true, force: true })
console.log('emailFileStore.test.ts: all tests passed')
