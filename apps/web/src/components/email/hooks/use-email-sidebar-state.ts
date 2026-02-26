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
import { useMutation } from '@tanstack/react-query'

import { trpc } from '@/utils/trpc'
import {
  MESSAGE_PAGE_SIZE,
  type UnifiedMailboxScope,
  type MailboxNode,
} from '../email-types'
import { moveItem, normalizeEmail } from '../email-utils'
import type {
  EmailCoreState,
  MailboxHoverInput,
  MailboxDropInput,
  MailboxOrderKeyInput,
} from './use-email-core-state'
import type { SidebarState } from '../use-email-page-state'

function getMailboxOrderKey(accountEmail: string, parentPath: string | null) {
  return `${normalizeEmail(accountEmail)}::${parentPath ?? '__root__'}`
}

export function useEmailSidebarState(core: EmailCoreState): SidebarState {
  const {
    workspaceId,
    queryClient,
    accounts,
    accountsQuery,
    activeAccount,
    activeView,
    setActiveView,
    activeMailbox,
    setActiveAccountEmail,
    setActiveMailbox,
    setActiveMessageId,
    setSearchKeyword,
    setSelectedIds,
    unifiedItems,
    accountGroups,
    mailboxUnreadMap,
    expandedAccounts,
    setExpandedAccounts,
    expandedMailboxes,
    setExpandedMailboxes,
    mailboxOrderOverrides,
    setMailboxOrderOverrides,
    dragInsertTarget,
    setDragInsertTarget,
    draggingMailboxId,
    setDraggingMailboxId,
    mailboxDragHoverRef,
    setAddDialogOpen,
  } = core

  const syncMailboxMutation = useMutation(
    trpc.email.syncMailbox.mutationOptions({
      onSuccess: () => {
        if (workspaceId && activeAccount?.emailAddress && activeMailbox) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedMessages.infiniteQueryOptions({
              workspaceId,
              scope: 'mailbox',
              accountEmail: activeAccount.emailAddress,
              mailbox: activeMailbox,
              pageSize: MESSAGE_PAGE_SIZE,
            }).queryKey,
          })
        }
        if (workspaceId && activeAccount?.emailAddress) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxes.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          })
        }
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
        }
      },
    }),
  )

  const syncMailboxesMutation = useMutation(
    trpc.email.syncMailboxes.mutationOptions({
      onSuccess: () => {
        if (workspaceId && activeAccount?.emailAddress) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxes.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          })
        }
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
        }
      },
    }),
  )

  const removeAccountMutation = useMutation(
    trpc.email.removeAccount.mutationOptions({
      onSuccess: () => {
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({ queryKey: trpc.email.listUnifiedMessages.pathKey() })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
          })
        }
        setActiveAccountEmail(null)
        setActiveMailbox(null)
      },
    }),
  )

  const updateMailboxSortsMutation = useMutation(
    trpc.email.updateMailboxSorts.mutationOptions({
      onSuccess: (_data, variables) => {
        if (!workspaceId) return
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxes.queryOptions({
            workspaceId,
            accountEmail: variables.accountEmail,
          }).queryKey,
        })
        const key = getMailboxOrderKey(variables.accountEmail, variables.parentPath ?? null)
        setMailboxOrderOverrides((prev) => {
          if (!prev[key]) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      },
    }),
  )

  function handleSelectUnifiedView(scope: UnifiedMailboxScope, label: string) {
    setActiveView({ scope, label })
    setActiveAccountEmail(null)
    setActiveMailbox(null)
    setSearchKeyword('')
    setActiveMessageId(null)
    setSelectedIds(new Set())
  }

  function handleSelectMailbox(accountEmail: string, mailboxPath: string, label: string) {
    setActiveView({ scope: 'mailbox', accountEmail, mailbox: mailboxPath, label })
    setActiveAccountEmail(normalizeEmail(accountEmail))
    setActiveMailbox(mailboxPath)
    setSearchKeyword('')
    setActiveMessageId(null)
    setSelectedIds(new Set())
  }

  function handleToggleAccount(accountEmail: string) {
    const key = normalizeEmail(accountEmail)
    setExpandedAccounts((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleToggleMailboxExpand(accountEmail: string, mailboxPath: string) {
    const key = `${normalizeEmail(accountEmail)}::${mailboxPath}`
    setExpandedMailboxes((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))
  }

  function handleSyncMailbox() {
    if (!workspaceId || !activeAccount?.emailAddress) return
    syncMailboxesMutation.mutate({ workspaceId, accountEmail: activeAccount.emailAddress })
    if (activeMailbox) {
      syncMailboxMutation.mutate({
        workspaceId,
        accountEmail: activeAccount.emailAddress,
        mailbox: activeMailbox,
      })
    }
  }

  function handleRemoveAccount(emailAddress: string) {
    if (!workspaceId) return
    removeAccountMutation.mutate({ workspaceId, emailAddress })
  }

  function resolveOrderedMailboxNodes(
    accountEmail: string,
    parentPath: string | null,
    nodes: MailboxNode[],
  ) {
    const key = getMailboxOrderKey(accountEmail, parentPath)
    const order = mailboxOrderOverrides[key]
    if (!order?.length) return nodes
    const byId = new Map(nodes.map((node) => [node.path, node]))
    const ordered: MailboxNode[] = []
    order.forEach((id) => {
      const node = byId.get(id)
      if (node) ordered.push(node)
    })
    nodes.forEach((node) => {
      if (!order.includes(node.path)) ordered.push(node)
    })
    return ordered
  }

  function handleHoverMailbox(input: MailboxHoverInput) {
    const key = getMailboxOrderKey(input.accountEmail, input.parentPath)
    const now = Date.now()
    const last = mailboxDragHoverRef.current
    if (
      last &&
      last.key === key &&
      last.id === input.overId &&
      last.position === input.position &&
      now - last.ts < 80
    ) return
    mailboxDragHoverRef.current = { key, id: input.overId, position: input.position, ts: now }
    setDragInsertTarget({
      accountEmail: input.accountEmail,
      parentPath: input.parentPath,
      mailboxPath: input.overId,
      position: input.position,
    })
  }

  function handleClearHover(input: MailboxOrderKeyInput) {
    const key = getMailboxOrderKey(input.accountEmail, input.parentPath)
    if (mailboxDragHoverRef.current?.key === key) mailboxDragHoverRef.current = null
    setDragInsertTarget(null)
  }

  function handleCommitMailboxOrder(input: {
    accountEmail: string
    parentPath: string | null
    orderedNodes: MailboxNode[]
  }) {
    if (!workspaceId) return
    const sorts = input.orderedNodes.map((node, index) => ({
      mailboxPath: node.path,
      sort: index * 10,
    }))
    updateMailboxSortsMutation.mutate({
      workspaceId,
      accountEmail: input.accountEmail,
      parentPath: input.parentPath,
      sorts,
    })
  }

  function handleDropMailboxOrder(input: MailboxDropInput) {
    const { accountEmail, parentPath, activeId, overId, position, orderedIds, orderedNodes } = input
    const fromIndex = orderedIds.indexOf(activeId)
    let toIndex = orderedIds.indexOf(overId)
    if (fromIndex < 0 || toIndex < 0) return
    if (position === 'after') toIndex += 1
    if (toIndex > orderedIds.length) toIndex = orderedIds.length
    const nextOrder = moveItem(orderedIds, fromIndex, toIndex)
    setMailboxOrderOverrides((prev) => ({
      ...prev,
      [getMailboxOrderKey(accountEmail, parentPath)]: nextOrder,
    }))
    const orderedNextNodes = nextOrder
      .map((id) => orderedNodes.find((node) => node.path === id))
      .filter((node): node is MailboxNode => Boolean(node))
    handleCommitMailboxOrder({ accountEmail, parentPath, orderedNodes: orderedNextNodes })
    handleClearHover({ accountEmail, parentPath })
  }

  const canSyncMailbox = Boolean(activeAccount?.emailAddress)
  const isSyncingMailbox = syncMailboxMutation.isPending || syncMailboxesMutation.isPending

  return {
    unifiedItems,
    activeView,
    accounts,
    accountsLoading: accountsQuery.isLoading,
    accountGroups,
    expandedAccounts,
    expandedMailboxes,
    dragInsertTarget,
    draggingMailboxId,
    mailboxUnreadMap,
    canSyncMailbox,
    isSyncingMailbox,
    onSelectUnifiedView: handleSelectUnifiedView,
    onSelectMailbox: handleSelectMailbox,
    onToggleAccount: handleToggleAccount,
    onToggleMailboxExpand: handleToggleMailboxExpand,
    onOpenAddAccount: () => setAddDialogOpen(true),
    onRemoveAccount: handleRemoveAccount,
    onSyncMailbox: handleSyncMailbox,
    onHoverMailbox: handleHoverMailbox,
    onClearHover: handleClearHover,
    onDropMailboxOrder: handleDropMailboxOrder,
    onDragStartMailbox: (mailboxId) => setDraggingMailboxId(mailboxId),
    onDragEndMailbox: () => setDraggingMailboxId(null),
    resolveOrderedMailboxNodes,
  }
}
