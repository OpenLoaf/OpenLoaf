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
import { FileText, Inbox, Send, Star } from "lucide-react";

import { trpc } from "@/utils/trpc";
import {
  DEFAULT_FORM,
  MESSAGE_PAGE_SIZE,
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
  dragInsertTarget: DragInsertTarget;
  draggingMailboxId: string | null;
  mailboxUnreadMap: Map<string, number>;
  canSyncMailbox: boolean;
  isSyncingMailbox: boolean;
  onSelectUnifiedView: (scope: UnifiedMailboxScope, label: string) => void;
  onSelectMailbox: (accountEmail: string, mailboxPath: string, label: string) => void;
  onToggleAccount: (accountEmail: string) => void;
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
};

export type DetailState = {
  activeMessage: EmailMessageSummary | null;
  isForwarding: boolean;
  forwardDraft: ForwardDraft | null;
  setForwardDraft: React.Dispatch<React.SetStateAction<ForwardDraft | null>>;
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
  onStartForward: () => void;
  onCancelForward: () => void;
  onToggleFlagged: () => void;
  onSetPrivateSender: () => void;
  onRemovePrivateSender: () => void;
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
  // 当前选中的邮件 ID。
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  // 转发编辑状态。
  const [isForwarding, setIsForwarding] = React.useState(false);
  const [forwardDraft, setForwardDraft] = React.useState<ForwardDraft | null>(null);
  // 收藏状态的本地覆盖，用于提升操作反馈速度。
  const [flagOverrides, setFlagOverrides] = React.useState<Record<string, boolean>>(
    {},
  );
  const flagOverridesRef = React.useRef<Record<string, boolean>>({});
  const messagesListRef = React.useRef<HTMLDivElement | null>(null);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
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
    // 逻辑：同步收藏覆盖状态引用，避免并发更新读到旧值。
    flagOverridesRef.current = flagOverrides;
  }, [flagOverrides]);

  const accountsQuery = useQuery(
    trpc.email.listAccounts.queryOptions(
      workspaceId ? { workspaceId } : skipToken,
    ),
  );

  const accounts = (accountsQuery.data ?? []) as EmailAccountView[];

  const activeAccount = React.useMemo(() => {
    if (!accounts.length || !activeAccountEmail) return null;
    return (
      accounts.find(
        (account) => normalizeEmail(account.emailAddress) === activeAccountEmail,
      ) ?? null
    );
  }, [accounts, activeAccountEmail]);

  const unifiedMessagesInput = React.useMemo(() => {
    if (!workspaceId) return null;
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
  }, [workspaceId, activeView]);

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
      workspaceId ? { workspaceId } : skipToken,
    ),
  );

  const mailboxUnreadStats = (mailboxUnreadStatsQuery.data ?? []) as Array<{
    accountEmail: string;
    mailboxPath: string;
    unreadCount: number;
  }>;

  const unifiedUnreadStatsQuery = useQuery(
    trpc.email.listUnifiedUnreadStats.queryOptions(
      workspaceId ? { workspaceId } : skipToken,
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
    ],
    [unifiedUnreadStats],
  );

  const messageDetailQuery = useQuery(
    trpc.email.getMessage.queryOptions(
      workspaceId && activeMessageId ? { workspaceId, id: activeMessageId } : skipToken,
    ),
  );

  const messageDetail = messageDetailQuery.data as EmailMessageDetail | undefined;

  const visibleMessages = React.useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return messages;
    // 逻辑：前端本地做关键字过滤，后续接入服务端搜索。
    return messages.filter((message) => {
      const haystack = `${message.from} ${message.subject} ${message.preview}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [messages, searchKeyword]);

  const activeMessage = React.useMemo(() => {
    if (!activeMessageId) return null;
    return visibleMessages.find((message) => message.id === activeMessageId) ?? null;
  }, [activeMessageId, visibleMessages]);

  React.useEffect(() => {
    // 逻辑：切换邮件时退出转发编辑。
    setIsForwarding(false);
    setForwardDraft(null);
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

  React.useEffect(() => {
    const target = loadMoreRef.current;
    const root = messagesListRef.current;
    if (!target || !root) return;
    if (!messagesQuery.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          messagesQuery.hasNextPage &&
          !messagesQuery.isFetchingNextPage
        ) {
          messagesQuery.fetchNextPage();
        }
      },
      { root, rootMargin: "0px 0px 120px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    messagesQuery.hasNextPage,
    messagesQuery.isFetchingNextPage,
    messagesQuery.fetchNextPage,
    messages.length,
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
      imapHost: provider.imap.host,
      imapPort: provider.imap.port,
      imapTls: provider.imap.tls,
      smtpHost: provider.smtp.host,
      smtpPort: provider.smtp.port,
      smtpTls: provider.smtp.tls,
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
    // 逻辑：调用服务端接口写入账号与密码配置。
    addAccountMutation.mutate({
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

  /** Handle unified view selection. */
  function handleSelectUnifiedView(scope: UnifiedMailboxScope, label: string) {
    // 逻辑：切换统一视图时清空账号与文件夹选择。
    setActiveView({ scope, label });
    setActiveAccountEmail(null);
    setActiveMailbox(null);
    setSearchKeyword("");
    setActiveMessageId(null);
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
  }

  /** Handle account group toggle. */
  function handleToggleAccount(accountEmail: string) {
    const key = normalizeEmail(accountEmail);
    setExpandedAccounts((prev) => ({ ...prev, [key]: !prev[key] }));
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

  const canSyncMailbox = Boolean(activeAccount?.emailAddress);
  const isSyncingMailbox = syncMailboxMutation.isPending || syncMailboxesMutation.isPending;

  const sidebar: SidebarState = {
    unifiedItems,
    activeView,
    accounts,
    accountsLoading: accountsQuery.isLoading,
    accountGroups,
    expandedAccounts,
    dragInsertTarget,
    draggingMailboxId,
    mailboxUnreadMap,
    canSyncMailbox,
    isSyncingMailbox,
    onSelectUnifiedView: handleSelectUnifiedView,
    onSelectMailbox: handleSelectMailbox,
    onToggleAccount: handleToggleAccount,
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
    messagesLoading: messagesQuery.isLoading,
    messagesFetchingNextPage: messagesQuery.isFetchingNextPage,
    hasNextPage: Boolean(messagesQuery.hasNextPage),
    messagesListRef,
    loadMoreRef,
  };

  const detail: DetailState = {
    activeMessage,
    isForwarding,
    forwardDraft,
    setForwardDraft,
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
    onStartForward: handleStartForward,
    onCancelForward: handleCancelForward,
    onToggleFlagged: handleToggleFlagged,
    onSetPrivateSender: handleSetPrivateSender,
    onRemovePrivateSender: handleRemovePrivateSender,
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
  };

  return {
    sidebar,
    messageList,
    detail,
    addDialog,
  };
}
