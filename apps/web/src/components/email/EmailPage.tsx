"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient, skipToken } from "@tanstack/react-query";
import { Archive, Inbox, Mail, Search, Send, Plus, RefreshCw } from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
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
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { trpc } from "@/utils/trpc";

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
};

type MailboxNode = EmailMailboxView & {
  children: MailboxNode[];
};

type MailboxStat = {
  /** Mailbox path. */
  mailbox: string;
  /** Message count. */
  count: number;
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

/** Normalize email address for matching. */
function normalizeEmail(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
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

/** Format sync time label. */
function formatSyncLabel(value?: string): string {
  if (!value) return "未同步";
  return `同步 ${formatDateTime(value)}`;
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

/** Resolve mailbox display label. */
function getMailboxLabel(mailbox: EmailMailboxView): string {
  return mailbox.name || mailbox.path;
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
    items.sort((a, b) => a.path.localeCompare(b.path));
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

/** Resolve default mailbox path. */
function resolveDefaultMailboxPath(mailboxes: EmailMailboxView[]): string | null {
  if (!mailboxes.length) return null;
  const inbox =
    mailboxes.find((mailbox) =>
      normalizeMailboxAttributes(mailbox.attributes ?? []).includes("\\INBOX"),
    ) ?? mailboxes.find((mailbox) => mailbox.path.toUpperCase() === "INBOX");
  if (inbox) return inbox.path;
  const selectable = mailboxes.find((mailbox) => isMailboxSelectable(mailbox));
  return selectable?.path ?? mailboxes[0]?.path ?? null;
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
  const [activeAccountEmail, setActiveAccountEmail] = React.useState<string | null>(null);
  // 当前选中的邮箱文件夹。
  const [activeMailbox, setActiveMailbox] = React.useState<string | null>("INBOX");
  // 邮件搜索关键字。
  const [searchKeyword, setSearchKeyword] = React.useState("");
  // 当前选中的邮件 ID。
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
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

  const accountsQuery = useQuery(
    trpc.email.listAccounts.queryOptions(
      workspaceId ? { workspaceId } : skipToken,
    ),
  );

  const accounts = (accountsQuery.data ?? []) as EmailAccountView[];

  const activeAccount = React.useMemo(() => {
    if (!accounts.length) return null;
    if (activeAccountEmail) {
      return (
        accounts.find(
          (account) => normalizeEmail(account.emailAddress) === activeAccountEmail,
        ) ?? accounts[0]
      );
    }
    return accounts[0];
  }, [accounts, activeAccountEmail]);

  const messagesQuery = useQuery(
    trpc.email.listMessages.queryOptions(
      workspaceId && activeAccount?.emailAddress && activeMailbox
        ? {
            workspaceId,
            accountEmail: activeAccount.emailAddress,
            mailbox: activeMailbox,
          }
        : skipToken,
    ),
  );

  const messages = (messagesQuery.data ?? []) as EmailMessageSummary[];

  const mailboxesQuery = useQuery(
    trpc.email.listMailboxes.queryOptions(
      workspaceId && activeAccount?.emailAddress
        ? { workspaceId, accountEmail: activeAccount.emailAddress }
        : skipToken,
    ),
  );

  const mailboxes = (mailboxesQuery.data ?? []) as EmailMailboxView[];

  const mailboxStatsQuery = useQuery(
    trpc.email.listMailboxStats.queryOptions(
      workspaceId && activeAccount?.emailAddress
        ? { workspaceId, accountEmail: activeAccount.emailAddress }
        : skipToken,
    ),
  );

  const mailboxStats = (mailboxStatsQuery.data ?? []) as MailboxStat[];

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

  const mailboxTree = React.useMemo(() => buildMailboxTree(mailboxes), [mailboxes]);

  const activeMailboxLabel = React.useMemo(() => {
    if (!activeMailbox) return "";
    const current = mailboxes.find((mailbox) => mailbox.path === activeMailbox);
    return current ? getMailboxLabel(current) : activeMailbox;
  }, [mailboxes, activeMailbox]);

  // 逻辑：汇总每个邮箱的本地统计数量，父级汇总子级数量。
  const mailboxCounts = React.useMemo(() => {
    const baseCounts: Record<string, number> = {};
    mailboxStats.forEach((stat) => {
      if (Number.isFinite(stat.count)) {
        baseCounts[stat.mailbox] = stat.count;
      }
    });
    const result: Record<string, number> = { ...baseCounts };
    const walk = (node: MailboxNode): number => {
      let total = baseCounts[node.path] ?? 0;
      node.children.forEach((child) => {
        total += walk(child);
      });
      result[node.path] = total;
      return total;
    };
    mailboxTree.forEach((node) => walk(node));
    if (activeMailbox && result[activeMailbox] === undefined) {
      result[activeMailbox] = messages.length;
    }
    return result;
  }, [mailboxStats, mailboxTree, activeMailbox, messages.length]);

  const activeMailboxCount = activeMailbox ? mailboxCounts[activeMailbox] ?? 0 : 0;
  const activeMailboxCountLabel = searchKeyword.trim()
    ? `${visibleMessages.length}/${activeMailboxCount}`
    : `${activeMailboxCount}`;

  const detailSubject = messageDetail?.subject ?? activeMessage?.subject ?? "";
  const detailFrom = messageDetail?.from?.[0] ?? activeMessage?.from ?? "";
  const detailTime =
    formatDateTime(messageDetail?.date ?? activeMessage?.time ?? "") || "—";
  const detailTo = messageDetail?.to?.length
    ? messageDetail.to.join("; ")
    : activeAccount?.emailAddress ?? "—";
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
    if (!activeAccountEmail) {
      // 逻辑：初次加载时选中第一项。
      setActiveAccountEmail(normalizeEmail(accounts[0]?.emailAddress ?? ""));
    }
  }, [accounts, activeAccountEmail]);

  React.useEffect(() => {
    // 逻辑：账号切换时重置文件夹与选中邮件。
    setActiveMailbox(null);
    setSearchKeyword("");
    setActiveMessageId(null);
  }, [activeAccount?.emailAddress]);

  React.useEffect(() => {
    if (!activeAccount?.emailAddress) return;
    const defaultPath = resolveDefaultMailboxPath(mailboxes);
    if (!defaultPath) return;
    const exists = activeMailbox
      ? mailboxes.some((mailbox) => mailbox.path === activeMailbox)
      : false;
    if (!exists) {
      setActiveMailbox(defaultPath);
    }
  }, [mailboxes, activeAccount?.emailAddress, activeMailbox]);

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
            queryKey: trpc.email.listMessages.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
              mailbox: activeMailbox,
            }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxStats.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          });
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxes.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          });
        } else if (workspaceId && activeAccount?.emailAddress) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listMailboxStats.queryOptions({
              workspaceId,
              accountEmail: activeAccount.emailAddress,
            }).queryKey,
          });
        }
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
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
      },
    }),
  );

  const markReadMutation = useMutation(
    trpc.email.markMessageRead.mutationOptions({
      onMutate: async (variables) => {
        if (!workspaceId || !activeAccount?.emailAddress || !activeMailbox) return undefined;
        const queryKey = trpc.email.listMessages.queryOptions({
          workspaceId,
          accountEmail: activeAccount.emailAddress,
          mailbox: activeMailbox,
        }).queryKey;
        const previous = queryClient.getQueryData<EmailMessageSummary[]>(queryKey);
        queryClient.setQueryData<EmailMessageSummary[] | undefined>(queryKey, (old) =>
          old?.map((item) =>
            item.id === variables.id ? { ...item, unread: false } : item,
          ),
        );
        return { queryKey, previous };
      },
      onError: (_error, _variables, context) => {
        if (!context?.queryKey) return;
        queryClient.setQueryData(context.queryKey, context.previous);
      },
      onSettled: () => {
        if (!workspaceId || !activeAccount?.emailAddress || !activeMailbox) return;
        queryClient.invalidateQueries({
          queryKey: trpc.email.listMessages.queryOptions({
            workspaceId,
            accountEmail: activeAccount.emailAddress,
            mailbox: activeMailbox,
          }).queryKey,
        });
        // 逻辑：标记已读后同步刷新侧边栏未读数。
        queryClient.invalidateQueries({
          queryKey: trpc.email.listUnreadCount.queryOptions({ workspaceId }).queryKey,
        });
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

  /** Handle account selection. */
  function handleSelectAccount(emailAddress: string) {
    setActiveAccountEmail(normalizeEmail(emailAddress));
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
  function handleSelectMailbox(next: string) {
    setActiveMailbox(next);
  }

  /** Handle message selection. */
  function handleSelectMessage(message: EmailMessageSummary) {
    setActiveMessageId(message.id);
    if (!workspaceId) return;
    if (message.unread) {
      markReadMutation.mutate({ workspaceId, id: message.id });
    }
  }

  /** Render mailbox tree nodes. */
  function renderMailboxNodes(nodes: MailboxNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const Icon = resolveMailboxIcon(node);
      const isActive = node.path === activeMailbox;
      const selectable = isMailboxSelectable(node);
      const count = mailboxCounts[node.path] ?? 0;
      return (
        <div key={node.path} className="space-y-1">
          <button
            type="button"
            onClick={() => {
              if (selectable) handleSelectMailbox(node.path);
            }}
            disabled={!selectable}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition ${
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/40"
            } ${selectable ? "" : "cursor-not-allowed opacity-60"}`}
          >
            <span className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" />
              {getMailboxLabel(node)}
            </span>
            <span className="text-[11px]">{count}</span>
          </button>
          {node.children.length ? (
            <div className="space-y-1">{renderMailboxNodes(node.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  }

  const connectedCount = accounts.length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            邮箱
          </div>
          <div className="text-xs text-muted-foreground">
            已连接 {connectedCount} 个邮箱
          </div>
          {activeAccount ? (
            <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{activeAccount.label ?? activeAccount.emailAddress}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {mailboxesQuery.isLoading ? (
              <span className="rounded-md border border-dashed border-border bg-background px-2 py-1">
                文件夹加载中
              </span>
            ) : mailboxes.length ? (
              mailboxes
                .filter((mailbox) => isMailboxSelectable(mailbox))
                .slice(0, 3)
                .map((mailbox) => (
                  <span
                    key={mailbox.path}
                    className="rounded-md border border-border bg-background px-2 py-1"
                  >
                    {getMailboxLabel(mailbox)}
                  </span>
                ))
            ) : (
              <span className="rounded-md border border-dashed border-border bg-background px-2 py-1">
                暂无文件夹
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" variant="outline" size="sm">
            写邮件
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!activeMessage}>
            回复
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!activeMessage}>
            归档
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full min-w-0 flex-col gap-4 border-b border-border bg-card p-3 text-sm lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-muted-foreground">账户</div>
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
            </div>
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
          {accountsQuery.isLoading ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              正在加载邮箱账号...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              还没有绑定邮箱，点击“添加邮箱”开始配置。
            </div>
          ) : (
            <div className="space-y-1">
              {accounts.map((account) => {
                const isActive =
                  normalizeEmail(account.emailAddress) === activeAccount?.emailAddress;
                return (
                  <button
                    key={account.emailAddress}
                    type="button"
                    onClick={() => handleSelectAccount(account.emailAddress)}
                    className={`flex w-full flex-col gap-1 rounded-lg border px-2 py-2 text-left transition ${
                      isActive
                        ? "border-border bg-muted text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">
                        {account.label ?? account.emailAddress}
                      </span>
                      <span className="text-[10px]">
                        {account.status?.lastError ? "异常" : "已连接"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{account.emailAddress}</span>
                      <span>
                        {formatSyncLabel(account.status?.lastSyncAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="text-xs font-semibold text-muted-foreground">文件夹</div>
          {mailboxesQuery.isLoading ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              正在加载文件夹...
            </div>
          ) : mailboxTree.length ? (
            <div className="space-y-1">{renderMailboxNodes(mailboxTree)}</div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              暂无文件夹，点击右上角同步获取。
            </div>
          )}

          <div className="mt-auto rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            支持多账号管理与快速切换，后续可加入规则与标签。
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
            <span>{activeMailboxCountLabel} 封</span>
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-auto pr-1 text-sm">
            {messagesQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
                正在加载邮件...
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
                暂无邮件
              </div>
            ) : (
              visibleMessages.map((mail) => {
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
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            mail.unread ? "bg-[var(--brand)]" : "bg-transparent"
                          }`}
                        />
                        <span className="truncate">{mail.from}</span>
                      </div>
                      <span className="shrink-0">
                        {formatMessageTime(mail.time ?? "")}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-1 text-sm font-medium text-foreground">
                      {mail.subject}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {mail.preview}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-card min-h-0">
          {activeMessage ? (
            <>
              <div className="border-b border-border bg-background px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">选中邮件</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{detailSubject}</span>
                      <span>{detailFrom}</span>
                      <span>{detailTime}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Button type="button" variant="outline" size="sm">
                      回复
                    </Button>
                    <Button type="button" variant="outline" size="sm">
                      转发
                    </Button>
                    <Button type="button" variant="outline" size="sm">
                      标记完成
                    </Button>
                    <Button type="button" variant="outline" size="sm">
                      加入素材
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                <div className="border-b border-border px-4 py-3">
                  <div className="text-xs text-muted-foreground">收件人</div>
                  <div className="mt-1 text-sm font-medium">{detailTo}</div>
                  {hasCc ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      抄送：{detailCc}
                    </div>
                  ) : null}
                  {hasBcc ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      密送：{detailBcc}
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
                        <span className="text-xs text-muted-foreground">附件加载中...</span>
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
                  <span>IMAP TLS</span>
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
                  <span>SMTP TLS</span>
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
