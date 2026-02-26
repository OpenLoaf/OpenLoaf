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
import {
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
  skipToken,
} from '@tanstack/react-query'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { FileText, Inbox, Send, Star, Trash2 } from 'lucide-react'

import { trpc } from '@/utils/trpc'
import {
  DEFAULT_FORM,
  MESSAGE_PAGE_SIZE,
  type ComposeDraft,
  type EmailAccountFormState,
  type EmailAccountView,
  type EmailMailboxView,
  type EmailMessageDetail,
  type EmailMessageSummary,
  type ForwardDraft,
  type MailboxNode,
  type UnifiedMailboxScope,
  type UnifiedMailboxView,
} from '../email-types'
import {
  buildMailboxTree,
  getMailboxLabel,
  normalizeEmail,
} from '../email-utils'
import {
  type EmailDensity,
  getStoredDensity,
} from '../email-style-system'

// ── 内部辅助类型 ──

export type UnifiedItem = {
  scope: UnifiedMailboxScope
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  count: number
}

export type DragInsertTarget = {
  accountEmail: string
  parentPath: string | null
  mailboxPath: string
  position: 'before' | 'after'
} | null

export type AccountGroup = {
  account: EmailAccountView
  key: string
  mailboxes: EmailMailboxView[]
  mailboxTree: MailboxNode[]
  isLoading: boolean
}

export type MailboxHoverInput = {
  accountEmail: string
  parentPath: string | null
  overId: string
  position: 'before' | 'after'
}

export type MailboxDropInput = {
  accountEmail: string
  parentPath: string | null
  activeId: string
  overId: string
  position: 'before' | 'after'
  orderedIds: string[]
  orderedNodes: MailboxNode[]
}

export type MailboxOrderKeyInput = {
  accountEmail: string
  parentPath: string | null
}

/** 所有子 hook 共享的核心状态。 */
export type EmailCoreState = {
  workspaceId?: string
  queryClient: QueryClient
  // 账号
  accounts: EmailAccountView[]
  hasConfiguredAccounts: boolean
  activeAccount: EmailAccountView | null
  accountsQuery: ReturnType<typeof useQuery>
  // 视图
  activeView: UnifiedMailboxView
  setActiveView: React.Dispatch<React.SetStateAction<UnifiedMailboxView>>
  // 选中
  activeAccountEmail: string | null
  setActiveAccountEmail: React.Dispatch<React.SetStateAction<string | null>>
  activeMailbox: string | null
  setActiveMailbox: React.Dispatch<React.SetStateAction<string | null>>
  activeMessageId: string | null
  setActiveMessageId: React.Dispatch<React.SetStateAction<string | null>>
  // 消息
  unifiedMessagesQueryKey: unknown[] | null
  messagesQuery: ReturnType<typeof useInfiniteQuery>
  messages: EmailMessageSummary[]
  visibleMessages: EmailMessageSummary[]
  activeMessage: EmailMessageSummary | null
  activeMessagesHasNextPage: boolean
  activeMessagesFetchingNextPage: boolean
  activeMessagesFetchNextPage: () => void
  activeMessagePageCount: number
  // 搜索
  searchKeyword: string
  setSearchKeyword: React.Dispatch<React.SetStateAction<string>>
  isServerSearchMode: boolean
  serverSearchQuery: ReturnType<typeof useInfiniteQuery>
  // 多选
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  lastClickedIdRef: React.MutableRefObject<string | null>
  // 邮箱
  mailboxesByAccount: Map<string, EmailMailboxView[]>
  mailboxesQueries: ReturnType<typeof useQueries>
  // 邮件详情
  messageDetail: EmailMessageDetail | undefined
  messageDetailQuery: ReturnType<typeof useQuery>
  // 转发/撰写
  isForwarding: boolean
  setIsForwarding: React.Dispatch<React.SetStateAction<boolean>>
  forwardDraft: ForwardDraft | null
  setForwardDraft: React.Dispatch<React.SetStateAction<ForwardDraft | null>>
  composeDraft: ComposeDraft | null
  setComposeDraft: React.Dispatch<React.SetStateAction<ComposeDraft | null>>
  // 收藏覆盖
  flagOverrides: Record<string, boolean>
  setFlagOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  flagOverridesRef: React.MutableRefObject<Record<string, boolean>>
  // 统一视图
  unifiedItems: UnifiedItem[]
  // 邮箱分组
  accountGroups: AccountGroup[]
  mailboxUnreadMap: Map<string, number>
  // 添加账号
  addDialogOpen: boolean
  setAddDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  formState: EmailAccountFormState
  setFormState: React.Dispatch<React.SetStateAction<EmailAccountFormState>>
  formError: string | null
  setFormError: React.Dispatch<React.SetStateAction<string | null>>
  testStatus: 'idle' | 'checking' | 'ok' | 'error'
  setTestStatus: React.Dispatch<React.SetStateAction<'idle' | 'checking' | 'ok' | 'error'>>
  // 密度
  density: EmailDensity
  handleSetDensity: (d: EmailDensity) => void
  // 原始 HTML
  showingRawHtml: boolean
  setShowingRawHtml: React.Dispatch<React.SetStateAction<boolean>>
  hasRawHtml: boolean
  // 删除确认
  deleteConfirmOpen: boolean
  setDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>
  batchDeleteConfirmOpen: boolean
  setBatchDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>
  // 草稿保存
  draftSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  setDraftSaveStatus: React.Dispatch<React.SetStateAction<'idle' | 'saving' | 'saved' | 'error'>>
  draftIdRef: React.MutableRefObject<string | null>
  // 邮箱排序
  mailboxOrderOverrides: Record<string, string[]>
  setMailboxOrderOverrides: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  dragInsertTarget: DragInsertTarget
  setDragInsertTarget: React.Dispatch<React.SetStateAction<DragInsertTarget>>
  draggingMailboxId: string | null
  setDraggingMailboxId: React.Dispatch<React.SetStateAction<string | null>>
  mailboxDragHoverRef: React.MutableRefObject<{
    key: string
    id: string
    position: 'before' | 'after'
    ts: number
  } | null>
  // refs
  messagesListRef: React.RefObject<HTMLDivElement | null>
  loadMoreRef: React.RefObject<HTMLDivElement | null>
  // 邮箱标签
  activeMailboxLabel: string
  // 展开状态
  expandedAccounts: Record<string, boolean>
  setExpandedAccounts: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  expandedMailboxes: Record<string, boolean>
  setExpandedMailboxes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}

export function useEmailCoreState({ workspaceId }: { workspaceId?: string }): EmailCoreState {
  const queryClient = useQueryClient()

  // ── useState 声明 ──
  const [density, setDensityState] = React.useState<EmailDensity>(getStoredDensity)
  const handleSetDensity = React.useCallback((d: EmailDensity) => {
    setDensityState(d)
    import('../email-style-system').then(({ setStoredDensity }) => setStoredDensity(d))
  }, [])
  const [activeAccountEmail, setActiveAccountEmail] = React.useState<string | null>(null)
  const [activeMailbox, setActiveMailbox] = React.useState<string | null>(null)
  const [activeView, setActiveView] = React.useState<UnifiedMailboxView>({
    scope: 'all-inboxes',
    label: '收件箱',
  })
  const [expandedAccounts, setExpandedAccounts] = React.useState<Record<string, boolean>>({})
  const [expandedMailboxes, setExpandedMailboxes] = React.useState<Record<string, boolean>>({})
  const [mailboxOrderOverrides, setMailboxOrderOverrides] = React.useState<
    Record<string, string[]>
  >({})
  const [dragInsertTarget, setDragInsertTarget] = React.useState<DragInsertTarget>(null)
  const [draggingMailboxId, setDraggingMailboxId] = React.useState<string | null>(null)
  const mailboxDragHoverRef = React.useRef<{
    key: string
    id: string
    position: 'before' | 'after'
    ts: number
  } | null>(null)
  const [searchKeyword, setSearchKeyword] = React.useState('')
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = React.useState('')
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null)
  const [isForwarding, setIsForwarding] = React.useState(false)
  const [forwardDraft, setForwardDraft] = React.useState<ForwardDraft | null>(null)
  const [composeDraft, setComposeDraft] = React.useState<ComposeDraft | null>(null)
  const [flagOverrides, setFlagOverrides] = React.useState<Record<string, boolean>>({})
  const flagOverridesRef = React.useRef<Record<string, boolean>>({})
  const messagesListRef = React.useRef<HTMLDivElement | null>(null)
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const lastClickedIdRef = React.useRef<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [formState, setFormState] = React.useState(DEFAULT_FORM)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [testStatus, setTestStatus] = React.useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [showingRawHtml, setShowingRawHtml] = React.useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = React.useState(false)
  const [draftSaveStatus, setDraftSaveStatus] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const draftIdRef = React.useRef<string | null>(null)

  // ── 工作空间切换重置 ──
  React.useEffect(() => {
    setActiveView({ scope: 'all-inboxes', label: '收件箱' })
    setActiveAccountEmail(null)
    setActiveMailbox(null)
    setSearchKeyword('')
    setDebouncedSearchKeyword('')
    setActiveMessageId(null)
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
    setIsForwarding(false)
    setForwardDraft(null)
    setComposeDraft(null)
  }, [workspaceId])

  React.useEffect(() => {
    flagOverridesRef.current = flagOverrides
  }, [flagOverrides])

  React.useEffect(() => {
    setShowingRawHtml(false)
  }, [activeMessageId])

  React.useEffect(() => {
    setIsForwarding(false)
    setForwardDraft(null)
    setComposeDraft(null)
  }, [activeMessageId])

  // ── 搜索防抖 ──
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword.trim())
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchKeyword])

  // ── 查询 ──
  const accountsQuery = useQuery(
    trpc.email.listAccounts.queryOptions(workspaceId ? { workspaceId } : skipToken),
  )
  const accounts = (accountsQuery.data ?? []) as EmailAccountView[]
  const hasConfiguredAccounts = accounts.length > 0

  const activeAccount = React.useMemo(() => {
    if (!accounts.length || !activeAccountEmail) return null
    return (
      accounts.find(
        (account) => normalizeEmail(account.emailAddress) === activeAccountEmail,
      ) ?? null
    )
  }, [accounts, activeAccountEmail])

  const unifiedMessagesInput = React.useMemo(() => {
    if (!workspaceId || !hasConfiguredAccounts) return null
    if (activeView.scope === 'mailbox') {
      if (!activeView.accountEmail || !activeView.mailbox) return null
      return {
        workspaceId,
        scope: activeView.scope,
        accountEmail: activeView.accountEmail,
        mailbox: activeView.mailbox,
        pageSize: MESSAGE_PAGE_SIZE,
      }
    }
    return { workspaceId, scope: activeView.scope, pageSize: MESSAGE_PAGE_SIZE }
  }, [workspaceId, hasConfiguredAccounts, activeView])

  const messagesQuery = useInfiniteQuery({
    ...trpc.email.listUnifiedMessages.infiniteQueryOptions(
      unifiedMessagesInput ?? skipToken,
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    ),
  })

  const messages = React.useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [messagesQuery.data],
  )

  const unifiedMessagesQueryKey = React.useMemo(() => {
    if (!unifiedMessagesInput) return null
    return trpc.email.listUnifiedMessages.infiniteQueryOptions(unifiedMessagesInput).queryKey
  }, [unifiedMessagesInput])

  const mailboxesQueries = useQueries({
    queries: workspaceId
      ? accounts.map((account) =>
          trpc.email.listMailboxes.queryOptions({
            workspaceId,
            accountEmail: account.emailAddress,
          }),
        )
      : [],
  })

  const mailboxesByAccount = React.useMemo(() => {
    const map = new Map<string, EmailMailboxView[]>()
    accounts.forEach((account, index) => {
      const data = mailboxesQueries[index]?.data ?? []
      map.set(normalizeEmail(account.emailAddress), data as EmailMailboxView[])
    })
    return map
  }, [accounts, mailboxesQueries])

  const mailboxUnreadStatsQuery = useQuery(
    trpc.email.listMailboxUnreadStats.queryOptions(
      workspaceId && hasConfiguredAccounts ? { workspaceId } : skipToken,
    ),
  )
  const mailboxUnreadStats = (mailboxUnreadStatsQuery.data ?? []) as Array<{
    accountEmail: string
    mailboxPath: string
    unreadCount: number
  }>

  const unifiedUnreadStatsQuery = useQuery(
    trpc.email.listUnifiedUnreadStats.queryOptions(
      workspaceId && hasConfiguredAccounts ? { workspaceId } : skipToken,
    ),
  )
  const unifiedUnreadStats = unifiedUnreadStatsQuery.data ?? {
    allInboxes: 0,
    flagged: 0,
    drafts: 0,
    sent: 0,
  }

  const unifiedItems = React.useMemo(
    () => [
      { scope: 'all-inboxes' as const, label: '收件箱', icon: Inbox, count: unifiedUnreadStats.allInboxes },
      { scope: 'flagged' as const, label: '收藏', icon: Star, count: unifiedUnreadStats.flagged },
      { scope: 'drafts' as const, label: '草稿', icon: FileText, count: unifiedUnreadStats.drafts },
      { scope: 'sent' as const, label: '已发送', icon: Send, count: unifiedUnreadStats.sent },
      { scope: 'deleted' as const, label: '已删除', icon: Trash2, count: 0 },
    ],
    [unifiedUnreadStats],
  )

  // ── 服务端搜索 ──
  const serverSearchInput = React.useMemo(() => {
    if (
      activeView.scope !== 'mailbox' ||
      !activeView.accountEmail ||
      !hasConfiguredAccounts ||
      !workspaceId ||
      debouncedSearchKeyword.length < 2
    ) {
      return null
    }
    return {
      workspaceId,
      accountEmail: activeView.accountEmail,
      query: debouncedSearchKeyword,
      pageSize: MESSAGE_PAGE_SIZE,
    }
  }, [activeView, hasConfiguredAccounts, workspaceId, debouncedSearchKeyword])

  const serverSearchQuery = useInfiniteQuery({
    ...trpc.email.searchMessages.infiniteQueryOptions(
      serverSearchInput ?? skipToken,
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    ),
  })

  const serverSearchMessages = React.useMemo(
    () => serverSearchQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [serverSearchQuery.data],
  )
  const isServerSearchMode = Boolean(serverSearchInput)

  const visibleMessages = React.useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return messages
    if (isServerSearchMode && serverSearchQuery.data) {
      return serverSearchMessages as EmailMessageSummary[]
    }
    return messages.filter((message) => {
      const haystack = `${message.from} ${message.subject} ${message.preview}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [messages, searchKeyword, isServerSearchMode, serverSearchQuery.data, serverSearchMessages])

  const activeMessageIdForQuery = React.useMemo(() => {
    if (!activeMessageId || !hasConfiguredAccounts) return null
    return visibleMessages.some((message) => message.id === activeMessageId)
      ? activeMessageId
      : null
  }, [activeMessageId, hasConfiguredAccounts, visibleMessages])

  const messageDetailQuery = useQuery(
    trpc.email.getMessage.queryOptions(
      workspaceId && activeMessageIdForQuery
        ? { workspaceId, id: activeMessageIdForQuery }
        : skipToken,
    ),
  )
  const messageDetail = messageDetailQuery.data as EmailMessageDetail | undefined
  const hasRawHtml = Boolean(messageDetail?.bodyHtmlRaw)

  const activeMessagesHasNextPage = isServerSearchMode
    ? Boolean(serverSearchQuery.hasNextPage)
    : Boolean(messagesQuery.hasNextPage)
  const activeMessagesFetchingNextPage = isServerSearchMode
    ? serverSearchQuery.isFetchingNextPage
    : messagesQuery.isFetchingNextPage
  const activeMessagesFetchNextPage = isServerSearchMode
    ? serverSearchQuery.fetchNextPage
    : messagesQuery.fetchNextPage
  const activeMessagePageCount = isServerSearchMode
    ? (serverSearchQuery.data?.pages.length ?? 0)
    : (messagesQuery.data?.pages.length ?? 0)

  const activeMessage = React.useMemo(() => {
    if (!activeMessageId) return null
    return visibleMessages.find((message) => message.id === activeMessageId) ?? null
  }, [activeMessageId, visibleMessages])

  const mailboxUnreadMap = React.useMemo(() => {
    const map = new Map<string, number>()
    mailboxUnreadStats.forEach((stat) => {
      map.set(`${normalizeEmail(stat.accountEmail)}::${stat.mailboxPath}`, stat.unreadCount)
    })
    return map
  }, [mailboxUnreadStats])

  const accountGroups = React.useMemo(() => {
    return accounts.map((account, index) => {
      const key = normalizeEmail(account.emailAddress)
      const mailboxes = mailboxesByAccount.get(key) ?? []
      const mailboxTree = buildMailboxTree(mailboxes)
      const isLoading = mailboxesQueries[index]?.isLoading ?? false
      return { account, key, mailboxes, mailboxTree, isLoading }
    })
  }, [accounts, mailboxesByAccount, mailboxesQueries])

  const activeMailboxLabel = React.useMemo(() => {
    if (activeView.scope !== 'mailbox' || !activeView.accountEmail || !activeView.mailbox) {
      return activeView.label
    }
    const mailboxes = mailboxesByAccount.get(normalizeEmail(activeView.accountEmail)) ?? []
    const current = mailboxes.find((mailbox) => mailbox.path === activeView.mailbox)
    return current ? getMailboxLabel(current) : activeView.mailbox
  }, [activeView, mailboxesByAccount])

  // ── 自动选中/展开 effects ──
  React.useEffect(() => {
    if (!accounts.length) {
      setActiveAccountEmail(null)
      return
    }
    if (!activeAccountEmail && activeView.scope === 'mailbox') {
      setActiveAccountEmail(normalizeEmail(accounts[0]?.emailAddress ?? ''))
    }
  }, [accounts, activeAccountEmail, activeView.scope])

  React.useEffect(() => {
    if (!accounts.length) {
      setExpandedAccounts({})
      return
    }
    setExpandedAccounts((prev) => {
      const next = { ...prev }
      accounts.forEach((account) => {
        const key = normalizeEmail(account.emailAddress)
        if (next[key] === undefined) next[key] = true
      })
      return next
    })
  }, [accounts])

  React.useEffect(() => {
    setMailboxOrderOverrides((prev) => {
      if (!accounts.length) return {}
      const validKeys = new Set(
        accounts.map((account) => `${normalizeEmail(account.emailAddress)}::`),
      )
      const next: Record<string, string[]> = {}
      Object.entries(prev).forEach(([key, value]) => {
        if ([...validKeys].some((prefix) => key.startsWith(prefix))) {
          next[key] = value
        }
      })
      return next
    })
  }, [accounts])

  React.useEffect(() => {
    if (!visibleMessages.length) {
      setActiveMessageId(null)
      return
    }
    const exists = visibleMessages.some((message) => message.id === activeMessageId)
    if (!exists) {
      setActiveMessageId(visibleMessages[0]?.id ?? null)
    }
  }, [visibleMessages, activeMessageId])

  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const visibleIdSet = new Set(visibleMessages.map((m) => m.id))
      const next = new Set([...prev].filter((id) => visibleIdSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleMessages])

  React.useEffect(() => {
    const target = loadMoreRef.current
    const root = messagesListRef.current
    if (!target) return
    if (!activeMessagesHasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          activeMessagesHasNextPage &&
          !activeMessagesFetchingNextPage
        ) {
          void activeMessagesFetchNextPage()
        }
      },
      { root, rootMargin: '0px 0px 120px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [
    activeMessagesHasNextPage,
    activeMessagesFetchingNextPage,
    activeMessagesFetchNextPage,
    activeMessagePageCount,
  ])

  return {
    workspaceId,
    queryClient,
    accounts,
    hasConfiguredAccounts,
    activeAccount,
    accountsQuery,
    activeView,
    setActiveView,
    activeAccountEmail,
    setActiveAccountEmail,
    activeMailbox,
    setActiveMailbox,
    activeMessageId,
    setActiveMessageId,
    unifiedMessagesQueryKey,
    messagesQuery,
    messages,
    visibleMessages,
    activeMessage,
    activeMessagesHasNextPage,
    activeMessagesFetchingNextPage,
    activeMessagesFetchNextPage,
    activeMessagePageCount,
    searchKeyword,
    setSearchKeyword,
    isServerSearchMode,
    serverSearchQuery,
    selectedIds,
    setSelectedIds,
    lastClickedIdRef,
    mailboxesByAccount,
    mailboxesQueries,
    messageDetail,
    messageDetailQuery,
    isForwarding,
    setIsForwarding,
    forwardDraft,
    setForwardDraft,
    composeDraft,
    setComposeDraft,
    flagOverrides,
    setFlagOverrides,
    flagOverridesRef,
    unifiedItems,
    accountGroups,
    mailboxUnreadMap,
    addDialogOpen,
    setAddDialogOpen,
    formState,
    setFormState,
    formError,
    setFormError,
    testStatus,
    setTestStatus,
    density,
    handleSetDensity,
    showingRawHtml,
    setShowingRawHtml,
    hasRawHtml,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    batchDeleteConfirmOpen,
    setBatchDeleteConfirmOpen,
    draftSaveStatus,
    setDraftSaveStatus,
    draftIdRef,
    mailboxOrderOverrides,
    setMailboxOrderOverrides,
    dragInsertTarget,
    setDragInsertTarget,
    draggingMailboxId,
    setDraggingMailboxId,
    mailboxDragHoverRef,
    messagesListRef,
    loadMoreRef,
    activeMailboxLabel,
    expandedAccounts,
    setExpandedAccounts,
    expandedMailboxes,
    setExpandedMailboxes,
  }
}
