/**
 * 邮件模块用户流程集成测试。
 * 使用 renderHook + mocked tRPC 测试完整用户操作流程。
 */
import * as React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { EmailMessageSummary } from '../email-types'
import { createMockMessage, createMockAccount } from './email-test-utils'

// ── Mock tRPC ──

const mockMutationFns: Record<string, ReturnType<typeof vi.fn>> = {}

function getMockMutationFn(name: string) {
  if (!mockMutationFns[name]) {
    mockMutationFns[name] = vi.fn().mockResolvedValue({})
  }
  return mockMutationFns[name]!
}

// 逻辑：用 Proxy 模拟 trpc.email.xxx 的链式调用
const emailProxy = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return {
        mutationOptions: (opts: Record<string, unknown> = {}) => ({
          mutationFn: getMockMutationFn(prop),
          ...opts,
        }),
        queryOptions: (input: unknown) => ({
          queryKey: ['email', prop, input],
          queryFn: vi.fn().mockResolvedValue(undefined),
        }),
        infiniteQueryOptions: (input: unknown, opts?: Record<string, unknown>) => ({
          queryKey: ['email', prop, 'infinite', input],
          queryFn: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
          initialPageParam: undefined,
          getNextPageParam: () => undefined,
          ...opts,
        }),
        pathKey: () => ['email', prop],
      }
    },
  },
)

vi.mock('@/utils/trpc', () => {
  const trpcProxy = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'email') return emailProxy
        return emailProxy
      },
    },
  )
  return {
    trpc: trpcProxy,
    queryClient: new QueryClient(),
  }
})

import { useEmailMessageListState } from '../hooks/use-email-message-list-state'
import type { EmailCoreState } from '../hooks/use-email-core-state'

// ── 测试工具 ──

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

type PageData = InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>

function seedMessages(
  queryClient: QueryClient,
  queryKey: unknown[],
  messages: EmailMessageSummary[],
) {
  const data: PageData = {
    pages: [{ items: messages, nextCursor: null }],
    pageParams: [undefined],
  }
  queryClient.setQueryData(queryKey, data)
}

function getMessages(queryClient: QueryClient, queryKey: unknown[]): EmailMessageSummary[] {
  const data = queryClient.getQueryData<PageData>(queryKey)
  return data?.pages.flatMap((p) => p.items) ?? []
}

function createMockCoreState(
  overrides: Partial<EmailCoreState> = {},
): EmailCoreState {
  const queryClient = overrides.queryClient ?? createTestQueryClient()
  const messages = (overrides.visibleMessages ?? []) as EmailMessageSummary[]

  return {
    workspaceId: 'ws-1',
    queryClient,
    accounts: [createMockAccount()],
    hasConfiguredAccounts: true,
    activeAccount: createMockAccount(),
    accountsQuery: {} as any,
    activeView: { scope: 'all-inboxes', label: '收件箱' },
    setActiveView: vi.fn(),
    activeAccountEmail: 'test@example.com',
    setActiveAccountEmail: vi.fn(),
    activeMailbox: 'INBOX',
    setActiveMailbox: vi.fn(),
    activeMessageId: null,
    setActiveMessageId: vi.fn(),
    unifiedMessagesQueryKey: ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }],
    messagesQuery: { isLoading: false } as any,
    messages,
    visibleMessages: messages,
    activeMessage: null,
    activeMessagesHasNextPage: false,
    activeMessagesFetchingNextPage: false,
    activeMessagesFetchNextPage: vi.fn(),
    activeMessagePageCount: 1,
    searchKeyword: '',
    setSearchKeyword: vi.fn(),
    isServerSearchMode: false,
    serverSearchQuery: { isLoading: false, isFetching: false, isFetchingNextPage: false } as any,
    selectedIds: new Set<string>(),
    setSelectedIds: vi.fn(),
    lastClickedIdRef: { current: null },
    mailboxesByAccount: new Map(),
    mailboxesQueries: [] as any,
    messageDetail: undefined,
    messageDetailQuery: {} as any,
    isForwarding: false,
    setIsForwarding: vi.fn(),
    forwardDraft: null,
    setForwardDraft: vi.fn(),
    composeDraft: null,
    setComposeDraft: vi.fn(),
    flagOverrides: {},
    setFlagOverrides: vi.fn(),
    flagOverridesRef: { current: {} },
    unifiedItems: [],
    accountGroups: [],
    mailboxUnreadMap: new Map(),
    addDialogOpen: false,
    setAddDialogOpen: vi.fn(),
    formState: {} as any,
    setFormState: vi.fn(),
    formError: null,
    setFormError: vi.fn(),
    testStatus: 'idle',
    setTestStatus: vi.fn(),
    density: 'default',
    handleSetDensity: vi.fn(),
    showingRawHtml: false,
    setShowingRawHtml: vi.fn(),
    hasRawHtml: false,
    deleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    batchDeleteConfirmOpen: false,
    setBatchDeleteConfirmOpen: vi.fn(),
    draftSaveStatus: 'idle',
    setDraftSaveStatus: vi.fn(),
    draftIdRef: { current: null },
    mailboxOrderOverrides: {},
    setMailboxOrderOverrides: vi.fn(),
    dragInsertTarget: null,
    setDragInsertTarget: vi.fn(),
    draggingMailboxId: null,
    setDraggingMailboxId: vi.fn(),
    mailboxDragHoverRef: { current: null },
    messagesListRef: { current: null },
    loadMoreRef: { current: null },
    activeMailboxLabel: '收件箱',
    expandedAccounts: {},
    setExpandedAccounts: vi.fn(),
    expandedMailboxes: {},
    setExpandedMailboxes: vi.fn(),
    ...overrides,
  } as EmailCoreState
}

function renderMessageListHook(core: EmailCoreState) {
  const queryClient = core.queryClient
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useEmailMessageListState(core), { wrapper })
}

// ── 测试数据 ──

const mockMsg1 = createMockMessage({ id: 'msg-1', unread: true, subject: 'Hello' })
const mockMsg2 = createMockMessage({ id: 'msg-2', unread: true, subject: 'World' })
const mockMsg3 = createMockMessage({ id: 'msg-3', unread: false, subject: 'Test' })

// ── 测试 ──

beforeEach(() => {
  Object.values(mockMutationFns).forEach((fn) => fn.mockClear())
})

describe('选择操作', () => {
  it('单选切换', () => {
    let selectedIds = new Set<string>()
    const setSelectedIds = vi.fn((updater: any) => {
      selectedIds = typeof updater === 'function' ? updater(selectedIds) : updater
    })
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2, mockMsg3],
      selectedIds,
      setSelectedIds,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onToggleSelect('msg-1'))
    expect(setSelectedIds).toHaveBeenCalled()
    // 逻辑：调用 setSelectedIds 后，updater 应该添加 msg-1
    const updater = setSelectedIds.mock.calls[0]![0]
    const newSet = updater(new Set<string>())
    expect(newSet.has('msg-1')).toBe(true)
  })

  it('单选取消', () => {
    const setSelectedIds = vi.fn()
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
      setSelectedIds,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onToggleSelect('msg-1'))
    const updater = setSelectedIds.mock.calls[0]![0]
    const newSet = updater(new Set(['msg-1']))
    expect(newSet.has('msg-1')).toBe(false)
  })

  it('Shift 多选', () => {
    const lastClickedIdRef = { current: 'msg-1' }
    const setSelectedIds = vi.fn()
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2, mockMsg3],
      selectedIds: new Set(['msg-1']),
      setSelectedIds,
      lastClickedIdRef,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onToggleSelect('msg-3', true))
    const updater = setSelectedIds.mock.calls[0]![0]
    const newSet = updater(new Set(['msg-1']))
    expect(newSet.has('msg-1')).toBe(true)
    expect(newSet.has('msg-2')).toBe(true)
    expect(newSet.has('msg-3')).toBe(true)
  })

  it('全选', () => {
    const setSelectedIds = vi.fn()
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2, mockMsg3],
      selectedIds: new Set(),
      setSelectedIds,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onToggleSelectAll())
    const updater = setSelectedIds.mock.calls[0]![0]
    const newSet = updater(new Set())
    expect(newSet.size).toBe(3)
  })

  it('取消全选', () => {
    const setSelectedIds = vi.fn()
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2, mockMsg3],
      selectedIds: new Set(['msg-1', 'msg-2', 'msg-3']),
      setSelectedIds,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onToggleSelectAll())
    const updater = setSelectedIds.mock.calls[0]![0]
    const newSet = updater(new Set(['msg-1', 'msg-2', 'msg-3']))
    expect(newSet.size).toBe(0)
  })

  it('清除选择', () => {
    const setSelectedIds = vi.fn()
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
      setSelectedIds,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onClearSelection())
    expect(setSelectedIds).toHaveBeenCalledWith(expect.any(Set))
  })
})

describe('标记已读', () => {
  it('选中未读邮件时 optimistic update 标记为已读', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1, mockMsg2])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1, mockMsg2],
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onSelectMessage(mockMsg1))
    // 逻辑：optimistic update 应将 msg-1 标记为已读
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.find((m) => m.id === 'msg-1')?.unread).toBe(false)
  })

  it('已读邮件选中时数据不变', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg3])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg3],
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onSelectMessage(mockMsg3))
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.find((m) => m.id === 'msg-3')?.unread).toBe(false)
  })
})

describe('批量标记已读', () => {
  it('批量标记选中邮件为已读 (optimistic update)', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1, mockMsg2, mockMsg3])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1, mockMsg2, mockMsg3],
      selectedIds: new Set(['msg-1', 'msg-2']),
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onBatchMarkRead())
    // 逻辑：optimistic update 应将选中邮件标记为已读
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.find((m) => m.id === 'msg-1')?.unread).toBe(false)
    expect(msgs.find((m) => m.id === 'msg-2')?.unread).toBe(false)
  })

  it('无选中时不调用 mutation', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1],
      selectedIds: new Set(),
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onBatchMarkRead())
    // 逻辑：无选中时数据不变
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.find((m) => m.id === 'msg-1')?.unread).toBe(true)
  })
})

describe('批量删除', () => {
  it('点击删除打开确认对话框', () => {
    const setBatchDeleteConfirmOpen = vi.fn()
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
      setBatchDeleteConfirmOpen,
    })
    const { result } = renderMessageListHook(core)

    act(() => result.current.onBatchDelete())
    expect(setBatchDeleteConfirmOpen).toHaveBeenCalledWith(true)
  })

  it('确认删除后邮件从列表消失 (optimistic update)', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1, mockMsg2, mockMsg3])

    const setBatchDeleteConfirmOpen = vi.fn()
    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1, mockMsg2, mockMsg3],
      selectedIds: new Set(['msg-1', 'msg-2']),
      unifiedMessagesQueryKey: queryKey,
      setBatchDeleteConfirmOpen,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onBatchDeleteConfirmed())
    // 逻辑：optimistic update 应移除被删除的邮件
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.map((m) => m.id)).toEqual(['msg-3'])
    expect(setBatchDeleteConfirmOpen).toHaveBeenCalledWith(false)
  })

  it('无选中时不执行删除', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1],
      selectedIds: new Set(),
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onBatchDeleteConfirmed())
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs).toHaveLength(1)
  })
})

describe('批量移动', () => {
  it('移动到 Archive 后邮件从列表消失 (optimistic update)', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1, mockMsg2])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onBatchMove('Archive'))
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.map((m) => m.id)).toEqual(['msg-2'])
  })

  it('onBatchArchive 快捷方法', async () => {
    const queryClient = createTestQueryClient()
    const queryKey = ['email', 'listUnifiedMessages', 'infinite', { workspaceId: 'ws-1' }]
    seedMessages(queryClient, queryKey, [mockMsg1, mockMsg2])

    const core = createMockCoreState({
      queryClient,
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
      unifiedMessagesQueryKey: queryKey,
    })
    const { result } = renderMessageListHook(core)

    await act(async () => result.current.onBatchArchive())
    const msgs = getMessages(queryClient, queryKey)
    expect(msgs.map((m) => m.id)).toEqual(['msg-2'])
  })
})

describe('搜索', () => {
  it('searchKeyword 通过 core 传递', () => {
    const core = createMockCoreState({ searchKeyword: 'test query' })
    const { result } = renderMessageListHook(core)
    expect(result.current.searchKeyword).toBe('test query')
  })

  it('setSearchKeyword 调用 core 的 setter', () => {
    const setSearchKeyword = vi.fn()
    const core = createMockCoreState({ setSearchKeyword })
    const { result } = renderMessageListHook(core)

    act(() => result.current.setSearchKeyword('new query'))
    expect(setSearchKeyword).toHaveBeenCalledWith('new query')
  })
})

describe('状态标志', () => {
  it('hasSelection 反映选中状态', () => {
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
    })
    const { result } = renderMessageListHook(core)
    expect(result.current.hasSelection).toBe(true)
  })

  it('isAllSelected 全选时为 true', () => {
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1', 'msg-2']),
    })
    const { result } = renderMessageListHook(core)
    expect(result.current.isAllSelected).toBe(true)
  })

  it('isAllSelected 部分选中时为 false', () => {
    const core = createMockCoreState({
      visibleMessages: [mockMsg1, mockMsg2],
      selectedIds: new Set(['msg-1']),
    })
    const { result } = renderMessageListHook(core)
    expect(result.current.isAllSelected).toBe(false)
  })

  it('density 从 core 传递', () => {
    const core = createMockCoreState({ density: 'compact' })
    const { result } = renderMessageListHook(core)
    expect(result.current.density).toBe('compact')
  })
})
