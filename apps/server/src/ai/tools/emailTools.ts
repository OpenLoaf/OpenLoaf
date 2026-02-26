import { tool, zodSchema } from 'ai'
import { createContext } from '@openloaf/api/context'
import {
  emailMutateToolDef,
  emailQueryToolDef,
} from '@openloaf/api/types/tools/email'
import { emailRouterImplementation } from '@/routers/email'
import { getWorkspaceId } from '@/ai/shared/context/requestContext'

// ---------------------------------------------------------------------------
// Slim view types — 精简返回给 LLM 的数据
// ---------------------------------------------------------------------------

type AccountView = {
  emailAddress: string
  label: string | undefined
}

type MailboxView = {
  path: string
  name: string
}

type MessageSummaryView = {
  id: string
  accountEmail: string
  mailbox: string
  from: string
  subject: string
  preview: string
  time: string | undefined
  unread: boolean
  hasAttachments: boolean
}

type MessageDetailView = {
  id: string
  accountEmail: string
  mailbox: string
  subject: string | undefined
  from: string[]
  to: string[]
  cc: string[]
  date: string | undefined
  bodyText: string | undefined
  attachments: { filename?: string; contentType?: string }[]
  flags: string[]
}

type UnreadStatsView = {
  allInboxes: number
  flagged: number
  drafts: number
  sent: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWorkspaceId(): string {
  const wid = getWorkspaceId()
  if (!wid) throw new Error('workspaceId is required.')
  return wid
}

async function createEmailCaller() {
  const ctx = await createContext({ context: {} as any })
  return emailRouterImplementation.createCaller(ctx)
}

function toAccountView(row: any): AccountView {
  return { emailAddress: row.emailAddress, label: row.label }
}

function toMailboxView(row: any): MailboxView {
  return { path: row.path, name: row.name }
}

function toMessageSummaryView(row: any): MessageSummaryView {
  return {
    id: row.id,
    accountEmail: row.accountEmail,
    mailbox: row.mailbox,
    from: row.from,
    subject: row.subject,
    preview: row.preview,
    time: row.time,
    unread: row.unread,
    hasAttachments: row.hasAttachments,
  }
}

function toMessageDetailView(row: any): MessageDetailView {
  return {
    id: row.id,
    accountEmail: row.accountEmail,
    mailbox: row.mailbox,
    subject: row.subject,
    from: row.from,
    to: row.to,
    cc: row.cc,
    date: row.date,
    bodyText: row.bodyText,
    attachments: (row.attachments ?? []).map((a: any) => ({
      filename: a.filename,
      contentType: a.contentType,
    })),
    flags: row.flags,
  }
}

// ---------------------------------------------------------------------------
// Query execute functions
// ---------------------------------------------------------------------------

async function executeListAccounts() {
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const accounts = await caller.listAccounts({ workspaceId })
  return { ok: true, data: { mode: 'list-accounts', accounts: accounts.map(toAccountView) } }
}

async function executeListMailboxes(accountEmail?: string) {
  if (!accountEmail) throw new Error('accountEmail is required for list-mailboxes.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const mailboxes = await caller.listMailboxes({ workspaceId, accountEmail })
  return { ok: true, data: { mode: 'list-mailboxes', mailboxes: mailboxes.map(toMailboxView) } }
}

async function executeListMessages(input: {
  accountEmail?: string
  mailbox?: string
  cursor?: string
  pageSize?: number
}) {
  if (!input.accountEmail) throw new Error('accountEmail is required for list-messages.')
  if (!input.mailbox) throw new Error('mailbox is required for list-messages.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const page = await caller.listMessages({
    workspaceId,
    accountEmail: input.accountEmail,
    mailbox: input.mailbox,
    cursor: input.cursor ?? null,
    pageSize: input.pageSize ?? 10,
  })
  return {
    ok: true,
    data: {
      mode: 'list-messages',
      items: page.items.map(toMessageSummaryView),
      nextCursor: page.nextCursor,
    },
  }
}

async function executeListUnified(input: {
  scope?: string
  accountEmail?: string
  mailbox?: string
  cursor?: string
  pageSize?: number
}) {
  if (!input.scope) throw new Error('scope is required for list-unified.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const page = await caller.listUnifiedMessages({
    workspaceId,
    scope: input.scope as any,
    accountEmail: input.accountEmail,
    mailbox: input.mailbox,
    cursor: input.cursor ?? null,
    pageSize: input.pageSize ?? 10,
  })
  return {
    ok: true,
    data: {
      mode: 'list-unified',
      items: page.items.map(toMessageSummaryView),
      nextCursor: page.nextCursor,
    },
  }
}

async function executeGetMessage(messageId?: string) {
  if (!messageId) throw new Error('messageId is required for get-message.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const msg = await caller.getMessage({ workspaceId, id: messageId })
  return { ok: true, data: { mode: 'get-message', message: toMessageDetailView(msg) } }
}

async function executeSearch(input: {
  accountEmail?: string
  query?: string
  pageSize?: number
}) {
  if (!input.accountEmail) throw new Error('accountEmail is required for search.')
  if (!input.query) throw new Error('query is required for search.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const page = await caller.searchMessages({
    workspaceId,
    accountEmail: input.accountEmail,
    query: input.query,
    pageSize: input.pageSize ?? 10,
  })
  return {
    ok: true,
    data: {
      mode: 'search',
      items: page.items.map(toMessageSummaryView),
      nextCursor: page.nextCursor,
    },
  }
}

async function executeUnreadStats() {
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const stats = await caller.listUnifiedUnreadStats({ workspaceId })
  const view: UnreadStatsView = {
    allInboxes: stats.allInboxes,
    flagged: stats.flagged,
    drafts: stats.drafts,
    sent: stats.sent,
  }
  return { ok: true, data: { mode: 'unread-stats', stats: view } }
}

// ---------------------------------------------------------------------------
// Mutate execute functions
// ---------------------------------------------------------------------------

async function executeSend(input: any) {
  if (!input.accountEmail) throw new Error('accountEmail is required for send.')
  if (!input.to?.length) throw new Error('to is required for send.')
  if (!input.subject) throw new Error('subject is required for send.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  const result = await caller.sendMessage({
    workspaceId,
    accountEmail: input.accountEmail,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    bodyText: input.bodyText,
    inReplyTo: input.inReplyTo,
    references: input.references,
  })
  return { ok: true, data: { action: 'send', messageId: result.messageId } }
}

async function executeMarkRead(messageId?: string) {
  if (!messageId) throw new Error('messageId is required for mark-read.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.markMessageRead({ workspaceId, id: messageId })
  return { ok: true, data: { action: 'mark-read', id: messageId } }
}

async function executeFlag(input: { messageId?: string; flagged?: boolean }) {
  if (!input.messageId) throw new Error('messageId is required for flag.')
  if (input.flagged === undefined) throw new Error('flagged is required for flag.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.setMessageFlagged({ workspaceId, id: input.messageId, flagged: input.flagged })
  return { ok: true, data: { action: 'flag', id: input.messageId, flagged: input.flagged } }
}

async function executeDelete(messageId?: string) {
  if (!messageId) throw new Error('messageId is required for delete.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.deleteMessage({ workspaceId, id: messageId })
  return { ok: true, data: { action: 'delete', id: messageId } }
}

async function executeMove(input: { messageId?: string; toMailbox?: string }) {
  if (!input.messageId) throw new Error('messageId is required for move.')
  if (!input.toMailbox) throw new Error('toMailbox is required for move.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.moveMessage({ workspaceId, id: input.messageId, toMailbox: input.toMailbox })
  return { ok: true, data: { action: 'move', id: input.messageId, toMailbox: input.toMailbox } }
}

async function executeBatchMarkRead(messageIds?: string[]) {
  if (!messageIds?.length) throw new Error('messageIds is required for batch-mark-read.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.batchMarkRead({ workspaceId, ids: messageIds })
  return { ok: true, data: { action: 'batch-mark-read', count: messageIds.length } }
}

async function executeBatchDelete(messageIds?: string[]) {
  if (!messageIds?.length) throw new Error('messageIds is required for batch-delete.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.batchDelete({ workspaceId, ids: messageIds })
  return { ok: true, data: { action: 'batch-delete', count: messageIds.length } }
}

async function executeBatchMove(input: { messageIds?: string[]; toMailbox?: string }) {
  if (!input.messageIds?.length) throw new Error('messageIds is required for batch-move.')
  if (!input.toMailbox) throw new Error('toMailbox is required for batch-move.')
  const caller = await createEmailCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.batchMove({ workspaceId, ids: input.messageIds, toMailbox: input.toMailbox })
  return {
    ok: true,
    data: { action: 'batch-move', count: input.messageIds.length, toMailbox: input.toMailbox },
  }
}

// ---------------------------------------------------------------------------
// Tool exports
// ---------------------------------------------------------------------------

/** Email query tool. */
export const emailQueryTool = tool({
  description: emailQueryToolDef.description,
  inputSchema: zodSchema(emailQueryToolDef.parameters),
  execute: async (input): Promise<any> => {
    const i = input as any
    if (i.mode === 'list-accounts') return executeListAccounts()
    if (i.mode === 'list-mailboxes') return executeListMailboxes(i.accountEmail)
    if (i.mode === 'list-messages') return executeListMessages(i)
    if (i.mode === 'list-unified') return executeListUnified(i)
    if (i.mode === 'get-message') return executeGetMessage(i.messageId)
    if (i.mode === 'search') return executeSearch(i)
    if (i.mode === 'unread-stats') return executeUnreadStats()
    throw new Error(`Unsupported query mode: ${i.mode}`)
  },
})

/** Email mutate tool. */
export const emailMutateTool = tool({
  description: emailMutateToolDef.description,
  inputSchema: zodSchema(emailMutateToolDef.parameters),
  needsApproval: true,
  execute: async (input): Promise<any> => {
    const i = input as any
    if (i.action === 'send') return executeSend(i)
    if (i.action === 'mark-read') return executeMarkRead(i.messageId)
    if (i.action === 'flag') return executeFlag(i)
    if (i.action === 'delete') return executeDelete(i.messageId)
    if (i.action === 'move') return executeMove(i)
    if (i.action === 'batch-mark-read') return executeBatchMarkRead(i.messageIds)
    if (i.action === 'batch-delete') return executeBatchDelete(i.messageIds)
    if (i.action === 'batch-move') return executeBatchMove(i)
    throw new Error(`Unsupported mutate action: ${i.action}`)
  },
})
