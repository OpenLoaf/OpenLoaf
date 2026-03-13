/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import * as React from 'react'
import {
  MailIcon,
  InboxIcon,
  FolderIcon,
  UserIcon,
  PaperclipIcon,
} from 'lucide-react'
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, EmptyView } from './shared/office-tool-utils'
import { cn } from '@/lib/utils'
import type { TFunction } from 'i18next'

type EmailItem = {
  id: string
  from: string
  subject: string
  preview: string
  time?: string
  unread: boolean
  hasAttachments: boolean
  accountEmail?: string
  mailbox?: string
}

type FullMessage = {
  id: string
  subject?: string
  from: string[]
  to: string[]
  cc: string[]
  date?: string
  bodyText?: string
  attachments: Array<{ filename?: string; contentType?: string }>
  flags: string[]
}

/* ───── Accounts ───── */

function AccountsView({ accounts, t }: { accounts: Array<{ emailAddress: string; label?: string }>; t: TFunction }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserIcon className="size-3" />
        <span>{t('tool.email.accounts', { defaultValue: '邮箱账户' })}</span>
        <span className="font-mono">({accounts.length})</span>
      </div>
      <div className="space-y-0.5">
        {accounts.map((a, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs">
            <span className="font-mono text-foreground">{a.emailAddress}</span>
            {a.label && <span className="text-muted-foreground">({a.label})</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── Mailboxes ───── */

function MailboxesView({ mailboxes, t }: { mailboxes: Array<{ path: string; name: string }>; t: TFunction }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FolderIcon className="size-3" />
        <span>{t('tool.email.mailboxes', { defaultValue: '邮箱文件夹' })}</span>
        <span className="font-mono">({mailboxes.length})</span>
      </div>
      <div className="max-h-[200px] space-y-0.5 overflow-auto">
        {mailboxes.map((m, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs">
            <span className="font-mono text-foreground">{m.name}</span>
            <span className="truncate text-muted-foreground">{m.path}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── Message list ───── */

function MessageListView({ items, nextCursor, t }: { items: EmailItem[]; nextCursor?: string; t: TFunction }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <InboxIcon className="size-3" />
        <span>{t('tool.email.messages', { defaultValue: '邮件' })}</span>
        <span className="font-mono">({items.length})</span>
      </div>
      <div className="max-h-[280px] space-y-1 overflow-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded border border-border/30 px-2 py-1.5',
              item.unread && 'border-l-2 border-l-blue-500',
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn('truncate text-xs', item.unread ? 'font-semibold text-foreground' : 'text-foreground')}>
                {item.from}
              </span>
              {item.hasAttachments && <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />}
              {item.time && (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{item.time}</span>
              )}
            </div>
            <div className={cn('truncate text-xs', item.unread ? 'font-medium text-foreground' : 'text-foreground/80')}>
              {item.subject}
            </div>
            {item.preview && (
              <div className="truncate text-[11px] text-muted-foreground">{item.preview}</div>
            )}
          </div>
        ))}
      </div>
      {nextCursor && (
        <div className="text-[11px] text-muted-foreground">
          {t('tool.email.hasMore', { defaultValue: '还有更多邮件…' })}
        </div>
      )}
    </div>
  )
}

/* ───── Full message ───── */

function FullMessageView({ message, t }: { message: FullMessage; t: TFunction }) {
  const [expanded, setExpanded] = React.useState(false)
  const bodyText = message.bodyText ?? ''
  const previewLength = 400
  const truncated = bodyText.length > previewLength

  return (
    <div className="space-y-1.5">
      {message.subject && (
        <div className="text-xs font-medium text-foreground">{message.subject}</div>
      )}
      <div className="space-y-0.5">
        {message.from.length > 0 && (
          <div className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">{t('tool.email.from', { defaultValue: '发件人' })}</span>
            <span className="truncate font-mono text-foreground">{message.from.join(', ')}</span>
          </div>
        )}
        {message.to.length > 0 && (
          <div className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">{t('tool.email.to', { defaultValue: '收件人' })}</span>
            <span className="truncate font-mono text-foreground">{message.to.join(', ')}</span>
          </div>
        )}
        {message.cc.length > 0 && (
          <div className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">CC</span>
            <span className="truncate font-mono text-foreground">{message.cc.join(', ')}</span>
          </div>
        )}
        {message.date && (
          <div className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">{t('tool.email.date', { defaultValue: '日期' })}</span>
            <span className="text-foreground">{message.date}</span>
          </div>
        )}
      </div>
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.attachments.map((att, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <PaperclipIcon className="size-3" />
              {att.filename ?? t('tool.email.attachment', { defaultValue: '附件' })}
            </span>
          ))}
        </div>
      )}
      {bodyText && (
        <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-muted/20 px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
          {expanded ? bodyText : bodyText.slice(0, previewLength)}{truncated && !expanded ? '…' : ''}
        </pre>
      )}
      {truncated && !expanded && (
        <button
          type="button"
          className="text-[11px] text-ol-blue hover:underline"
          onClick={() => setExpanded(true)}
        >
          {t('tool.email.expandBody', { defaultValue: '展开全文' })}
        </button>
      )}
    </div>
  )
}

/* ───── Unread stats ───── */

function UnreadStatsView({ stats, t }: { stats: Record<string, unknown>; t: TFunction }) {
  const entries = [
    { label: t('tool.email.allInboxes', { defaultValue: '所有收件箱' }), value: stats.allInboxes },
    { label: t('tool.email.flagged', { defaultValue: '已标记' }), value: stats.flagged },
    { label: t('tool.email.drafts', { defaultValue: '草稿' }), value: stats.drafts },
    { label: t('tool.email.sent', { defaultValue: '已发送' }), value: stats.sent },
  ].filter((e) => typeof e.value === 'number')

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MailIcon className="size-3" />
        <span>{t('tool.email.unreadStats', { defaultValue: '未读统计' })}</span>
      </div>
      <div className="space-y-0.5">
        {entries.map((e, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">{e.label}</span>
            <span className="font-mono font-medium text-foreground">{String(e.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── Router ───── */

function EmailResultView({ data, t }: { data: Record<string, unknown>; t: TFunction }) {
  const mode = typeof data.mode === 'string' ? data.mode : ''

  if (mode === 'list-accounts' && Array.isArray(data.accounts)) {
    return <AccountsView accounts={data.accounts as Array<{ emailAddress: string; label?: string }>} t={t} />
  }

  if (mode === 'list-mailboxes' && Array.isArray(data.mailboxes)) {
    return <MailboxesView mailboxes={data.mailboxes as Array<{ path: string; name: string }>} t={t} />
  }

  if ((mode === 'list-messages' || mode === 'list-unified' || mode === 'search') && Array.isArray(data.items)) {
    return (
      <MessageListView
        items={data.items as EmailItem[]}
        nextCursor={typeof data.nextCursor === 'string' ? data.nextCursor : undefined}
        t={t}
      />
    )
  }

  if (mode === 'get-message' && data.message && typeof data.message === 'object') {
    return <FullMessageView message={data.message as FullMessage} t={t} />
  }

  if (mode === 'unread-stats' && data.stats && typeof data.stats === 'object') {
    return <UnreadStatsView stats={data.stats as Record<string, unknown>} t={t} />
  }

  return <EmptyView />
}

export default function EmailQueryTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-lg', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.office"
      defaultOpen
    >
      {(ctx) => {
        const { data, isDone, t } = ctx

        if (data && isDone) {
          return <EmailResultView data={data} t={t} />
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
