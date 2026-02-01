"use client";

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
import { DndProvider, useDrag, useDrop } from "react-dnd";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileText,
  Inbox,
  Lock,
  Mail,
  Unplug,
  Search,
  Send,
  Star,
  Reply,
  Forward,
  Paperclip,
  Plus,
  RefreshCw,
} from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Label } from "@tenas-ai/ui/label";
import { Switch } from "@tenas-ai/ui/switch";
import { Textarea } from "@tenas-ai/ui/textarea";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { trpc } from "@/utils/trpc";
import { dndManager } from "@/lib/dnd-manager";

type EmailAccountView = {
  /** Email address. */
  emailAddress: string;
  /** Account label. */
  label?: string;
  /** Account status. */
  status: {
    lastSyncAt?: string;
    lastError?: string | null;
  };
};

type EmailMessageSummary = {
  /** Message id. */
  id: string;
  /** Account email. */
  accountEmail: string;
  /** Mailbox key. */
  mailbox: string;
  /** Sender label. */
  from: string;
  /** Subject. */
  subject: string;
  /** Preview text. */
  preview: string;
  /** Time label. */
  time?: string;
  /** Unread flag. */
  unread: boolean;
  /** Attachment presence. */
  hasAttachments: boolean;
  /** Private sender flag. */
  isPrivate: boolean;
};

type EmailMessageDetail = {
  /** Message id. */
  id: string;
  /** Account email. */
  accountEmail: string;
  /** Mailbox key. */
  mailbox: string;
  /** Subject. */
  subject?: string;
  /** Sender list. */
  from: string[];
  /** Recipient list. */
  to: string[];
  /** Cc list. */
  cc: string[];
  /** Bcc list. */
  bcc: string[];
  /** ISO date string. */
  date?: string;
  /** HTML body. */
  bodyHtml?: string;
  /** Text body. */
  bodyText?: string;
  /** Attachment list. */
  attachments: Array<{
    filename?: string;
    contentType?: string;
    size?: number;
  }>;
  /** Flags. */
  flags: string[];
  /** From email address. */
  fromAddress?: string;
  /** Private sender flag. */
  isPrivate: boolean;
};

type ForwardDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

type EmailMailboxView = {
  /** Mailbox path. */
  path: string;
  /** Display name. */
  name: string;
  /** Parent mailbox path. */
  parentPath?: string | null;
  /** IMAP delimiter. */
  delimiter?: string;
  /** IMAP attributes. */
  attributes: string[];
  /** Sort order. */
  sort?: number;
};

type MailboxNode = EmailMailboxView & {
  children: MailboxNode[];
};

type UnifiedMailboxScope = "all-inboxes" | "flagged" | "drafts" | "sent" | "mailbox";

type UnifiedMailboxView = {
  /** View scope. */
  scope: UnifiedMailboxScope;
  /** Account email (mailbox scope). */
  accountEmail?: string;
  /** Mailbox path (mailbox scope). */
  mailbox?: string;
  /** Display label. */
  label: string;
};

type MailboxDragItem = {
  accountEmail: string;
  parentPath: string | null;
  mailboxPath: string;
};

const DEFAULT_FORM = {
  emailAddress: "",
  label: "",
  imapHost: "",
  imapPort: 993,
  imapTls: true,
  smtpHost: "",
  smtpPort: 465,
  smtpTls: true,
  password: "",
};

const MESSAGE_PAGE_SIZE = 20;

/** Normalize email address for matching. */
function normalizeEmail(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
}

/** Extract email address from display text. */
function extractEmailAddress(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0]?.trim().toLowerCase() ?? null;
}

/** Format attachment size for display. */
function formatAttachmentSize(size?: number): string | null {
  if (!Number.isFinite(size) || !size || size <= 0) return null;
  // 逻辑：按 1024 进制缩放单位。
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const formatted = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${formatted}${units[idx]}`;
}

/** Format ISO time string for display. */
function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Format message time for list display. */
function formatMessageTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
  };
  if (!sameYear) {
    options.year = "numeric";
  }
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

/** Normalize mailbox attributes for matching. */
function normalizeMailboxAttributes(attributes: string[]): string[] {
  return attributes.map((attr) => attr.trim().toUpperCase());
}

/** Check if flags contain given flag. */
function hasEmailFlag(flags: string[], target: string): boolean {
  const normalizedTarget = target.trim().toUpperCase();
  return flags.some((flag) => {
    const normalized = flag.trim().toUpperCase();
    return normalized === normalizedTarget || normalized === `\\${normalizedTarget}`;
  });
}

/** Resolve mailbox display label. */
function getMailboxLabel(mailbox: EmailMailboxView): string {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  if (attributes.includes("\\INBOX") || mailbox.path.toUpperCase() === "INBOX") {
    return "收件箱";
  }
  if (attributes.includes("\\DRAFTS") || path.includes("draft")) {
    return "草稿";
  }
  if (attributes.includes("\\SENT") || path.includes("sent")) {
    return "已发送";
  }
  if (attributes.includes("\\JUNK") || attributes.includes("\\SPAM") || path.includes("junk") || path.includes("spam")) {
    return "垃圾邮件";
  }
  if (attributes.includes("\\TRASH") || path.includes("trash") || path.includes("deleted")) {
    return "已删除";
  }
  return mailbox.name || mailbox.path;
}

function isInboxMailboxView(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  return attributes.includes("\\INBOX") || mailbox.path.toUpperCase() === "INBOX";
}

function isDraftsMailboxView(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  return attributes.includes("\\DRAFTS") || path.includes("draft");
}

function isSentMailboxView(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  return attributes.includes("\\SENT") || path.includes("sent");
}

/** Build forward subject line. */
function buildForwardSubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) return "Fwd: （无主题）";
  if (/^fwd:/i.test(trimmed)) return trimmed;
  return `Fwd: ${trimmed}`;
}

/** Build forward body content. */
function buildForwardBody(input: {
  from: string;
  to: string;
  cc: string;
  time: string;
  subject: string;
  bodyText: string;
}): string {
  const lines = [
    "",
    "",
    "---------- 转发邮件 ----------",
    `发件人: ${input.from || "—"}`,
    `日期: ${input.time || "—"}`,
    `主题: ${input.subject || "—"}`,
    `收件人: ${input.to || "—"}`,
  ];
  if (input.cc) {
    lines.push(`抄送: ${input.cc}`);
  }
  lines.push("", input.bodyText || "");
  return lines.join("\n");
}

/** Check if mailbox is selectable. */
function isMailboxSelectable(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  return !attributes.includes("\\NOSELECT");
}

/** Resolve mailbox icon based on IMAP attributes. */
function resolveMailboxIcon(mailbox: EmailMailboxView) {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  if (attributes.includes("\\INBOX") || mailbox.path.toUpperCase() === "INBOX") {
    return Inbox;
  }
  if (attributes.includes("\\SENT") || path.includes("sent")) {
    return Send;
  }
  if (attributes.includes("\\ARCHIVE") || path.includes("archive")) {
    return Archive;
  }
  return Mail;
}

/** Build mailbox tree from flat list. */
function buildMailboxTree(mailboxes: EmailMailboxView[]): MailboxNode[] {
  const nodes = mailboxes.map((mailbox) => ({ ...mailbox, children: [] as MailboxNode[] }));
  const nodeMap = new Map(nodes.map((node) => [node.path, node]));
  const roots: MailboxNode[] = [];
  nodes.forEach((node) => {
    if (node.parentPath && nodeMap.has(node.parentPath)) {
      nodeMap.get(node.parentPath)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (items: MailboxNode[]) => {
    items.sort((a, b) => {
      const sortA = a.sort ?? 999;
      const sortB = b.sort ?? 999;
      if (sortA !== sortB) return sortA - sortB;
      return a.path.localeCompare(b.path);
    });
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

/** Move array item by index. */
function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

type MailboxNodeRowProps = {
  accountEmail: string;
  parentPath: string | null;
  node: MailboxNode;
  depth: number;
  orderedIds: string[];
  orderedNodes: MailboxNode[];
  dragInsertTarget: {
    accountEmail: string;
    parentPath: string | null;
    mailboxPath: string;
    position: "before" | "after";
  } | null;
  draggingId: string | null;
  isActive: boolean;
  selectable: boolean;
  count: number;
  onSelectMailbox: (accountEmail: string, mailboxPath: string, label: string) => void;
  onHover: (input: {
    accountEmail: string;
    parentPath: string | null;
    overId: string;
    position: "before" | "after";
  }) => void;
  onClearHover: (input: { accountEmail: string; parentPath: string | null }) => void;
  onDrop: (input: {
    accountEmail: string;
    parentPath: string | null;
    activeId: string;
    overId: string;
    position: "before" | "after";
    orderedIds: string[];
  }) => void;
  onDragStart: (mailboxId: string) => void;
  onDragEnd: () => void;
  children?: React.ReactNode;
};

function MailboxNodeRow({
  accountEmail,
  parentPath,
  node,
  depth,
  orderedIds,
  orderedNodes,
  dragInsertTarget,
  draggingId,
  isActive,
  selectable,
  count,
  onSelectMailbox,
  onHover,
  onClearHover,
  onDrop,
  onDragStart,
  onDragEnd,
  children,
}: MailboxNodeRowProps) {
  const Icon = resolveMailboxIcon(node);
  const [, dragRef] = useDrag(
    () => ({
      type: "email-mailbox-item",
      item: () => {
        onDragStart(node.path);
        return {
          accountEmail,
          parentPath,
          mailboxPath: node.path,
        } as MailboxDragItem;
      },
      end: () => {
        onClearHover({ accountEmail, parentPath });
        onDragEnd();
      },
    }),
    [accountEmail, parentPath, node.path, orderedNodes, onDragStart, onDragEnd],
  );
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const [, dropRef] = useDrop(
    () => ({
      accept: "email-mailbox-item",
      hover: (item: MailboxDragItem, monitor) => {
        if (
          item.accountEmail !== accountEmail ||
          item.parentPath !== parentPath ||
          item.mailboxPath === node.path
        ) {
          return;
        }
        const hoverRect = rowRef.current?.getBoundingClientRect();
        const clientOffset = monitor.getClientOffset();
        let position: "before" | "after" = "after";
        if (clientOffset && hoverRect) {
          const hoverMiddleY = (hoverRect.bottom - hoverRect.top) / 2;
          const hoverClientY = clientOffset.y - hoverRect.top;
          position = hoverClientY < hoverMiddleY ? "before" : "after";
        }
        onHover({ accountEmail, parentPath, overId: node.path, position });
      },
      drop: (item: MailboxDragItem) => {
        if (
          item.accountEmail !== accountEmail ||
          item.parentPath !== parentPath ||
          item.mailboxPath === node.path
        ) {
          return;
        }
        const position =
          dragInsertTarget?.mailboxPath === node.path &&
          dragInsertTarget.accountEmail === accountEmail &&
          dragInsertTarget.parentPath === parentPath
            ? dragInsertTarget.position
            : "after";
        onDrop({
          accountEmail,
          parentPath,
          activeId: item.mailboxPath,
          overId: node.path,
          position,
          orderedIds,
        });
      },
    }),
    [
      accountEmail,
      parentPath,
      node.path,
      orderedIds,
      dragInsertTarget,
      onDrop,
      onHover,
    ],
  );
  const isDraggingSelf = draggingId === node.path;
  const showBefore =
    dragInsertTarget?.mailboxPath === node.path && dragInsertTarget.position === "before";
  const showAfter =
    dragInsertTarget?.mailboxPath === node.path && dragInsertTarget.position === "after";
  return (
    <div
      key={node.path}
      className="space-y-1"
      ref={(el) => {
        rowRef.current = el;
        dropRef(dragRef(el));
      }}
    >
      {showBefore ? (
        <div
          className="h-[2px] w-full rounded-full bg-[var(--brand)]/70"
          style={{ marginLeft: `${8 + depth * 12}px` }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (selectable) onSelectMailbox(accountEmail, node.path, getMailboxLabel(node));
        }}
        disabled={!selectable}
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          opacity: isDraggingSelf ? 0.4 : 1,
        }}
        className={`flex w-full items-center justify-between rounded-lg pr-2 py-1.5 text-xs transition ${
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/40"
        } ${selectable ? "" : "cursor-not-allowed opacity-60"}`}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {getMailboxLabel(node)}
        </span>
        {count > 0 ? <span className="text-[11px]">{count}</span> : null}
      </button>
      {showAfter ? (
        <div
          className="h-[2px] w-full rounded-full bg-[var(--brand)]/70"
          style={{ marginLeft: `${8 + depth * 12}px` }}
        />
      ) : null}
      {children}
    </div>
  );
}

export default function EmailPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
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
  const [dragInsertTarget, setDragInsertTarget] = React.useState<{
    accountEmail: string;
    parentPath: string | null;
    mailboxPath: string;
    position: "before" | "after";
  } | null>(null);
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
        queryClient.setQueryData(context.queryKey, context.previous);
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
            context.previousUnifiedMessages,
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

  /** Validate add-account form and return error message. */
  function validateFormState(): string | null {
    const email = formState.emailAddress.trim();
    if (!email || !email.includes("@")) return "请填写有效的邮箱地址。";
    if (!formState.imapHost.trim()) return "请填写 IMAP 服务器地址。";
    if (!formState.smtpHost.trim()) return "请填写 SMTP 服务器地址。";
    if (!formState.password.trim()) return "请填写应用专用密码。";
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
  function handleHoverMailbox(input: {
    accountEmail: string;
    parentPath: string | null;
    overId: string;
    position: "before" | "after";
  }) {
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
  function handleClearHover(input: { accountEmail: string; parentPath: string | null }) {
    const key = getMailboxOrderKey(input.accountEmail, input.parentPath);
    const last = mailboxDragHoverRef.current;
    if (last?.key === key) {
      mailboxDragHoverRef.current = null;
    }
    setDragInsertTarget(null);
  }

  /** Handle drop reorder. */
  function handleDropMailboxOrder(input: {
    accountEmail: string;
    parentPath: string | null;
    activeId: string;
    overId: string;
    position: "before" | "after";
    orderedIds: string[];
    orderedNodes: MailboxNode[];
  }) {
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

  /** Render mailbox tree nodes. */
  function renderMailboxNodes(
    accountEmail: string,
    nodes: MailboxNode[],
    depth = 0,
    parentPath: string | null = null,
  ): React.ReactNode {
    const orderedNodes = resolveOrderedMailboxNodes(accountEmail, parentPath, nodes);
    const orderedIds = orderedNodes.map((node) => node.path);
    return orderedNodes.map((node) => {
      const isActive =
        activeView.scope === "mailbox" &&
        normalizeEmail(activeView.accountEmail ?? "") === normalizeEmail(accountEmail) &&
        activeView.mailbox === node.path;
      const selectable = isMailboxSelectable(node);
      const count =
        mailboxUnreadMap.get(`${normalizeEmail(accountEmail)}::${node.path}`) ?? 0;
      return (
        <MailboxNodeRow
          key={node.path}
          accountEmail={accountEmail}
          parentPath={parentPath}
          node={node}
          depth={depth}
          orderedIds={orderedIds}
          orderedNodes={orderedNodes}
          dragInsertTarget={dragInsertTarget}
          draggingId={draggingMailboxId}
          isActive={isActive}
          selectable={selectable}
          count={count}
          onSelectMailbox={handleSelectMailbox}
          onHover={handleHoverMailbox}
          onClearHover={handleClearHover}
          onDrop={handleDropMailboxOrder}
          onDragStart={(mailboxId) => setDraggingMailboxId(mailboxId)}
          onDragEnd={() => setDraggingMailboxId(null)}
        >
          {node.children.length ? (
            <div className="space-y-1">
              {renderMailboxNodes(accountEmail, node.children, depth + 1, node.path)}
            </div>
          ) : null}
        </MailboxNodeRow>
      );
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full min-w-0 flex-col gap-4 border-b border-border bg-card p-3 text-sm lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground">邮箱</div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={handleSyncMailbox}
                disabled={
                  !activeAccount ||
                  syncMailboxMutation.isPending ||
                  syncMailboxesMutation.isPending
                }
                aria-label="同步邮箱"
                title="同步邮箱"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    syncMailboxMutation.isPending || syncMailboxesMutation.isPending
                      ? "animate-spin"
                      : ""
                  }`}
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加邮箱
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              {unifiedItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView.scope === item.scope;
                return (
                  <button
                    key={item.scope}
                    type="button"
                    onClick={() => handleSelectUnifiedView(item.scope, item.label)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition ${
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </span>
                    {item.count > 0 ? (
                      <span className="text-[11px]">{item.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground">账户</div>
            {accountsQuery.isLoading ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                正在加载邮箱账号...
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                还没有绑定邮箱，点击“添加邮箱”开始配置。
              </div>
            ) : (
              <DndProvider manager={dndManager}>
                <div className="space-y-2">
                  {accountGroups.map((group) => {
                    const expanded = expandedAccounts[group.key] ?? true;
                    return (
                      <div key={group.account.emailAddress} className="rounded-md py-2">
                        <button
                          type="button"
                          onClick={() => handleToggleAccount(group.account.emailAddress)}
                          className="flex w-full items-center justify-between text-xs text-muted-foreground"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <span className="truncate font-semibold text-foreground">
                              {group.account.label ?? group.account.emailAddress}
                            </span>
                          </span>
                          {group.account.status?.lastError ? (
                            <Unplug className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : null}
                        </button>
                        {expanded ? (
                          <div className="mt-2 space-y-1">
                            {group.isLoading ? (
                              <div className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-2 text-[11px] text-muted-foreground">
                                正在加载文件夹...
                              </div>
                            ) : group.mailboxTree.length ? (
                              <div className="space-y-1">
                                {renderMailboxNodes(
                                  group.account.emailAddress,
                                  group.mailboxTree,
                                )}
                              </div>
                            ) : (
                              <div className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-2 text-[11px] text-muted-foreground">
                                暂无文件夹，点击同步获取。
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </DndProvider>
            )}
          </div>
        </aside>

        <section className="flex w-full min-w-0 flex-col border-b border-border bg-background p-3 lg:w-80 lg:border-b-0 lg:border-r min-h-0">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索邮件"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{activeMailboxLabel || "文件夹"}</span>
            <span>{visibleMessages.length} 封</span>
          </div>
          <div
            ref={messagesListRef}
            className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 text-sm show-scrollbar"
          >
            {messagesQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
                正在加载邮件...
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
                暂无邮件
              </div>
            ) : (
              <>
                {visibleMessages.map((mail) => {
                  const isActive = mail.id === activeMessageId;
                  return (
                    <button
                      key={mail.id}
                      type="button"
                      onClick={() => handleSelectMessage(mail)}
                      className={`w-full rounded-lg border px-2 py-3 text-left transition ${
                        isActive
                          ? "border-border bg-muted text-foreground"
                          : "border-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {mail.isPrivate ? (
                          <Lock className="h-3 w-3 text-[var(--brand)]" />
                        ) : null}
                        {mail.unread ? (
                          <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
                        ) : null}
                        <span className="line-clamp-1">{mail.subject}</span>
                      </div>
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {mail.from}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDateTime(mail.time ?? "")}</span>
                        {mail.hasAttachments ? (
                          <Paperclip className="h-3 w-3" />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
                <div ref={loadMoreRef} className="h-6" />
                {messagesQuery.isFetchingNextPage ? (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    正在加载更多...
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-card min-h-0">
          {activeMessage ? (
            isForwarding && forwardDraft ? (
              <>
                <div className="border-b border-border bg-background px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">转发</div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        disabled
                        title="暂未接入发送能力"
                      >
                        发送
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={handleCancelForward}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">收件人</span>
                      <Input
                        value={forwardDraft.to}
                        onChange={(event) =>
                          setForwardDraft((prev) =>
                            prev ? { ...prev, to: event.target.value } : prev,
                          )
                        }
                        placeholder="输入收件人"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">抄送</span>
                      <Input
                        value={forwardDraft.cc}
                        onChange={(event) =>
                          setForwardDraft((prev) =>
                            prev ? { ...prev, cc: event.target.value } : prev,
                          )
                        }
                        placeholder="抄送"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">密送</span>
                      <Input
                        value={forwardDraft.bcc}
                        onChange={(event) =>
                          setForwardDraft((prev) =>
                            prev ? { ...prev, bcc: event.target.value } : prev,
                          )
                        }
                        placeholder="密送"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">主题</span>
                      <Input
                        value={forwardDraft.subject}
                        onChange={(event) =>
                          setForwardDraft((prev) =>
                            prev ? { ...prev, subject: event.target.value } : prev,
                          )
                        }
                        placeholder="主题"
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                  <div className="border-b border-border px-4 py-3">
                    <Textarea
                      value={forwardDraft.body}
                      onChange={(event) =>
                        setForwardDraft((prev) =>
                          prev ? { ...prev, body: event.target.value } : prev,
                        )
                      }
                      className="min-h-[260px] text-xs leading-5"
                    />
                  </div>
                  {shouldShowAttachments ? (
                    <div className="border-b border-border px-4 py-3">
                      <div className="text-xs text-muted-foreground">附件</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {messageDetailQuery.isLoading ? (
                          <span className="text-xs text-muted-foreground">
                            附件加载中...
                          </span>
                        ) : (
                          messageDetail?.attachments?.map((attachment, index) => {
                            const sizeLabel = formatAttachmentSize(attachment.size);
                            return (
                              <span
                                key={`${attachment.filename ?? "attachment"}-${index}`}
                                className="rounded-md border border-border bg-background px-2 py-1"
                              >
                                {attachment.filename ?? "未命名附件"}
                                {sizeLabel ? ` · ${sizeLabel}` : ""}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border bg-background px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {isPrivate ? (
                        <Lock className="h-3.5 w-3.5 text-[var(--brand)]" />
                      ) : null}
                      <span className="truncate">{detailSubject}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="min-w-0 space-y-0.5 text-[11px] leading-4">
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div className="flex items-center gap-1 truncate">
                              {isPrivate ? (
                                <Lock className="h-3 w-3 text-[var(--brand)]" />
                              ) : null}
                              <span className="truncate">{detailFrom}</span>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-40">
                            <ContextMenuItem
                              onClick={handleSetPrivateSender}
                              disabled={!detailFromAddress || isPrivate}
                            >
                              设为私密发件人
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={handleRemovePrivateSender}
                              disabled={!detailFromAddress || !isPrivate}
                            >
                              取消私密发件人
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                        <div className="truncate">{detailTime}</div>
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px]"
                        >
                          <Reply className="h-3 w-3" />
                          回复
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px]"
                          onClick={handleStartForward}
                        >
                          <Forward className="h-3 w-3" />
                          转发
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-7 gap-1 px-2 text-[11px] ${
                            isFlagged
                              ? "border-[var(--brand)]/40 text-[var(--brand)]"
                              : ""
                          }`}
                          onClick={handleToggleFlagged}
                        >
                          <Star
                            className={`h-3 w-3 ${
                              isFlagged ? "fill-[var(--brand)]" : ""
                            }`}
                          />
                          收藏
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                  <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0">收件人</span>
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {detailTo}
                      </span>
                    </div>
                    {hasCc ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="shrink-0">抄送</span>
                        <span className="min-w-0 truncate">{detailCc}</span>
                      </div>
                    ) : null}
                    {hasBcc ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="shrink-0">密送</span>
                        <span className="min-w-0 truncate">{detailBcc}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="border-b border-border px-8 py-4 text-sm leading-6 text-foreground">
                    {messageDetailQuery.isLoading ? (
                      <div className="text-xs text-muted-foreground">
                        正在加载邮件详情...
                      </div>
                    ) : messageDetail?.bodyHtml ? (
                      <div
                        className="prose prose-sm max-w-none text-foreground prose-img:max-w-full"
                        dangerouslySetInnerHTML={{ __html: messageDetail.bodyHtml }}
                      />
                    ) : (
                      <p className="break-words">
                        {messageDetail?.bodyText || activeMessage.preview || "暂无正文"}
                      </p>
                    )}
                  </div>
                  {shouldShowAttachments ? (
                    <div className="border-b border-border px-4 py-3">
                      <div className="text-xs text-muted-foreground">附件</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {messageDetailQuery.isLoading ? (
                          <span className="text-xs text-muted-foreground">
                            附件加载中...
                          </span>
                        ) : (
                          messageDetail?.attachments?.map((attachment, index) => {
                            const sizeLabel = formatAttachmentSize(attachment.size);
                            return (
                              <span
                                key={`${attachment.filename ?? "attachment"}-${index}`}
                                className="rounded-md border border-border bg-background px-2 py-1"
                              >
                                {attachment.filename ?? "未命名附件"}
                                {sizeLabel ? ` · ${sizeLabel}` : ""}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              选择一封邮件以查看详情
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) resetFormState();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加邮箱账号</DialogTitle>
            <DialogDescription>填写 IMAP/SMTP 与应用专用密码进行连接。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>邮箱地址</Label>
              <Input
                value={formState.emailAddress}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, emailAddress: event.target.value }))
                }
                placeholder="name@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>账号名称</Label>
              <Input
                value={formState.label}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, label: event.target.value }))
                }
                placeholder="工作邮箱 / 客服邮箱"
              />
            </div>
            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold text-muted-foreground">IMAP 配置</div>
              <div className="grid gap-2">
                <Label>IMAP 主机</Label>
                <Input
                  value={formState.imapHost}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, imapHost: event.target.value }))
                  }
                  placeholder="imap.example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>IMAP 端口</Label>
                  <Input
                    type="number"
                    value={formState.imapPort}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        imapPort: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
                  <span>IMAP 加密</span>
                  <Switch
                    checked={formState.imapTls}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, imapTls: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold text-muted-foreground">SMTP 配置</div>
              <div className="grid gap-2">
                <Label>SMTP 主机</Label>
                <Input
                  value={formState.smtpHost}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, smtpHost: event.target.value }))
                  }
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>SMTP 端口</Label>
                  <Input
                    type="number"
                    value={formState.smtpPort}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        smtpPort: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
                  <span>SMTP 加密</span>
                  <Switch
                    checked={formState.smtpTls}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, smtpTls: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>应用专用密码</Label>
              <Input
                type="password"
                value={formState.password}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="输入应用专用密码"
              />
            </div>

            {formError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {formError}
              </div>
            ) : null}
            {testStatus === "ok" ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                连接测试通过，可以保存账号。
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testStatus === "checking"}
            >
              {testStatus === "checking" ? "测试中..." : "测试连接"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={handleAddAccount} disabled={addAccountMutation.isPending}>
              {addAccountMutation.isPending ? "保存中..." : "保存账号"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
