/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport * as React from 'react'

import { trpcClient } from '@/utils/trpc'
import { trpc } from '@/utils/trpc'
import { queryClient } from '@/utils/trpc'
import type {
  ComposeDraft,
  EmailAccountFormState,
  EmailAccountView,
  EmailMailboxView,
  EmailMessageDetail,
  EmailMessageSummary,
  ForwardDraft,
  MailboxNode,
  UnifiedMailboxScope,
  UnifiedMailboxView,
} from './email-types'
import type { EmailDensity } from './email-style-system'
import { useEmailCoreState } from './hooks/use-email-core-state'
import { useEmailSidebarState } from './hooks/use-email-sidebar-state'
import { useEmailMessageListState } from './hooks/use-email-message-list-state'
import { useEmailDetailState } from './hooks/use-email-detail-state'
import { useEmailAddDialogState } from './hooks/use-email-add-dialog-state'

// ── 重新导出辅助类型 ──
export type {
  UnifiedItem,
  DragInsertTarget,
  AccountGroup,
  MailboxHoverInput,
  MailboxDropInput,
  MailboxOrderKeyInput,
} from './hooks/use-email-core-state'

export type SidebarState = {
  unifiedItems: import('./hooks/use-email-core-state').UnifiedItem[]
  activeView: UnifiedMailboxView
  accounts: EmailAccountView[]
  accountsLoading: boolean
  accountGroups: import('./hooks/use-email-core-state').AccountGroup[]
  expandedAccounts: Record<string, boolean>
  expandedMailboxes: Record<string, boolean>
  dragInsertTarget: import('./hooks/use-email-core-state').DragInsertTarget
  draggingMailboxId: string | null
  mailboxUnreadMap: Map<string, number>
  canSyncMailbox: boolean
  isSyncingMailbox: boolean
  onSelectUnifiedView: (scope: UnifiedMailboxScope, label: string) => void
  onSelectMailbox: (accountEmail: string, mailboxPath: string, label: string) => void
  onToggleAccount: (accountEmail: string) => void
  onToggleMailboxExpand: (accountEmail: string, mailboxPath: string) => void
  onOpenAddAccount: () => void
  onRemoveAccount: (emailAddress: string) => void
  onSyncMailbox: () => void
  onHoverMailbox: (input: import('./hooks/use-email-core-state').MailboxHoverInput) => void
  onClearHover: (input: import('./hooks/use-email-core-state').MailboxOrderKeyInput) => void
  onDropMailboxOrder: (input: import('./hooks/use-email-core-state').MailboxDropInput) => void
  onDragStartMailbox: (mailboxId: string) => void
  onDragEndMailbox: () => void
  resolveOrderedMailboxNodes: (
    accountEmail: string,
    parentPath: string | null,
    nodes: MailboxNode[],
  ) => MailboxNode[]
}

export type MessageListState = {
  searchKeyword: string
  setSearchKeyword: React.Dispatch<React.SetStateAction<string>>
  activeMailboxLabel: string
  visibleMessages: EmailMessageSummary[]
  activeMessageId: string | null
  onSelectMessage: (message: EmailMessageSummary) => void
  messagesLoading: boolean
  messagesFetchingNextPage: boolean
  hasNextPage: boolean
  messagesListRef: React.RefObject<HTMLDivElement | null>
  loadMoreRef: React.RefObject<HTMLDivElement | null>
  selectedIds: Set<string>
  isAllSelected: boolean
  hasSelection: boolean
  onToggleSelect: (messageId: string, shiftKey?: boolean) => void
  onToggleSelectAll: () => void
  onClearSelection: () => void
  onBatchMarkRead: () => void
  onBatchDelete: () => void
  batchDeleteConfirmOpen: boolean
  onBatchDeleteConfirmOpenChange: (open: boolean) => void
  onBatchDeleteConfirmed: () => void
  onBatchMove: (toMailbox: string) => void
  onBatchArchive: () => void
  batchActionPending: boolean
  onRefresh: () => void
  isRefreshing: boolean
  isSearching: boolean
  density: EmailDensity
  onSetDensity: (density: EmailDensity) => void
}

export type DetailState = {
  workspaceId?: string
  activeMessage: EmailMessageSummary | null
  isForwarding: boolean
  forwardDraft: ForwardDraft | null
  setForwardDraft: React.Dispatch<React.SetStateAction<ForwardDraft | null>>
  composeDraft: ComposeDraft | null
  setComposeDraft: React.Dispatch<React.SetStateAction<ComposeDraft | null>>
  isComposing: boolean
  isSending: boolean
  draftSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  detailSubject: string
  detailFrom: string
  detailTime: string
  detailFromAddress: string
  detailTo: string
  detailCc: string
  detailBcc: string
  hasCc: boolean
  hasBcc: boolean
  isPrivate: boolean
  isFlagged: boolean
  messageDetail?: EmailMessageDetail
  messageDetailLoading: boolean
  shouldShowAttachments: boolean
  hasRawHtml: boolean
  showingRawHtml: boolean
  onToggleRawHtml: () => void
  onStartForward: () => void
  onCancelForward: () => void
  onToggleFlagged: () => void
  onSetPrivateSender: () => void
  onRemovePrivateSender: () => void
  onStartReply: () => void
  onStartReplyAll: () => void
  onStartCompose: () => void
  onSendMessage: () => void
  onCancelCompose: () => void
  onDeleteMessage: () => void
  deleteConfirmOpen: boolean
  onDeleteConfirmOpenChange: (open: boolean) => void
  onDeleteConfirmed: () => void
}

export type AddDialogState = {
  addDialogOpen: boolean
  onAddDialogOpenChange: (open: boolean) => void
  formState: EmailAccountFormState
  setFormState: React.Dispatch<React.SetStateAction<EmailAccountFormState>>
  formError: string | null
  testStatus: 'idle' | 'checking' | 'ok' | 'error'
  onTestConnection: () => void
  onAddAccount: () => void
  addAccountPending: boolean
  onSelectProvider: (providerId: string) => void
  onBackToProviderSelect: () => void
  selectedProviderPasswordLabel: string
  selectedProviderAppPasswordUrl: string | null
  onOAuthLogin: () => void
  onSwitchToPassword: () => void
}

type EmailPageState = {
  sidebar: SidebarState
  messageList: MessageListState
  detail: DetailState
  addDialog: AddDialogState
}

type EmailPageStateParams = {
  workspaceId?: string
}

export function useEmailPageState({ workspaceId }: EmailPageStateParams): EmailPageState {
  const core = useEmailCoreState({ workspaceId })

  // ── IDLE 推送订阅 ──
  React.useEffect(() => {
    if (!workspaceId || !core.hasConfiguredAccounts) return
    const subscription = trpcClient.email.onNewMail.subscribe(
      { workspaceId },
      {
        onData(_event) {
          if (core.unifiedMessagesQueryKey) {
            core.queryClient.invalidateQueries({ queryKey: core.unifiedMessagesQueryKey })
          }
          core.queryClient.invalidateQueries({
            queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
          })
          core.queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
          core.queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
        },
        onError() {},
      },
    )
    return () => { subscription.unsubscribe() }
  }, [workspaceId, core.hasConfiguredAccounts])

  const sidebar = useEmailSidebarState(core)
  const messageList = useEmailMessageListState(core)
  const detail = useEmailDetailState(core)
  const addDialog = useEmailAddDialogState(core)

  return { sidebar, messageList, detail, addDialog }
}
