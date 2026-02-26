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
import type { InfiniteData } from '@tanstack/react-query'

import { trpc } from '@/utils/trpc'
import {
  type ComposeDraft,
  type EmailMessageDetail,
  type EmailMessageSummary,
  type ForwardDraft,
} from '../email-types'
import {
  buildForwardBody,
  buildForwardSubject,
  extractEmailAddress,
  formatDateTime,
  hasEmailFlag,
  isInboxMailboxView,
  isDraftsMailboxView,
  isSentMailboxView,
  normalizeEmail,
} from '../email-utils'
import type { EmailCoreState } from './use-email-core-state'
import type { DetailState } from '../use-email-page-state'

export function useEmailDetailState(core: EmailCoreState): DetailState {
  const {
    workspaceId,
    queryClient,
    accounts,
    activeAccount,
    activeView,
    activeMessageId,
    setActiveMessageId,
    unifiedMessagesQueryKey,
    activeMessage,
    messageDetail,
    messageDetailQuery,
    mailboxesByAccount,
    isForwarding,
    setIsForwarding,
    forwardDraft,
    setForwardDraft,
    composeDraft,
    setComposeDraft,
    flagOverrides,
    setFlagOverrides,
    flagOverridesRef,
    showingRawHtml,
    setShowingRawHtml,
    hasRawHtml,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    draftSaveStatus,
    setDraftSaveStatus,
    draftIdRef,
  } = core

  // ── 计算属性 ──
  const detailSubject = messageDetail?.subject ?? activeMessage?.subject ?? ''
  const detailFrom = messageDetail?.from?.[0] ?? activeMessage?.from ?? ''
  const detailTime = formatDateTime(messageDetail?.date ?? activeMessage?.time ?? '') || '—'
  const detailFlags = messageDetail?.flags ?? []
  const overrideFlagged = activeMessageId ? flagOverrides[activeMessageId] : undefined
  const isFlagged = overrideFlagged ?? hasEmailFlag(detailFlags, 'FLAGGED')
  const detailFromAddress =
    messageDetail?.fromAddress ?? extractEmailAddress(detailFrom) ?? ''
  const isPrivate = messageDetail?.isPrivate ?? activeMessage?.isPrivate ?? false
  const detailTo = messageDetail?.to?.length
    ? messageDetail.to.join('; ')
    : activeMessage?.accountEmail ?? activeAccount?.emailAddress ?? '—'
  const detailCc = messageDetail?.cc?.length ? messageDetail.cc.join('; ') : '—'
  const detailBcc = messageDetail?.bcc?.length ? messageDetail.bcc.join('; ') : '—'
  const hasCc = Boolean(messageDetail?.cc?.length)
  const hasBcc = Boolean(messageDetail?.bcc?.length)
  const shouldShowAttachments =
    messageDetailQuery.isLoading || (messageDetail?.attachments?.length ?? 0) > 0

  const handleToggleRawHtml = React.useCallback(() => {
    setShowingRawHtml((prev) => !prev)
  }, [setShowingRawHtml])

  // ── Mutations ──
  const setFlaggedMutation = useMutation(
    trpc.email.setMessageFlagged.mutationOptions({
      onMutate: async (variables) => {
        if (!workspaceId) return undefined
        const queryKey = trpc.email.getMessage.queryOptions({
          workspaceId,
          id: variables.id,
        }).queryKey
        const unifiedMessagesKey = unifiedMessagesQueryKey
        const unifiedUnreadStatsKey = trpc.email.listUnifiedUnreadStats.queryOptions({
          workspaceId,
        }).queryKey
        const previousUnifiedMessages = unifiedMessagesKey
          ? queryClient.getQueryData<
              InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
            >(unifiedMessagesKey)
          : undefined
        const previousUnifiedUnreadStats = queryClient.getQueryData<{
          allInboxes: number
          flagged: number
          drafts: number
          sent: number
        }>(unifiedUnreadStatsKey)
        const cachedMessage = previousUnifiedMessages?.pages
          .flatMap((page) => page.items)
          .find((item) => item.id === variables.id)
        const shouldAdjustFlaggedUnread = Boolean(cachedMessage?.unread)
        const previousOverride = flagOverridesRef.current[variables.id]
        setFlagOverrides((prev) => ({ ...prev, [variables.id]: variables.flagged }))
        await queryClient.cancelQueries({ queryKey })
        const previous = queryClient.getQueryData<EmailMessageDetail>(queryKey)
        queryClient.setQueryData<EmailMessageDetail | undefined>(queryKey, (old) => {
          if (!old) return old
          const nextFlags = variables.flagged
            ? [...old.flags, '\\Flagged']
            : old.flags.filter((flag) => !hasEmailFlag([flag], 'FLAGGED'))
          return { ...old, flags: nextFlags }
        })
        if (unifiedMessagesKey && previousUnifiedMessages && activeView.scope === 'flagged') {
          queryClient.setQueryData<
            InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
          >(unifiedMessagesKey, (old) => {
            if (!old) return old
            if (variables.flagged) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== variables.id),
              })),
            }
          })
        }
        if (shouldAdjustFlaggedUnread && previousUnifiedUnreadStats) {
          queryClient.setQueryData(unifiedUnreadStatsKey, (old) => {
            if (!old) return old
            return { ...old, flagged: Math.max(0, old.flagged + (variables.flagged ? 1 : -1)) }
          })
        }
        return {
          queryKey,
          previous,
          previousOverride,
          id: variables.id,
          unifiedMessagesKey,
          previousUnifiedMessages,
          unifiedUnreadStatsKey,
          previousUnifiedUnreadStats,
        }
      },
      onError: (_error, _variables, context) => {
        if (!context?.queryKey) return
        queryClient.setQueryData(context.queryKey, context.previous)
        if (context.unifiedMessagesKey) {
          queryClient.setQueryData(context.unifiedMessagesKey, context.previousUnifiedMessages as any)
        }
        if (context.unifiedUnreadStatsKey) {
          queryClient.setQueryData(context.unifiedUnreadStatsKey, context.previousUnifiedUnreadStats)
        }
        if (context?.id) {
          setFlagOverrides((prev) => {
            const next = { ...prev }
            if (context.previousOverride === undefined) delete next[context.id]
            else next[context.id] = context.previousOverride
            return next
          })
        }
      },
      onSettled: (_data, _error, _variables, context) => {
        if (context?.id) {
          setFlagOverrides((prev) => {
            if (!(context.id in prev)) return prev
            const next = { ...prev }
            delete next[context.id]
            return next
          })
        }
        if (!workspaceId) return
        queryClient.invalidateQueries({ queryKey: trpc.email.listUnifiedMessages.pathKey() })
        const targetId = context?.id ?? activeMessageId
        if (targetId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.getMessage.queryOptions({ workspaceId, id: targetId }).queryKey,
          })
        }
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
      },
    }),
  )

  const setPrivateSenderMutation = useMutation(
    trpc.email.setPrivateSender.mutationOptions({
      onSuccess: () => {
        if (!workspaceId || !unifiedMessagesQueryKey) return
        queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
        if (activeMessageId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.getMessage.queryOptions({ workspaceId, id: activeMessageId }).queryKey,
          })
        }
      },
    }),
  )

  const removePrivateSenderMutation = useMutation(
    trpc.email.removePrivateSender.mutationOptions({
      onSuccess: () => {
        if (!workspaceId || !unifiedMessagesQueryKey) return
        queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
        if (activeMessageId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.getMessage.queryOptions({ workspaceId, id: activeMessageId }).queryKey,
          })
        }
      },
    }),
  )

  const sendMessageMutation = useMutation(
    trpc.email.sendMessage.mutationOptions({
      onSuccess: () => {
        setComposeDraft(null)
        setIsForwarding(false)
        setForwardDraft(null)
        if (workspaceId) {
          queryClient.invalidateQueries({ queryKey: trpc.email.listUnifiedMessages.pathKey() })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
        }
      },
    }),
  )

  const deleteMessageMutation = useMutation(
    trpc.email.deleteMessage.mutationOptions({
      onSuccess: () => {
        setActiveMessageId(null)
        if (workspaceId) {
          queryClient.invalidateQueries({ queryKey: trpc.email.listUnifiedMessages.pathKey() })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          })
        }
      },
    }),
  )

  const saveDraftMutation = useMutation(
    trpc.email.saveDraft.mutationOptions({
      onMutate: () => setDraftSaveStatus('saving'),
      onSuccess: (data) => {
        setDraftSaveStatus('saved')
        if (composeDraft && !composeDraft.inReplyTo) {
          setComposeDraft((prev) => (prev ? { ...prev, inReplyTo: data.id } : prev))
        }
        draftIdRef.current = data.id
      },
      onError: () => setDraftSaveStatus('error'),
    }),
  )

  // 逻辑：自动保存草稿（debounce 3 秒）。
  React.useEffect(() => {
    if (!composeDraft || !workspaceId) return
    setDraftSaveStatus('idle')
    const timer = window.setTimeout(() => {
      saveDraftMutation.mutate({
        workspaceId,
        id: draftIdRef.current ?? undefined,
        accountEmail: composeDraft.accountEmail ?? accounts[0]?.emailAddress ?? '',
        mode: composeDraft.mode,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        subject: composeDraft.subject,
        body: composeDraft.body,
        inReplyTo: composeDraft.inReplyTo,
        references: composeDraft.references,
      })
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [composeDraft])

  React.useEffect(() => {
    if (!composeDraft) draftIdRef.current = null
  }, [composeDraft])

  // ── Handlers ──
  function handleToggleFlagged() {
    if (!workspaceId || !activeMessageId) return
    setFlaggedMutation.mutate({ workspaceId, id: activeMessageId, flagged: !isFlagged })
  }

  function handleStartForward() {
    if (!activeMessage) return
    const bodyText = messageDetail?.bodyText || activeMessage.preview || ''
    const nextDraft: ForwardDraft = {
      to: '',
      cc: '',
      bcc: '',
      subject: buildForwardSubject(detailSubject || ''),
      body: buildForwardBody({
        from: detailFrom,
        to: detailTo,
        cc: hasCc ? detailCc : '',
        time: detailTime,
        subject: detailSubject || '—',
        bodyText,
      }),
    }
    setForwardDraft(nextDraft)
    setIsForwarding(true)
  }

  function handleCancelForward() {
    setIsForwarding(false)
    setForwardDraft(null)
  }

  function handleStartReply() {
    if (!activeMessage || !messageDetail) return
    const replyTo = messageDetail.fromAddress ?? detailFrom
    const draft: ComposeDraft = {
      mode: 'reply',
      to: replyTo,
      cc: '',
      bcc: '',
      subject: detailSubject.startsWith('Re:') ? detailSubject : `Re: ${detailSubject}`,
      body: '',
      inReplyTo: messageDetail.id,
      accountEmail: activeMessage.accountEmail,
    }
    setComposeDraft(draft)
    setIsForwarding(true)
  }

  function handleStartReplyAll() {
    if (!activeMessage || !messageDetail) return
    const replyTo = messageDetail.fromAddress ?? detailFrom
    const ccList = [
      ...(messageDetail.to ?? []),
      ...(messageDetail.cc ?? []),
    ].filter((addr) => {
      const normalized = addr.toLowerCase().trim()
      return normalized !== activeMessage.accountEmail.toLowerCase().trim()
        && normalized !== replyTo.toLowerCase().trim()
    })
    const draft: ComposeDraft = {
      mode: 'replyAll',
      to: replyTo,
      cc: ccList.join(', '),
      bcc: '',
      subject: detailSubject.startsWith('Re:') ? detailSubject : `Re: ${detailSubject}`,
      body: '',
      inReplyTo: messageDetail.id,
      accountEmail: activeMessage.accountEmail,
    }
    setComposeDraft(draft)
    setIsForwarding(true)
  }

  function handleStartCompose() {
    const accountEmail = accounts[0]?.emailAddress ?? ''
    const draft: ComposeDraft = {
      mode: 'compose',
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      accountEmail,
    }
    setComposeDraft(draft)
    setIsForwarding(true)
    setActiveMessageId(null)
  }

  function handleCancelCompose() {
    setComposeDraft(null)
    setIsForwarding(false)
    setForwardDraft(null)
  }

  function handleSendMessage() {
    if (!workspaceId) return
    if (composeDraft) {
      const toList = composeDraft.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      if (!toList.length) return
      sendMessageMutation.mutate({
        workspaceId,
        accountEmail: composeDraft.accountEmail ?? accounts[0]?.emailAddress ?? '',
        to: toList,
        cc: composeDraft.cc ? composeDraft.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        bcc: composeDraft.bcc ? composeDraft.bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        subject: composeDraft.subject,
        bodyText: composeDraft.body,
        inReplyTo: composeDraft.inReplyTo,
        references: composeDraft.references,
        attachments: composeDraft.attachments,
      })
      return
    }
    if (forwardDraft && activeMessage) {
      const toList = forwardDraft.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      if (!toList.length) return
      sendMessageMutation.mutate({
        workspaceId,
        accountEmail: activeMessage.accountEmail,
        to: toList,
        cc: forwardDraft.cc ? forwardDraft.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        bcc: forwardDraft.bcc ? forwardDraft.bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        subject: forwardDraft.subject,
        bodyText: forwardDraft.body,
      })
    }
  }

  function handleDeleteMessage() {
    if (!workspaceId || !activeMessageId) return
    setDeleteConfirmOpen(true)
  }

  function handleDeleteConfirmed() {
    if (!workspaceId || !activeMessageId) return
    deleteMessageMutation.mutate({ workspaceId, id: activeMessageId })
    setDeleteConfirmOpen(false)
  }

  function handleSetPrivateSender() {
    if (!workspaceId || !detailFromAddress) return
    setPrivateSenderMutation.mutate({ workspaceId, senderEmail: detailFromAddress })
  }

  function handleRemovePrivateSender() {
    if (!workspaceId || !detailFromAddress) return
    removePrivateSenderMutation.mutate({ workspaceId, senderEmail: detailFromAddress })
  }

  return {
    workspaceId,
    activeMessage,
    isForwarding,
    forwardDraft,
    setForwardDraft,
    composeDraft,
    setComposeDraft,
    isComposing: Boolean(composeDraft),
    isSending: sendMessageMutation.isPending,
    draftSaveStatus,
    detailSubject,
    detailFrom,
    detailTime,
    detailFromAddress,
    detailTo,
    detailCc,
    detailBcc,
    hasCc,
    hasBcc,
    isPrivate,
    isFlagged,
    messageDetail,
    messageDetailLoading: messageDetailQuery.isLoading,
    shouldShowAttachments,
    hasRawHtml,
    showingRawHtml,
    onToggleRawHtml: handleToggleRawHtml,
    onStartForward: handleStartForward,
    onCancelForward: handleCancelForward,
    onToggleFlagged: handleToggleFlagged,
    onSetPrivateSender: handleSetPrivateSender,
    onRemovePrivateSender: handleRemovePrivateSender,
    onStartReply: handleStartReply,
    onStartReplyAll: handleStartReplyAll,
    onStartCompose: handleStartCompose,
    onSendMessage: handleSendMessage,
    onCancelCompose: handleCancelCompose,
    onDeleteMessage: handleDeleteMessage,
    deleteConfirmOpen,
    onDeleteConfirmOpenChange: setDeleteConfirmOpen,
    onDeleteConfirmed: handleDeleteConfirmed,
  }
}
