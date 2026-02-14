import * as React from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueries,
  useQueryClient,
  skipToken,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { FileText, Inbox, Send, Star, Trash2 } from "lucide-react";

import { trpc } from "@/utils/trpc";
import { resolveServerUrl } from "@/utils/server-url";
import {
  DEFAULT_FORM,
  MESSAGE_PAGE_SIZE,
  type ComposeMode,
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
} from "./email-types";
import { getProviderById } from "./email-provider-presets";
import {
  buildForwardBody,
  buildForwardSubject,
  buildMailboxTree,
  extractEmailAddress,
  formatDateTime,
  getMailboxLabel,
  hasEmailFlag,
  isDraftsMailboxView,
  isInboxMailboxView,
  isSentMailboxView,
  moveItem,
  normalizeEmail,
} from "./email-utils";

type UnifiedItem = {
  scope: UnifiedMailboxScope;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  count: number;
};

type DragInsertTarget = {
  accountEmail: string;
  parentPath: string | null;
  mailboxPath: string;
  position: "before" | "after";
} | null;

type MailboxHoverInput = {
  accountEmail: string;
  parentPath: string | null;
  overId: string;
  position: "before" | "after";
};

type MailboxDropInput = {
  accountEmail: string;
  parentPath: string | null;
  activeId: string;
  overId: string;
  position: "before" | "after";
  orderedIds: string[];
  orderedNodes: MailboxNode[];
};

type MailboxOrderKeyInput = {
  accountEmail: string;
  parentPath: string | null;
};

type AccountGroup = {
  account: EmailAccountView;
  key: string;
  mailboxes: EmailMailboxView[];
  mailboxTree: MailboxNode[];
  isLoading: boolean;
};

export type SidebarState = {
  unifiedItems: UnifiedItem[];
  activeView: UnifiedMailboxView;
  accounts: EmailAccountView[];
  accountsLoading: boolean;
  accountGroups: AccountGroup[];
  expandedAccounts: Record<string, boolean>;
  expandedMailboxes: Record<string, boolean>;
  dragInsertTarget: DragInsertTarget;
  draggingMailboxId: string | null;
  mailboxUnreadMap: Map<string, number>;
  canSyncMailbox: boolean;
  isSyncingMailbox: boolean;
  onSelectUnifiedView: (scope: UnifiedMailboxScope, label: string) => void;
  onSelectMailbox: (accountEmail: string, mailboxPath: string, label: string) => void;
  onToggleAccount: (accountEmail: string) => void;
  onToggleMailboxExpand: (accountEmail: string, mailboxPath: string) => void;
  onOpenAddAccount: () => void;
  onRemoveAccount: (emailAddress: string) => void;
  onSyncMailbox: () => void;
  onHoverMailbox: (input: MailboxHoverInput) => void;
  onClearHover: (input: MailboxOrderKeyInput) => void;
  onDropMailboxOrder: (input: MailboxDropInput) => void;
  onDragStartMailbox: (mailboxId: string) => void;
  onDragEndMailbox: () => void;
  resolveOrderedMailboxNodes: (
    accountEmail: string,
    parentPath: string | null,
    nodes: MailboxNode[],
  ) => MailboxNode[];
};

export type MessageListState = {
  searchKeyword: string;
  setSearchKeyword: React.Dispatch<React.SetStateAction<string>>;
  activeMailboxLabel: string;
  visibleMessages: EmailMessageSummary[];
  activeMessageId: string | null;
  onSelectMessage: (message: EmailMessageSummary) => void;
  messagesLoading: boolean;
  messagesFetchingNextPage: boolean;
  hasNextPage: boolean;
  messagesListRef: React.RefObject<HTMLDivElement | null>;
  loadMoreRef: React.RefObject<HTMLDivElement | null>;
  // 多选
  selectedIds: Set<string>;
  isAllSelected: boolean;
  hasSelection: boolean;
  onToggleSelect: (messageId: string, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  // 批量操作
  onBatchMarkRead: () => void;
  onBatchDelete: () => void;
  onBatchMove: (toMailbox: string) => void;
  onBatchArchive: () => void;
  batchActionPending: boolean;
  // 刷新
  onRefresh: () => void;
  isRefreshing: boolean;
  // 搜索
  isSearching: boolean;
};

export type DetailState = {
  workspaceId?: string;
  activeMessage: EmailMessageSummary | null;
  isForwarding: boolean;
  forwardDraft: ForwardDraft | null;
  setForwardDraft: React.Dispatch<React.SetStateAction<ForwardDraft | null>>;
  composeDraft: ComposeDraft | null;
  setComposeDraft: React.Dispatch<React.SetStateAction<ComposeDraft | null>>;
  isComposing: boolean;
  isSending: boolean;
  detailSubject: string;
  detailFrom: string;
  detailTime: string;
  detailFromAddress: string;
  detailTo: string;
  detailCc: string;
  detailBcc: string;
  hasCc: boolean;
  hasBcc: boolean;
  isPrivate: boolean;
  isFlagged: boolean;
  messageDetail?: EmailMessageDetail;
  messageDetailLoading: boolean;
  shouldShowAttachments: boolean;
  hasRawHtml: boolean;
  showingRawHtml: boolean;
  onToggleRawHtml: () => void;
  onStartForward: () => void;
  onCancelForward: () => void;
  onToggleFlagged: () => void;
  onSetPrivateSender: () => void;
  onRemovePrivateSender: () => void;
  onStartReply: () => void;
  onStartReplyAll: () => void;
  onStartCompose: () => void;
  onSendMessage: () => void;
  onCancelCompose: () => void;
  onDeleteMessage: () => void;
};

export type AddDialogState = {
  addDialogOpen: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
  formState: EmailAccountFormState;
  setFormState: React.Dispatch<React.SetStateAction<EmailAccountFormState>>;
  formError: string | null;
  testStatus: "idle" | "checking" | "ok" | "error";
  onTestConnection: () => void;
  onAddAccount: () => void;
  addAccountPending: boolean;
  onSelectProvider: (providerId: string) => void;
  onBackToProviderSelect: () => void;
  selectedProviderPasswordLabel: string;
  selectedProviderAppPasswordUrl: string | null;
  onOAuthLogin: () => void;
  onSwitchToPassword: () => void;
};

type EmailPageState = {
  sidebar: SidebarState;
  messageList: MessageListState;
  detail: DetailState;
  addDialog: AddDialogState;
};

type EmailPageStateParams = {
  workspaceId?: string;
};

export function useEmailPageState({ workspaceId }: EmailPageStateParams): EmailPageState {
  const queryClient = useQueryClient();

  // 当前选中的邮箱账号。
  const [activeAccountEmail, setActiveAccountEmail] = React.useState<string | null>(
    null,
  );
  // 当前选中的邮箱文件夹。
  const [activeMailbox, setActiveMailbox] = React.useState<string | null>(null);
  // 当前选中的视图范围。
  const [activeView, setActiveView] = React.useState<UnifiedMailboxView>({
    scope: "all-inboxes",
    label: "收件箱",
  });
  // 账号折叠状态。
  const [expandedAccounts, setExpandedAccounts] = React.useState<Record<string, boolean>>(
    {},
  );
  // 文件夹展开状态。
  const [expandedMailboxes, setExpandedMailboxes] = React.useState<Record<string, boolean>>(
    {},
  );
  // 文件夹排序覆盖（拖拽临时状态）。
  const [mailboxOrderOverrides, setMailboxOrderOverrides] = React.useState<
    Record<string, string[]>
  >({});
  // 拖拽占位线位置。
  const [dragInsertTarget, setDragInsertTarget] = React.useState<DragInsertTarget>(null);
  const [draggingMailboxId, setDraggingMailboxId] = React.useState<string | null>(null);
  const mailboxDragHoverRef = React.useRef<{
    key: string;
    id: string;
    position: "before" | "after";
    ts: number;
  } | null>(null);
  // 邮件搜索关键字。
  const [searchKeyword, setSearchKeyword] = React.useState("");
  // 搜索防抖关键字。
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = React.useState("");
  // 当前选中的邮件 ID。
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  // 转发编辑状态。
  const [isForwarding, setIsForwarding] = React.useState(false);
  const [forwardDraft, setForwardDraft] = React.useState<ForwardDraft | null>(null);
  // 撰写/回复编辑状态。
  const [composeDraft, setComposeDraft] = React.useState<ComposeDraft | null>(null);
  // 收藏状态的本地覆盖，用于提升操作反馈速度。
  const [flagOverrides, setFlagOverrides] = React.useState<Record<string, boolean>>(
    {},
  );
  const flagOverridesRef = React.useRef<Record<string, boolean>>({});
  const messagesListRef = React.useRef<HTMLDivElement | null>(null);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
  // 多选状态。
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const lastClickedIdRef = React.useRef<string | null>(null);
  // 添加账号弹窗开关。
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  // 添加账号表单数据。
  const [formState, setFormState] = React.useState(DEFAULT_FORM);
  // 表单错误提示。
  const [formError, setFormError] = React.useState<string | null>(null);
  // 连接测试状态。
  const [testStatus, setTestStatus] = React.useState<
    "idle" | "checking" | "ok" | "error"
  >("idle");

  React.useEffect(() => {
    // 逻辑：切换工作空间时立即清空邮件上下文，避免使用旧 workspace 的 messageId 发起查询。
    setActiveView({
      scope: "all-inboxes",
      label: "收件箱",
    });
    setActiveAccountEmail(null);
    setActiveMailbox(null);
    setSearchKeyword("");
    setDebouncedSearchKeyword("");
    setActiveMessageId(null);
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
    setIsForwarding(false);
    setForwardDraft(null);
    setComposeDraft(null);
  }, [workspaceId]);

  React.useEffect(() => {
    // 逻辑：同步收藏覆盖状态引用，避免并发更新读到旧值。
    flagOverridesRef.current = flagOverrides;
  }, [flagOverrides]);

  const accountsQuery = useQuery(
    trpc.email.listAccounts.queryOptions(
      workspaceId ? { workspaceId } : skipToken,
    ),
  );

  const accounts = (accountsQuery.data ?? []) as EmailAccountView[];
  const hasConfiguredAccounts = accounts.length > 0;

  const activeAccount = React.useMemo(() => {
    if (!accounts.length || !activeAccountEmail) return null;
    return (
      accounts.find(
        (account) => normalizeEmail(account.emailAddress) === activeAccountEmail,
      ) ?? null
    );
  }, [accounts, activeAccountEmail]);

  const unifiedMessagesInput = React.useMemo(() => {
    if (!workspaceId || !hasConfiguredAccounts) return null;
    if (activeView.scope === "mailbox") {
      if (!activeView.accountEmail || !activeView.mailbox) return null;
      return {
        workspaceId,
        scope: activeView.scope,
        accountEmail: activeView.accountEmail,
        mailbox: activeView.mailbox,
        pageSize: MESSAGE_PAGE_SIZE,
      };
    }
    return { workspaceId, scope: activeView.scope, pageSize: MESSAGE_PAGE_SIZE };
  }, [workspaceId, hasConfiguredAccounts, activeView]);

  const messagesQuery = useInfiniteQuery({
    ...trpc.email.listUnifiedMessages.infiniteQueryOptions(
      unifiedMessagesInput ?? skipToken,
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    ),
  });

  const messages = React.useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [messagesQuery.data],
  );

  const unifiedMessagesQueryKey = React.useMemo(() => {
    if (!unifiedMessagesInput) return null;
    return trpc.email.listUnifiedMessages.infiniteQueryOptions(
      unifiedMessagesInput,
    ).queryKey;
  }, [unifiedMessagesInput]);

  const mailboxesQueries = useQueries({
    queries: workspaceId
      ? accounts.map((account) =>
          trpc.email.listMailboxes.queryOptions({
            workspaceId,
            accountEmail: account.emailAddress,
          }),
        )
      : [],
  });

  const mailboxesByAccount = React.useMemo(() => {
    const map = new Map<string, EmailMailboxView[]>();
    accounts.forEach((account, index) => {
      const data = mailboxesQueries[index]?.data ?? [];
      map.set(normalizeEmail(account.emailAddress), data as EmailMailboxView[]);
    });
    return map;
  }, [accounts, mailboxesQueries]);

  const mailboxUnreadStatsQuery = useQuery(
    trpc.email.listMailboxUnreadStats.queryOptions(
      workspaceId && hasConfiguredAccounts ? { workspaceId } : skipToken,
    ),
  );

  const mailboxUnreadStats = (mailboxUnreadStatsQuery.data ?? []) as Array<{
    accountEmail: string;
    mailboxPath: string;
    unreadCount: number;
  }>;

  const unifiedUnreadStatsQuery = useQuery(
    trpc.email.listUnifiedUnreadStats.queryOptions(
      workspaceId && hasConfiguredAccounts ? { workspaceId } : skipToken,
    ),
  );

  const unifiedUnreadStats = unifiedUnreadStatsQuery.data ?? {
    allInboxes: 0,
    flagged: 0,
    drafts: 0,
    sent: 0,
  };

  const unifiedItems = React.useMemo(
    () => [
      {
        scope: "all-inboxes" as const,
        label: "收件箱",
        icon: Inbox,
        count: unifiedUnreadStats.allInboxes,
      },
      {
        scope: "flagged" as const,
        label: "收藏",
        icon: Star,
        count: unifiedUnreadStats.flagged,
      },
      {
        scope: "drafts" as const,
        label: "草稿",
        icon: FileText,
        count: unifiedUnreadStats.drafts,
      },
      {
        scope: "sent" as const,
        label: "已发送",
        icon: Send,
        count: unifiedUnreadStats.sent,
      },
      {
        scope: "deleted" as const,
        label: "已删除",
        icon: Trash2,
        count: 0,
      },
    ],
    [unifiedUnreadStats],
  );

  // 逻辑：原始 HTML 显示状态，切换邮件时重置。
  const [showingRawHtml, setShowingRawHtml] = React.useState(false);
  React.useEffect(() => {
    setShowingRawHtml(false);
  }, [activeMessageId]);
  const hasRawHtml = false;
  const handleToggleRawHtml = React.useCallback(() => {
    setShowingRawHtml((prev) => !prev);
  }, []);

  // 逻辑：搜索关键字防抖 400ms。
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword.trim())
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchKeyword])

  // 逻辑：mailbox scope 下使用服务端搜索。
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
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    ),
  });

  const serverSearchMessages = React.useMemo(
    () => serverSearchQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [serverSearchQuery.data],
  );
  const isServerSearchMode = Boolean(serverSearchInput);

  const visibleMessages = React.useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return messages;
    // 逻辑：mailbox scope 下优先使用服务端搜索结果。
    if (isServerSearchMode && serverSearchQuery.data) {
      return serverSearchMessages as EmailMessageSummary[]
    }
    // 逻辑：统一视图或服务端结果未就绪时，前端本地过滤。
    return messages.filter((message) => {
      const haystack = `${message.from} ${message.subject} ${message.preview}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [messages, searchKeyword, isServerSearchMode, serverSearchQuery.data, serverSearchMessages]);

  const activeMessageIdForQuery = React.useMemo(() => {
    if (!activeMessageId || !hasConfiguredAccounts) return null;
    // 逻辑：只允许查询“当前工作空间可见消息”，避免旧消息 ID 在切换工作空间后误查。
    return visibleMessages.some((message) => message.id === activeMessageId)
      ? activeMessageId
      : null;
  }, [activeMessageId, hasConfiguredAccounts, visibleMessages]);

  const messageDetailQuery = useQuery(
    trpc.email.getMessage.queryOptions(
      workspaceId && activeMessageIdForQuery
        ? { workspaceId, id: activeMessageIdForQuery }
        : skipToken,
    ),
  );

  const messageDetail = messageDetailQuery.data as EmailMessageDetail | undefined;

  const activeMessagesHasNextPage = isServerSearchMode
    ? Boolean(serverSearchQuery.hasNextPage)
    : Boolean(messagesQuery.hasNextPage);
  const activeMessagesFetchingNextPage = isServerSearchMode
    ? serverSearchQuery.isFetchingNextPage
    : messagesQuery.isFetchingNextPage;
  const activeMessagesFetchNextPage = isServerSearchMode
    ? serverSearchQuery.fetchNextPage
    : messagesQuery.fetchNextPage;
  const activeMessagePageCount = isServerSearchMode
    ? (serverSearchQuery.data?.pages.length ?? 0)
    : (messagesQuery.data?.pages.length ?? 0);

  const activeMessage = React.useMemo(() => {
    if (!activeMessageId) return null;
    return visibleMessages.find((message) => message.id === activeMessageId) ?? null;
  }, [activeMessageId, visibleMessages]);

  React.useEffect(() => {
    // 逻辑：切换邮件时退出转发/撰写编辑。
    setIsForwarding(false);
    setForwardDraft(null);
    setComposeDraft(null);
  }, [activeMessageId]);

  const mailboxUnreadMap = React.useMemo(() => {
    const map = new Map<string, number>();
    mailboxUnreadStats.forEach((stat) => {
      map.set(`${normalizeEmail(stat.accountEmail)}::${stat.mailboxPath}`, stat.unreadCount);
    });
    return map;
  }, [mailboxUnreadStats]);

  const accountGroups = React.useMemo(() => {
    return accounts.map((account, index) => {
      const key = normalizeEmail(account.emailAddress);
      const mailboxes = mailboxesByAccount.get(key) ?? [];
      const mailboxTree = buildMailboxTree(mailboxes);
      const isLoading = mailboxesQueries[index]?.isLoading ?? false;
      return { account, key, mailboxes, mailboxTree, isLoading };
    });
  }, [accounts, mailboxesByAccount, mailboxesQueries]);

  const updateMailboxSortsMutation = useMutation(
    trpc.email.updateMailboxSorts.mutationOptions({
      onSuccess: (_data, variables) => {
        if (!workspaceId) return;
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxes.queryOptions({
            workspaceId,
            accountEmail: variables.accountEmail,
          }).queryKey,
        });
        const key = getMailboxOrderKey(variables.accountEmail, variables.parentPath ?? null);
        setMailboxOrderOverrides((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      },
    }),
  );

  const activeMailboxLabel = React.useMemo(() => {
    if (activeView.scope !== "mailbox" || !activeView.accountEmail || !activeView.mailbox) {
      return activeView.label;
    }
    const mailboxes =
      mailboxesByAccount.get(normalizeEmail(activeView.accountEmail)) ?? [];
    const current = mailboxes.find((mailbox) => mailbox.path === activeView.mailbox);
    return current ? getMailboxLabel(current) : activeView.mailbox;
  }, [activeView, mailboxesByAccount]);

  const detailSubject = messageDetail?.subject ?? activeMessage?.subject ?? "";
  const detailFrom = messageDetail?.from?.[0] ?? activeMessage?.from ?? "";
  const detailTime =
    formatDateTime(messageDetail?.date ?? activeMessage?.time ?? "") || "—";
  const detailFlags = messageDetail?.flags ?? [];
  const overrideFlagged = activeMessageId ? flagOverrides[activeMessageId] : undefined;
  const isFlagged = overrideFlagged ?? hasEmailFlag(detailFlags, "FLAGGED");
  const detailFromAddress =
    messageDetail?.fromAddress ?? extractEmailAddress(detailFrom) ?? "";
  const isPrivate = messageDetail?.isPrivate ?? activeMessage?.isPrivate ?? false;
  const detailTo = messageDetail?.to?.length
    ? messageDetail.to.join("; ")
    : activeMessage?.accountEmail ?? activeAccount?.emailAddress ?? "—";
  const detailCc = messageDetail?.cc?.length ? messageDetail.cc.join("; ") : "—";
  const detailBcc = messageDetail?.bcc?.length ? messageDetail.bcc.join("; ") : "—";
  const hasCc = Boolean(messageDetail?.cc?.length);
  const hasBcc = Boolean(messageDetail?.bcc?.length);
  const shouldShowAttachments =
    messageDetailQuery.isLoading || (messageDetail?.attachments?.length ?? 0) > 0;

  React.useEffect(() => {
    if (!accounts.length) {
      setActiveAccountEmail(null);
      return;
    }
    if (!activeAccountEmail && activeView.scope === "mailbox") {
      // 逻辑：邮箱视图缺省时选中首个账号。
      setActiveAccountEmail(normalizeEmail(accounts[0]?.emailAddress ?? ""));
    }
  }, [accounts, activeAccountEmail, activeView.scope]);

  React.useEffect(() => {
    if (!accounts.length) {
      setExpandedAccounts({});
      return;
    }
    // 逻辑：新增账号时默认展开。
    setExpandedAccounts((prev) => {
      const next = { ...prev };
      accounts.forEach((account) => {
        const key = normalizeEmail(account.emailAddress);
        if (next[key] === undefined) {
          next[key] = true;
        }
      });
      return next;
    });
  }, [accounts]);

  React.useEffect(() => {
    // 逻辑：账号列表变更时清理无效的排序覆盖。
    setMailboxOrderOverrides((prev) => {
      if (!accounts.length) return {};
      const validKeys = new Set(
        accounts.map((account) => `${normalizeEmail(account.emailAddress)}::`),
      );
      const next: Record<string, string[]> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if ([...validKeys].some((prefix) => key.startsWith(prefix))) {
          next[key] = value;
        }
      });
      return next;
    });
  }, [accounts]);

  React.useEffect(() => {
    if (!visibleMessages.length) {
      setActiveMessageId(null);
      return;
    }
    const exists = visibleMessages.some((message) => message.id === activeMessageId);
    if (!exists) {
      setActiveMessageId(visibleMessages[0]?.id ?? null);
    }
  }, [visibleMessages, activeMessageId]);

  // 逻辑：visibleMessages 变化时清理不可见的选中 ID。
  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIdSet = new Set(visibleMessages.map((m) => m.id));
      const next = new Set([...prev].filter((id) => visibleIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleMessages]);

  React.useEffect(() => {
    const target = loadMoreRef.current;
    const root = messagesListRef.current;
    if (!target) return;
    if (!activeMessagesHasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          activeMessagesHasNextPage &&
          !activeMessagesFetchingNextPage
        ) {
          void activeMessagesFetchNextPage();
        }
      },
      { root, rootMargin: "0px 0px 120px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeMessagesHasNextPage,
    activeMessagesFetchingNextPage,
    activeMessagesFetchNextPage,
    activeMessagePageCount,
  ]);

  const addAccountMutation = useMutation(
    trpc.email.addAccount.mutationOptions({
      onSuccess: (data) => {
        // 逻辑：新增成功后刷新列表并选中新增账号。
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
          });
        }
        setActiveAccountEmail(normalizeEmail(data.emailAddress));
        setAddDialogOpen(false);
        resetFormState();
      },
      onError: (error) => {
        setFormError(error.message || "新增邮箱失败，请稍后再试。");
      },
    }),
  );

  const removeAccountMutation = useMutation(
    trpc.email.removeAccount.mutationOptions({
      onSuccess: () => {
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedMessages.pathKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
          });
        }
        setActiveAccountEmail(null);
        setActiveMailbox(null);
      },
    }),
  );

  const syncMailboxMutation = useMutation(
    trpc.email.syncMailbox.mutationOptions({
      onSuccess: () => {
        if (workspaceId && activeAccount?.emailAddress && activeMailbox) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedMessages.infiniteQueryOptions({
              workspaceId,
              scope: "mailbox",
              accountEmail: activeAccount.emailAddress,
              mailbox: activeMailbox,
              pageSize: MESSAGE_PAGE_SIZE,
            }).queryKey,
          });
        }
        if (workspaceId && activeAccount?.emailAddress) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxes.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          });
        }
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId })
              .queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId })
              .queryKey,
          });
        }
      },
    }),
  );

  const syncMailboxesMutation = useMutation(
    trpc.email.syncMailboxes.mutationOptions({
      onSuccess: () => {
        if (workspaceId && activeAccount?.emailAddress) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxes.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          });
        }
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId })
              .queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId })
              .queryKey,
          });
        }
      },
    }),
  );

  const markReadMutation = useMutation(
    trpc.email.markMessageRead.mutationOptions({
      onMutate: async (variables) => {
        if (!workspaceId || !unifiedMessagesQueryKey) return undefined;
        const previous =
          queryClient.getQueryData<
            InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
          >(unifiedMessagesQueryKey);
        const unreadCountKey = trpc.email.listUnreadCount.queryOptions({
          workspaceId,
        }).queryKey;
        const mailboxUnreadStatsKey = trpc.email.listMailboxUnreadStats.queryOptions({
          workspaceId,
        }).queryKey;
        const unifiedUnreadStatsKey = trpc.email.listUnifiedUnreadStats.queryOptions({
          workspaceId,
        }).queryKey;
        const detailKey = trpc.email.getMessage.queryOptions({
          workspaceId,
          id: variables.id,
        }).queryKey;
        const previousUnreadCount = queryClient.getQueryData<{ count: number }>(
          unreadCountKey,
        );
        const previousMailboxUnreadStats = queryClient.getQueryData<
          Array<{ accountEmail: string; mailboxPath: string; unreadCount: number }>
        >(mailboxUnreadStatsKey);
        const previousUnifiedUnreadStats = queryClient.getQueryData<{
          allInboxes: number;
          flagged: number;
          drafts: number;
          sent: number;
        }>(unifiedUnreadStatsKey);
        const previousDetail =
          queryClient.getQueryData<EmailMessageDetail>(detailKey);

        const messageFromCache = previous?.pages
          .flatMap((page) => page.items)
          .find((item) => item.id === variables.id);
        const shouldUpdateCounts = Boolean(messageFromCache?.unread);
        const accountEmail = messageFromCache?.accountEmail ?? "";
        const mailboxPath = messageFromCache?.mailbox ?? "";
        const mailboxView =
          mailboxesByAccount.get(normalizeEmail(accountEmail))?.find((mailbox) =>
            mailbox.path === mailboxPath,
          ) ?? null;
        queryClient.setQueryData<
          InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
        >(unifiedMessagesQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === variables.id ? { ...item, unread: false } : item,
              ),
            })),
          };
        });
        if (shouldUpdateCounts && previousUnreadCount) {
          queryClient.setQueryData(unreadCountKey, {
            count: Math.max(0, previousUnreadCount.count - 1),
          });
        }
        if (shouldUpdateCounts && previousMailboxUnreadStats && accountEmail && mailboxPath) {
          queryClient.setQueryData(mailboxUnreadStatsKey, (old) => {
            if (!old) return old;
            return old.map((stat) => {
              if (
                normalizeEmail(stat.accountEmail) !== normalizeEmail(accountEmail) ||
                stat.mailboxPath !== mailboxPath
              ) {
                return stat;
              }
              return { ...stat, unreadCount: Math.max(0, stat.unreadCount - 1) };
            });
          });
        }
        if (shouldUpdateCounts && previousUnifiedUnreadStats && mailboxView) {
          queryClient.setQueryData(unifiedUnreadStatsKey, (old) => {
            if (!old) return old;
            let next = { ...old };
            if (isInboxMailboxView(mailboxView)) {
              next.allInboxes = Math.max(0, next.allInboxes - 1);
            }
            if (isDraftsMailboxView(mailboxView)) {
              next.drafts = Math.max(0, next.drafts - 1);
            }
            if (isSentMailboxView(mailboxView)) {
              next.sent = Math.max(0, next.sent - 1);
            }
            return next;
          });
        }
        if (previousDetail) {
          queryClient.setQueryData<EmailMessageDetail>(detailKey, (old) => {
            if (!old) return old;
            if (hasEmailFlag(old.flags, "SEEN")) return old;
            return { ...old, flags: [...old.flags, "\\Seen"] };
          });
        }
        return {
          queryKey: unifiedMessagesQueryKey,
          previous,
          unreadCountKey,
          mailboxUnreadStatsKey,
          unifiedUnreadStatsKey,
          detailKey,
          previousUnreadCount,
          previousMailboxUnreadStats,
          previousUnifiedUnreadStats,
          previousDetail,
        };
      },
      onError: (_error, _variables, context) => {
        if (!context?.queryKey) return;
        queryClient.setQueryData(context.queryKey, context.previous as any);
        if (context.unreadCountKey) {
          queryClient.setQueryData(context.unreadCountKey, context.previousUnreadCount);
        }
        if (context.mailboxUnreadStatsKey) {
          queryClient.setQueryData(
            context.mailboxUnreadStatsKey,
            context.previousMailboxUnreadStats,
          );
        }
        if (context.unifiedUnreadStatsKey) {
          queryClient.setQueryData(
            context.unifiedUnreadStatsKey,
            context.previousUnifiedUnreadStats,
          );
        }
        if (context.detailKey) {
          queryClient.setQueryData(context.detailKey, context.previousDetail);
        }
      },
      onSettled: () => {
        if (!workspaceId || !unifiedMessagesQueryKey) return;
        queryClient.invalidateQueries({
          queryKey: unifiedMessagesQueryKey,
        });
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
        });
      },
    }),
  );

  const setFlaggedMutation = useMutation(
    trpc.email.setMessageFlagged.mutationOptions({
      onMutate: async (variables) => {
        if (!workspaceId) return undefined;
        const queryKey = trpc.email.getMessage.queryOptions({
          workspaceId,
          id: variables.id,
        }).queryKey;
        const unifiedMessagesKey = unifiedMessagesQueryKey;
        const unifiedUnreadStatsKey = trpc.email.listUnifiedUnreadStats.queryOptions({
          workspaceId,
        }).queryKey;
        const previousUnifiedMessages = unifiedMessagesKey
          ? queryClient.getQueryData<
              InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
            >(unifiedMessagesKey)
          : undefined;
        const previousUnifiedUnreadStats = queryClient.getQueryData<{
          allInboxes: number;
          flagged: number;
          drafts: number;
          sent: number;
        }>(unifiedUnreadStatsKey);
        const cachedMessage = previousUnifiedMessages?.pages
          .flatMap((page) => page.items)
          .find((item) => item.id === variables.id);
        const shouldAdjustFlaggedUnread = Boolean(cachedMessage?.unread);
        const previousOverride = flagOverridesRef.current[variables.id];
        // 逻辑：先记录本地覆盖状态，保证按钮立即反馈。
        setFlagOverrides((prev) => ({ ...prev, [variables.id]: variables.flagged }));
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<EmailMessageDetail>(queryKey);
        queryClient.setQueryData<EmailMessageDetail | undefined>(queryKey, (old) => {
          if (!old) return old;
          const nextFlags = variables.flagged
            ? [...old.flags, "\\Flagged"]
            : old.flags.filter((flag) => !hasEmailFlag([flag], "FLAGGED"));
          return { ...old, flags: nextFlags };
        });
        if (unifiedMessagesKey && previousUnifiedMessages && activeView.scope === "flagged") {
          queryClient.setQueryData<
            InfiniteData<{ items: EmailMessageSummary[]; nextCursor: string | null }>
          >(unifiedMessagesKey, (old) => {
            if (!old) return old;
            if (variables.flagged) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== variables.id),
              })),
            };
          });
        }
        if (shouldAdjustFlaggedUnread && previousUnifiedUnreadStats) {
          queryClient.setQueryData(unifiedUnreadStatsKey, (old) => {
            if (!old) return old;
            const next = { ...old };
            next.flagged = Math.max(
              0,
              next.flagged + (variables.flagged ? 1 : -1),
            );
            return next;
          });
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
        };
      },
      onError: (_error, _variables, context) => {
        if (!context?.queryKey) return;
        queryClient.setQueryData(context.queryKey, context.previous);
        if (context.unifiedMessagesKey) {
          queryClient.setQueryData(
            context.unifiedMessagesKey,
            context.previousUnifiedMessages as any,
          );
        }
        if (context.unifiedUnreadStatsKey) {
          queryClient.setQueryData(
            context.unifiedUnreadStatsKey,
            context.previousUnifiedUnreadStats,
          );
        }
        if (context?.id) {
          setFlagOverrides((prev) => {
            const next = { ...prev };
            if (context.previousOverride === undefined) {
              delete next[context.id];
            } else {
              next[context.id] = context.previousOverride;
            }
            return next;
          });
        }
      },
      onSettled: (_data, _error, _variables, context) => {
        if (context?.id) {
          setFlagOverrides((prev) => {
            if (!(context.id in prev)) return prev;
            const next = { ...prev };
            delete next[context.id];
            return next;
          });
        }
        if (!workspaceId) return;
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedMessages.pathKey(),
        });
        const targetId = context?.id ?? activeMessageId;
        if (targetId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.getMessage.queryOptions({
              workspaceId,
              id: targetId,
            }).queryKey,
          });
        }
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId })
            .queryKey,
        });
      },
    }),
  );

  const setPrivateSenderMutation = useMutation(
    trpc.email.setPrivateSender.mutationOptions({
      onSuccess: () => {
        if (!workspaceId || !unifiedMessagesQueryKey) return;
        queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey });
        if (activeMessageId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.getMessage.queryOptions({
              workspaceId,
              id: activeMessageId,
            }).queryKey,
          });
        }
      },
    }),
  );

  const removePrivateSenderMutation = useMutation(
    trpc.email.removePrivateSender.mutationOptions({
      onSuccess: () => {
        if (!workspaceId || !unifiedMessagesQueryKey) return;
        queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey });
        if (activeMessageId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.getMessage.queryOptions({
              workspaceId,
              id: activeMessageId,
            }).queryKey,
          });
        }
      },
    }),
  );

  const sendMessageMutation = useMutation(
    trpc.email.sendMessage.mutationOptions({
      onSuccess: () => {
        // 逻辑：发送成功后退出编辑模式并刷新已发送列表。
        setComposeDraft(null);
        setIsForwarding(false);
        setForwardDraft(null);
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedMessages.pathKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          });
        }
      },
    }),
  );

  const deleteMessageMutation = useMutation(
    trpc.email.deleteMessage.mutationOptions({
      onSuccess: () => {
        setActiveMessageId(null);
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedMessages.pathKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
          });
        }
      },
    }),
  );

  const testConnectionMutation = useMutation(
    trpc.email.testConnection.mutationOptions({}),
  );

  const saveDraftMutation = useMutation(
    trpc.email.saveDraft.mutationOptions({
      onSuccess: (data) => {
        // 逻辑：保存成功后更新草稿 ID，后续 upsert 使用。
        if (composeDraft && !composeDraft.inReplyTo) {
          setComposeDraft((prev) =>
            prev ? { ...prev, inReplyTo: data.id } : prev,
          );
        }
        draftIdRef.current = data.id;
      },
    }),
  );

  const draftIdRef = React.useRef<string | null>(null);

  // 逻辑：自动保存草稿（debounce 3 秒）。
  React.useEffect(() => {
    if (!composeDraft || !workspaceId) return;
    const timer = window.setTimeout(() => {
      saveDraftMutation.mutate({
        workspaceId,
        id: draftIdRef.current ?? undefined,
        accountEmail: composeDraft.accountEmail ?? accounts[0]?.emailAddress ?? "",
        mode: composeDraft.mode,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        subject: composeDraft.subject,
        body: composeDraft.body,
        inReplyTo: composeDraft.inReplyTo,
        references: composeDraft.references,
      });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [composeDraft]);

  // 逻辑：退出撰写时清理草稿 ID 引用。
  React.useEffect(() => {
    if (!composeDraft) {
      draftIdRef.current = null;
    }
  }, [composeDraft]);

  /** Reset add-account form state. */
  function resetFormState() {
    setFormState(DEFAULT_FORM);
    setFormError(null);
    setTestStatus("idle");
  }

  /** Handle provider selection - fills in preset config. */
  function handleSelectProvider(providerId: string) {
    const provider = getProviderById(providerId);
    if (!provider) return;
    setFormState((prev) => ({
      ...prev,
      step: "configure",
      selectedProviderId: providerId,
      authType: provider.authType,
      oauthProvider: provider.oauthProvider,
      oauthAuthorized: false,
      oauthEmail: undefined,
      imapHost: provider.imap?.host ?? "",
      imapPort: provider.imap?.port ?? 993,
      imapTls: provider.imap?.tls ?? true,
      smtpHost: provider.smtp?.host ?? "",
      smtpPort: provider.smtp?.port ?? 465,
      smtpTls: provider.smtp?.tls ?? true,
    }));
    setFormError(null);
    setTestStatus("idle");
  }

  /** Go back to provider selection step. */
  function handleBackToProviderSelect() {
    setFormState((prev) => ({
      ...prev,
      step: "select-provider",
      selectedProviderId: null,
    }));
    setFormError(null);
    setTestStatus("idle");
  }

  /** Get selected provider's password label. */
  const selectedProviderPasswordLabel = React.useMemo(() => {
    if (!formState.selectedProviderId) return "密码";
    const provider = getProviderById(formState.selectedProviderId);
    return provider?.passwordLabel ?? "密码";
  }, [formState.selectedProviderId]);

  /** Get selected provider's app password URL. */
  const selectedProviderAppPasswordUrl = React.useMemo(() => {
    if (!formState.selectedProviderId) return null;
    const provider = getProviderById(formState.selectedProviderId);
    return provider?.appPasswordUrl ?? null;
  }, [formState.selectedProviderId]);

  /** Validate add-account form and return error message. */
  function validateFormState(): string | null {
    if (formState.authType === "oauth2") {
      if (!formState.oauthAuthorized || !formState.oauthEmail) {
        return "请先完成 OAuth 授权登录。";
      }
      return null;
    }
    const email = formState.emailAddress.trim();
    if (!email || !email.includes("@")) return "请填写有效的邮箱地址。";
    if (!formState.imapHost.trim()) return "请填写 IMAP 服务器地址。";
    if (!formState.smtpHost.trim()) return "请填写 SMTP 服务器地址。";
    if (!formState.password.trim()) return `请填写${selectedProviderPasswordLabel}。`;
    if (!Number.isFinite(formState.imapPort) || formState.imapPort <= 0) {
      return "IMAP 端口不正确。";
    }
    if (!Number.isFinite(formState.smtpPort) || formState.smtpPort <= 0) {
      return "SMTP 端口不正确。";
    }
    return null;
  }

  /** Handle add-account connection test. */
  function handleTestConnection() {
    const error = validateFormState();
    if (error) {
      setFormError(error);
      setTestStatus("error");
      return;
    }
    setFormError(null);
    setTestStatus("checking");
    // 逻辑：仅做前端模拟，后续接入服务端连接测试。
    window.setTimeout(() => {
      setTestStatus("ok");
    }, 600);
  }

  /** Handle add-account submission. */
  function handleAddAccount() {
    const error = validateFormState();
    if (error) {
      setFormError(error);
      return;
    }
    if (!workspaceId) {
      setFormError("工作空间未加载，请稍后再试。");
      return;
    }
    if (formState.authType === "oauth2") {
      // 逻辑：OAuth 账号仅需提交 authType、邮箱地址和标签。
      const oauthAuthType =
        formState.oauthProvider === "google" ? "oauth2-gmail" : "oauth2-graph";
      addAccountMutation.mutate({
        authType: oauthAuthType,
        workspaceId,
        emailAddress: (formState.oauthEmail ?? formState.emailAddress).trim(),
        label: formState.label.trim() || undefined,
      });
      return;
    }
    // 逻辑：调用服务端接口写入账号与密码配置。
    addAccountMutation.mutate({
      authType: "password",
      workspaceId,
      emailAddress: formState.emailAddress.trim(),
      label: formState.label.trim() || undefined,
      imap: {
        host: formState.imapHost.trim(),
        port: Number(formState.imapPort || 0),
        tls: formState.imapTls,
      },
      smtp: {
        host: formState.smtpHost.trim(),
        port: Number(formState.smtpPort || 0),
        tls: formState.smtpTls,
      },
      password: formState.password,
    });
  }

  /** Handle OAuth login - opens popup for authorization. */
  function handleOAuthLogin() {
    if (!workspaceId || !formState.oauthProvider) return;
    const serverUrl = resolveServerUrl();
    const oauthUrl = `${serverUrl}/auth/email/${formState.oauthProvider}/start?workspaceId=${encodeURIComponent(workspaceId)}`;
    const popup = window.open(oauthUrl, "oauth", "width=600,height=700");
    if (!popup) {
      setFormError("无法打开授权窗口，请检查浏览器弹窗设置。");
      return;
    }
    // 逻辑：轮询检测弹窗关闭，关闭后查询授权结果。
    const timer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(timer);
      // 逻辑：弹窗关闭后刷新账号列表以检测授权是否成功。
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
        });
      }
      setFormState((prev) => ({
        ...prev,
        oauthAuthorized: true,
        oauthEmail: prev.emailAddress || undefined,
      }));
    }, 500);
  }

  /** Handle switching from OAuth to password mode (Gmail fallback). */
  function handleSwitchToPassword() {
    const provider = formState.selectedProviderId
      ? getProviderById(formState.selectedProviderId)
      : null;
    setFormState((prev) => ({
      ...prev,
      authType: "password",
      oauthProvider: undefined,
      oauthAuthorized: false,
      oauthEmail: undefined,
      imapHost: provider?.imap?.host ?? prev.imapHost,
      imapPort: provider?.imap?.port ?? prev.imapPort,
      imapTls: provider?.imap?.tls ?? prev.imapTls,
      smtpHost: provider?.smtp?.host ?? prev.smtpHost,
      smtpPort: provider?.smtp?.port ?? prev.smtpPort,
      smtpTls: provider?.smtp?.tls ?? prev.smtpTls,
    }));
    setFormError(null);
    setTestStatus("idle");
  }

  /** Handle unified view selection. */
  function handleSelectUnifiedView(scope: UnifiedMailboxScope, label: string) {
    // 逻辑：切换统一视图时清空账号与文件夹选择。
    setActiveView({ scope, label });
    setActiveAccountEmail(null);
    setActiveMailbox(null);
    setSearchKeyword("");
    setActiveMessageId(null);
    setSelectedIds(new Set());
  }

  /** Handle mailbox sync. */
  function handleSyncMailbox() {
    if (!workspaceId || !activeAccount?.emailAddress) return;
    syncMailboxesMutation.mutate({
      workspaceId,
      accountEmail: activeAccount.emailAddress,
    });
    if (activeMailbox) {
      syncMailboxMutation.mutate({
        workspaceId,
        accountEmail: activeAccount.emailAddress,
        mailbox: activeMailbox,
      });
    }
  }

  /** Handle mailbox selection. */
  function handleSelectMailbox(accountEmail: string, mailboxPath: string, label: string) {
    // 逻辑：切换文件夹后重置搜索与选中邮件。
    setActiveView({
      scope: "mailbox",
      accountEmail,
      mailbox: mailboxPath,
      label,
    });
    setActiveAccountEmail(normalizeEmail(accountEmail));
    setActiveMailbox(mailboxPath);
    setSearchKeyword("");
    setActiveMessageId(null);
    setSelectedIds(new Set());
  }

  /** Handle account group toggle. */
  function handleToggleAccount(accountEmail: string) {
    const key = normalizeEmail(accountEmail);
    setExpandedAccounts((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /** Handle mailbox tree expand/collapse toggle. */
  function handleToggleMailboxExpand(accountEmail: string, mailboxPath: string) {
    const key = `${normalizeEmail(accountEmail)}::${mailboxPath}`;
    // 逻辑：默认展开，点击后在展开/收起之间切换。
    setExpandedMailboxes((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }

  /** Handle remove account. */
  function handleRemoveAccount(emailAddress: string) {
    if (!workspaceId) return;
    removeAccountMutation.mutate({ workspaceId, emailAddress });
  }

  /** Build order key for mailbox siblings. */
  function getMailboxOrderKey(accountEmail: string, parentPath: string | null) {
    return `${normalizeEmail(accountEmail)}::${parentPath ?? "__root__"}`;
  }

  /** Resolve ordered mailbox nodes with overrides. */
  function resolveOrderedMailboxNodes(
    accountEmail: string,
    parentPath: string | null,
    nodes: MailboxNode[],
  ) {
    const key = getMailboxOrderKey(accountEmail, parentPath);
    const order = mailboxOrderOverrides[key];
    if (!order?.length) return nodes;
    const byId = new Map(nodes.map((node) => [node.path, node]));
    const ordered: MailboxNode[] = [];
    order.forEach((id) => {
      const node = byId.get(id);
      if (node) ordered.push(node);
    });
    nodes.forEach((node) => {
      if (!order.includes(node.path)) ordered.push(node);
    });
    return ordered;
  }

  /** Update drag hover indicator with debounce. */
  function handleHoverMailbox(input: MailboxHoverInput) {
    const key = getMailboxOrderKey(input.accountEmail, input.parentPath);
    const now = Date.now();
    const last = mailboxDragHoverRef.current;
    // 逻辑：防抖动，避免频繁状态抖动。
    if (
      last &&
      last.key === key &&
      last.id === input.overId &&
      last.position === input.position &&
      now - last.ts < 80
    ) {
      return;
    }
    mailboxDragHoverRef.current = {
      key,
      id: input.overId,
      position: input.position,
      ts: now,
    };
    setDragInsertTarget({
      accountEmail: input.accountEmail,
      parentPath: input.parentPath,
      mailboxPath: input.overId,
      position: input.position,
    });
  }

  /** Clear drag hover indicator. */
  function handleClearHover(input: MailboxOrderKeyInput) {
    const key = getMailboxOrderKey(input.accountEmail, input.parentPath);
    const last = mailboxDragHoverRef.current;
    if (last?.key === key) {
      mailboxDragHoverRef.current = null;
    }
    setDragInsertTarget(null);
  }

  /** Handle drop reorder. */
  function handleDropMailboxOrder(input: MailboxDropInput) {
    const { accountEmail, parentPath, activeId, overId, position, orderedIds, orderedNodes } =
      input;
    const fromIndex = orderedIds.indexOf(activeId);
    let toIndex = orderedIds.indexOf(overId);
    if (fromIndex < 0 || toIndex < 0) return;
    if (position === "after") {
      toIndex += 1;
    }
    if (toIndex > orderedIds.length) {
      toIndex = orderedIds.length;
    }
    const nextOrder = moveItem(orderedIds, fromIndex, toIndex);
    setMailboxOrderOverrides((prev) => ({
      ...prev,
      [getMailboxOrderKey(accountEmail, parentPath)]: nextOrder,
    }));
    const orderedNextNodes = nextOrder
      .map((id) => orderedNodes.find((node) => node.path === id))
      .filter((node): node is MailboxNode => Boolean(node));
    handleCommitMailboxOrder({
      accountEmail,
      parentPath,
      orderedNodes: orderedNextNodes,
    });
    handleClearHover({ accountEmail, parentPath });
  }

  /** Persist mailbox order. */
  function handleCommitMailboxOrder(input: {
    accountEmail: string;
    parentPath: string | null;
    orderedNodes: MailboxNode[];
  }) {
    if (!workspaceId) return;
    const { accountEmail, parentPath, orderedNodes } = input;
    const sorts = orderedNodes.map((node, index) => ({
      mailboxPath: node.path,
      sort: index * 10,
    }));
    updateMailboxSortsMutation.mutate({
      workspaceId,
      accountEmail,
      parentPath,
      sorts,
    });
  }

  /** Handle message selection. */
  function handleSelectMessage(message: EmailMessageSummary) {
    setActiveMessageId(message.id);
    if (!workspaceId) return;
    if (message.unread) {
      markReadMutation.mutate({ workspaceId, id: message.id });
    }
  }

  function handleToggleFlagged() {
    if (!workspaceId || !activeMessageId) return;
    setFlaggedMutation.mutate({
      workspaceId,
      id: activeMessageId,
      flagged: !isFlagged,
    });
  }

  /** Start forward editing. */
  function handleStartForward() {
    if (!activeMessage) return;
    const bodyText = messageDetail?.bodyText || activeMessage.preview || "";
    const nextDraft: ForwardDraft = {
      to: "",
      cc: "",
      bcc: "",
      subject: buildForwardSubject(detailSubject || ""),
      body: buildForwardBody({
        from: detailFrom,
        to: detailTo,
        cc: hasCc ? detailCc : "",
        time: detailTime,
        subject: detailSubject || "—",
        bodyText,
      }),
    };
    // 逻辑：进入转发编辑并写入默认内容。
    setForwardDraft(nextDraft);
    setIsForwarding(true);
  }

  /** Cancel forward editing. */
  function handleCancelForward() {
    // 逻辑：退出转发编辑并清空草稿。
    setIsForwarding(false);
    setForwardDraft(null);
  }

  /** Start reply to sender. */
  function handleStartReply() {
    if (!activeMessage || !messageDetail) return;
    const replyTo = messageDetail.fromAddress ?? detailFrom;
    const draft: ComposeDraft = {
      mode: "reply",
      to: replyTo,
      cc: "",
      bcc: "",
      subject: detailSubject.startsWith("Re:") ? detailSubject : `Re: ${detailSubject}`,
      body: "",
      inReplyTo: messageDetail.id,
      accountEmail: activeMessage.accountEmail,
    };
    setComposeDraft(draft);
    setIsForwarding(true);
  }

  /** Start reply-all. */
  function handleStartReplyAll() {
    if (!activeMessage || !messageDetail) return;
    const replyTo = messageDetail.fromAddress ?? detailFrom;
    const ccList = [
      ...(messageDetail.to ?? []),
      ...(messageDetail.cc ?? []),
    ].filter((addr) => {
      const normalized = addr.toLowerCase().trim();
      return normalized !== activeMessage.accountEmail.toLowerCase().trim()
        && normalized !== replyTo.toLowerCase().trim();
    });
    const draft: ComposeDraft = {
      mode: "replyAll",
      to: replyTo,
      cc: ccList.join(", "),
      bcc: "",
      subject: detailSubject.startsWith("Re:") ? detailSubject : `Re: ${detailSubject}`,
      body: "",
      inReplyTo: messageDetail.id,
      accountEmail: activeMessage.accountEmail,
    };
    setComposeDraft(draft);
    setIsForwarding(true);
  }

  /** Start composing a new email. */
  function handleStartCompose() {
    const accountEmail = accounts[0]?.emailAddress ?? "";
    const draft: ComposeDraft = {
      mode: "compose",
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      accountEmail,
    };
    setComposeDraft(draft);
    setIsForwarding(true);
    setActiveMessageId(null);
  }

  /** Cancel compose/reply. */
  function handleCancelCompose() {
    setComposeDraft(null);
    setIsForwarding(false);
    setForwardDraft(null);
  }

  /** Send the current compose/forward draft. */
  function handleSendMessage() {
    if (!workspaceId) return;
    // 逻辑：优先使用 composeDraft，回退到 forwardDraft（转发场景）。
    if (composeDraft) {
      const toList = composeDraft.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (!toList.length) return;
      sendMessageMutation.mutate({
        workspaceId,
        accountEmail: composeDraft.accountEmail ?? accounts[0]?.emailAddress ?? "",
        to: toList,
        cc: composeDraft.cc ? composeDraft.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        bcc: composeDraft.bcc ? composeDraft.bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        subject: composeDraft.subject,
        bodyText: composeDraft.body,
        inReplyTo: composeDraft.inReplyTo,
        references: composeDraft.references,
      });
      return;
    }
    if (forwardDraft && activeMessage) {
      const toList = forwardDraft.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (!toList.length) return;
      sendMessageMutation.mutate({
        workspaceId,
        accountEmail: activeMessage.accountEmail,
        to: toList,
        cc: forwardDraft.cc ? forwardDraft.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        bcc: forwardDraft.bcc ? forwardDraft.bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined,
        subject: forwardDraft.subject,
        bodyText: forwardDraft.body,
      });
    }
  }

  /** Delete the active message. */
  function handleDeleteMessage() {
    if (!workspaceId || !activeMessageId) return;
    deleteMessageMutation.mutate({ workspaceId, id: activeMessageId });
  }

  function handleSetPrivateSender() {
    if (!workspaceId || !detailFromAddress) return;
    setPrivateSenderMutation.mutate({
      workspaceId,
      senderEmail: detailFromAddress,
    });
  }

  function handleRemovePrivateSender() {
    if (!workspaceId || !detailFromAddress) return;
    removePrivateSenderMutation.mutate({
      workspaceId,
      senderEmail: detailFromAddress,
    });
  }

  // ── 多选处理 ──

  /** Toggle single message selection, with shift-click range support. */
  function handleToggleSelect(messageId: string, shiftKey?: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdRef.current) {
        const ids = visibleMessages.map((m) => m.id)
        const fromIdx = ids.indexOf(lastClickedIdRef.current)
        const toIdx = ids.indexOf(messageId)
        if (fromIdx >= 0 && toIdx >= 0) {
          const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
          for (let i = start; i <= end; i++) {
            next.add(ids[i]!)
          }
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

  /** Toggle select all / deselect all. */
  function handleToggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === visibleMessages.length && visibleMessages.length > 0) {
        return new Set()
      }
      return new Set(visibleMessages.map((m) => m.id))
    })
  }

  /** Clear all selections. */
  function handleClearSelection() {
    setSelectedIds(new Set())
    lastClickedIdRef.current = null
  }

  // ── 批量操作 mutations ──

  const batchMarkReadMutation = useMutation(
    trpc.email.batchMarkRead.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return
        // 逻辑：乐观更新 unread→false。
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
        if (!workspaceId) return
        if (unifiedMessagesQueryKey) {
          queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
        }
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
      },
    }),
  )

  const batchDeleteMutation = useMutation(
    trpc.email.batchDelete.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return
        // 逻辑：乐观从列表移除。
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
        if (!workspaceId) return
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedMessages.pathKey(),
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
      },
    }),
  )

  const batchMoveMutation = useMutation(
    trpc.email.batchMove.mutationOptions({
      onMutate: async (variables) => {
        if (!unifiedMessagesQueryKey) return
        // 逻辑：乐观从当前列表移除。
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
        if (!workspaceId) return
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedMessages.pathKey(),
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
        })
      },
    }),
  )

  /** Batch mark selected as read. */
  function handleBatchMarkRead() {
    if (!workspaceId || selectedIds.size === 0) return
    batchMarkReadMutation.mutate({ workspaceId, ids: [...selectedIds] })
  }

  /** Batch delete selected. */
  function handleBatchDelete() {
    if (!workspaceId || selectedIds.size === 0) return
    batchDeleteMutation.mutate({ workspaceId, ids: [...selectedIds] })
  }

  /** Batch move selected to target mailbox. */
  function handleBatchMove(toMailbox: string) {
    if (!workspaceId || selectedIds.size === 0) return
    batchMoveMutation.mutate({ workspaceId, ids: [...selectedIds], toMailbox })
  }

  /** Batch archive selected (= move to Archive). */
  function handleBatchArchive() {
    handleBatchMove('Archive')
  }

  // ── 刷新 ──

  /** Refresh messages for current view. */
  function handleRefreshMessages() {
    if (!workspaceId) return
    // 逻辑：同步邮箱文件夹列表（确保 EmailMailbox 表有数据）。
    for (const account of accounts) {
      syncMailboxesMutation.mutate({
        workspaceId,
        accountEmail: account.emailAddress,
      })
    }
    // 逻辑：mailbox scope → 同步当前文件夹。
    if (activeView.scope === 'mailbox' && activeView.accountEmail && activeView.mailbox) {
      syncMailboxMutation.mutate({
        workspaceId,
        accountEmail: activeView.accountEmail,
        mailbox: activeView.mailbox,
      })
    } else {
      // 逻辑：统一视图 → 同步所有账号的 INBOX。
      for (const account of accounts) {
        syncMailboxMutation.mutate({
          workspaceId,
          accountEmail: account.emailAddress,
          mailbox: 'INBOX',
        })
      }
    }
    // 逻辑：同时 invalidate 消息列表、文件夹列表和未读统计。
    if (unifiedMessagesQueryKey) {
      queryClient.invalidateQueries({ queryKey: unifiedMessagesQueryKey })
    }
    queryClient.invalidateQueries({
      queryKey: trpc.email.searchMessages.pathKey(),
    })
    for (const account of accounts) {
      queryClient.invalidateQueries({
        queryKey: trpc.email.listMailboxes.queryOptions({
          workspaceId,
          accountEmail: account.emailAddress,
        }).queryKey,
      })
    }
    queryClient.invalidateQueries({
      queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.email.listUnifiedUnreadStats.queryOptions({ workspaceId }).queryKey,
    })
    queryClient.invalidateQueries({
      queryKey: trpc.email.listMailboxUnreadStats.queryOptions({ workspaceId }).queryKey,
    })
  }

  const canSyncMailbox = Boolean(activeAccount?.emailAddress);
  const isSyncingMailbox = syncMailboxMutation.isPending || syncMailboxesMutation.isPending;
  const batchActionPending =
    batchMarkReadMutation.isPending ||
    batchDeleteMutation.isPending ||
    batchMoveMutation.isPending;
  const isRefreshing = syncMailboxMutation.isPending;
  const isSearching =
    isServerSearchMode &&
    serverSearchQuery.isFetching &&
    !serverSearchQuery.isFetchingNextPage;
  const hasSelection = selectedIds.size > 0;
  const isAllSelected = visibleMessages.length > 0 && selectedIds.size === visibleMessages.length;

  const sidebar: SidebarState = {
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
  };

  const messageList: MessageListState = {
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
    // 多选
    selectedIds,
    isAllSelected,
    hasSelection,
    onToggleSelect: handleToggleSelect,
    onToggleSelectAll: handleToggleSelectAll,
    onClearSelection: handleClearSelection,
    // 批量操作
    onBatchMarkRead: handleBatchMarkRead,
    onBatchDelete: handleBatchDelete,
    onBatchMove: handleBatchMove,
    onBatchArchive: handleBatchArchive,
    batchActionPending,
    // 刷新
    onRefresh: handleRefreshMessages,
    isRefreshing,
    // 搜索
    isSearching,
  };

  const detail: DetailState = {
    workspaceId,
    activeMessage,
    isForwarding,
    forwardDraft,
    setForwardDraft,
    composeDraft,
    setComposeDraft,
    isComposing: Boolean(composeDraft),
    isSending: sendMessageMutation.isPending,
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
  };

  const addDialog: AddDialogState = {
    addDialogOpen,
    onAddDialogOpenChange: (open) => {
      setAddDialogOpen(open);
      if (!open) resetFormState();
    },
    formState,
    setFormState,
    formError,
    testStatus,
    onTestConnection: handleTestConnection,
    onAddAccount: handleAddAccount,
    addAccountPending: addAccountMutation.isPending,
    onSelectProvider: handleSelectProvider,
    onBackToProviderSelect: handleBackToProviderSelect,
    selectedProviderPasswordLabel,
    selectedProviderAppPasswordUrl,
    onOAuthLogin: handleOAuthLogin,
    onSwitchToPassword: handleSwitchToPassword,
  };

  return {
    sidebar,
    messageList,
    detail,
    addDialog,
  };
}
