/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'

import { trpc } from '@/utils/trpc'
import {
  MESSAGE_PAGE_SIZE,
  type EmailMessageSummary,
} from '../email-types'
import { setStoredDensity } from '../email-style-system'
import type { MessageListState } from '../email-page-state-types'
import type { EmailCoreState } from './use-email-core-state'

export function useEmailMessageListState(core: EmailCoreState): MessageListState {
  const {
    queryClient,
    accounts,
    activeAccount,
    activeView,
    activeMailbox,
    activeMessageId,
    setActiveMessageId,
    unifiedMessagesQueryKey,
    visibleMessages,
    activeMessagesHasNextPage,
    activeMessagesFetchingNextPage,
    isServerSearchMode,
    serverSearchQuery,
    searchKeyword,
    setSearchKeyword,
    selectedIds,
    setSelectedIds,
    lastClickedIdRef,
    messagesListRef,
    loadMoreRef,
    activeMailboxLabel,
    density,
    handleSetDensity,
    batchDeleteConfirmOpen,
    setBatchDeleteConfirmOpen,
    messagesQuery,
  } = core

  // ── 标记已读 mutation ──
  const markReadMutation = useMutation(
    trpc.email.markMessageRead.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return undefined
        const previous = queryClient.getQueryData<
          InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
        >(unifiedMessagesQueryKey)
        queryClient.setQueryData<
          InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
        >(unifiedMessagesQueryKey, (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === variables.id ? { ...item, unread: false } : item,
              ),
            })),
          }
        })
        return { queryKey: unifiedMessagesQueryKey, previous }
      },
      onError: (_error, _variables, context) => {
        if (!context?.queryKey) return
        queryClient.setQueryData(context.queryKey, context.previous as any)
      },
      onSettled: () => {
        if (!unifiedMessagesQueryKey) return
        queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnreadCount.queryOptions({}).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({}).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({}).queryKey,
        })
      },
    }),
  )

  // ── 批量操作 mutations ──
  const batchMarkReadMutation = useMutation(
    trpc.email.batchMarkRead.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return
        queryClient.setQueryData<
          InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
        >(unifiedMessagesQueryKey, (old) => {
          if (!old) return old
          const idSet = new Set(variables.ids)
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                idSet.has(item.id) ? { ...item, unread: false } : item,
              ),
            })),
          }
        })
      },
      onSettled: () => {
        handleClearSelection()
        if (unifiedMessagesQueryKey) {
          queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
        }
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnreadCount.queryOptions({}).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({}).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({}).queryKey,
        })
      },
    }),
  )

  const batchDeleteMutation = useMutation(
    trpc.email.batchDelete.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return
        queryClient.setQueryData<
          InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
        >(unifiedMessagesQueryKey, (old) => {
          if (!old) return old
          const idSet = new Set(variables.ids)
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => !idSet.has(item.id)),
            })),
          }
        })
      },
      onSettled: () => {
        handleClearSelection()
        setActiveMessageId(null)
        queryClient.invalidateQueries({ queryKey: trpc.email.listUnifiedMessages.pathKey() })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({}).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({}).queryKey,
        })
      },
    }),
  )

  const batchMoveMutation = useMutation(
    trpc.email.batchMove.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return
        queryClient.setQueryData<
          InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
        >(unifiedMessagesQueryKey, (old) => {
          if (!old) return old
          const idSet = new Set(variables.ids)
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => !idSet.has(item.id)),
            })),
          }
        })
      },
      onSettled: () => {
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: trpc.email.listUnifiedMessages.pathKey() })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({}).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({}).queryKey,
        })
      },
    }),
  )

  const syncMailboxMutation = useMutation(trpc.email.syncMailbox.mutationOptions({}))
  const syncMailboxesMutation = useMutation(trpc.email.syncMailboxes.mutationOptions({}))

  function handleSelectMessage(message: EmailMessageSummary) {
    setActiveMessageId(message.id)
    if (message.unread) {
      markReadMutation.mutate({ id: message.id })
    }
  }

  function handleToggleSelect(messageId: string, shiftKey?: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdRef.current) {
        const ids = visibleMessages.map((m) => m.id)
        const fromIdx = ids.indexOf(lastClickedIdRef.current)
        const toIdx = ids.indexOf(messageId)
        if (fromIdx >= 0 && toIdx >= 0) {
          const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
          for (let i = start; i <= end; i++) next.add(ids[i]!)
        }
      } else if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      lastClickedIdRef.current = messageId
      return next
    })
  }

  function handleToggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === visibleMessages.length && visibleMessages.length > 0) return new Set()
      return new Set(visibleMessages.map((m) => m.id))
    })
  }

  function handleClearSelection() {
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
  }

  function handleBatchMarkRead() {
    if (selectedIds.size === 0) return
    batchMarkReadMutation.mutate({ ids: [...selectedIds] })
  }

  function handleBatchDelete() {
    if (selectedIds.size === 0) return
    setBatchDeleteConfirmOpen(true)
  }

  function handleBatchDeleteConfirmed() {
    if (selectedIds.size === 0) return
    batchDeleteMutation.mutate({ ids: [...selectedIds] })
    setBatchDeleteConfirmOpen(false)
  }

  function handleBatchMove(toMailbox: string) {
    if (selectedIds.size === 0) return
    batchMoveMutation.mutate({ ids: [...selectedIds], toMailbox })
  }

  function handleBatchArchive() {
    handleBatchMove('Archive')
  }

  function handleRefreshMessages() {
    for (const account of accounts) {
      syncMailboxesMutation.mutate({ accountEmail: account.emailAddress })
    }
    if (activeView.scope === 'mailbox' && activeView.accountEmail && activeView.mailbox) {
      syncMailboxMutation.mutate({
        accountEmail: activeView.accountEmail,
        mailbox: activeView.mailbox,
      })
    } else {
      for (const account of accounts) {
        syncMailboxMutation.mutate({
          accountEmail: account.emailAddress,
          mailbox: 'INBOX',
        })
      }
    }
    if (unifiedMessagesQueryKey) {
      queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
    }
    queryClient.invalidateQueries({ queryKey: trpc.email.searchMessages.pathKey() })
    for (const account of accounts) {
      queryClient.invalidateQueries({
        queryKey: trpc.email.listMailboxes.queryOptions({
          accountEmail: account.emailAddress,
        }).queryKey,
      })
    }
    queryClient.invalidateQueries({
      queryKey: trpc.email.listUnreadCount.queryOptions({}).queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({}).queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.email.listMailboxUnreadStats.queryOptions({}).queryKey,
    })
  }

  const batchActionPending =
    batchMarkReadMutation.isPending ||
    batchDeleteMutation.isPending ||
    batchMoveMutation.isPending
  const isRefreshing = syncMailboxMutation.isPending
  const isSearching =
    isServerSearchMode && serverSearchQuery.isFetching && !serverSearchQuery.isFetchingNextPage
  const hasSelection = selectedIds.size > 0
  const isAllSelected = visibleMessages.length > 0 && selectedIds.size === visibleMessages.length

  return {
    searchKeyword,
    setSearchKeyword,
    activeMailboxLabel,
    visibleMessages,
    activeMessageId,
    onSelectMessage: handleSelectMessage,
    messagesLoading: isServerSearchMode ? serverSearchQuery.isLoading : messagesQuery.isLoading,
    messagesFetchingNextPage: activeMessagesFetchingNextPage,
    hasNextPage: activeMessagesHasNextPage,
    messagesListRef,
    loadMoreRef,
    selectedIds,
    isAllSelected,
    hasSelection,
    onToggleSelect: handleToggleSelect,
    onToggleSelectAll: handleToggleSelectAll,
    onClearSelection: handleClearSelection,
    onBatchMarkRead: handleBatchMarkRead,
    onBatchDelete: handleBatchDelete,
    batchDeleteConfirmOpen,
    onBatchDeleteConfirmOpenChange: setBatchDeleteConfirmOpen,
    onBatchDeleteConfirmed: handleBatchDeleteConfirmed,
    onBatchMove: handleBatchMove,
    onBatchArchive: handleBatchArchive,
    batchActionPending,
    onRefresh: handleRefreshMessages,
    isRefreshing,
    isSearching,
    density,
    onSetDensity: handleSetDensity,
  }
}
