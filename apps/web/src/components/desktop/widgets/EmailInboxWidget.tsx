"use client";

import * as React from "react";
import { Lock, Paperclip, Search, Mail } from "lucide-react";
import { useInfiniteQuery, useQuery, skipToken } from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@tenas-ai/ui/input";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { formatDateTime } from "@/components/email/email-utils";
import { MESSAGE_PAGE_SIZE, type EmailMessageSummary } from "@/components/email/email-types";

/** Render unified inbox list widget. */
export default function EmailInboxWidget() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const activeTabId = useTabs((s) => s.activeTabId);
  const [searchKeyword, setSearchKeyword] = React.useState("");
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  const messagesListRef = React.useRef<HTMLDivElement | null>(null);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);

  const accountsQuery = useQuery(
    trpc.email.listAccounts.queryOptions(
      workspaceId ? { workspaceId } : skipToken,
    ),
  );
  const accounts = (accountsQuery.data ?? []) as Array<{ emailAddress: string }>;
  const hasAccounts = accounts.length > 0;

  const unifiedMessagesInput = React.useMemo(() => {
    if (!workspaceId || !hasAccounts) return null;
    return { workspaceId, scope: "all-inboxes" as const, pageSize: MESSAGE_PAGE_SIZE };
  }, [hasAccounts, workspaceId]);

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

  const visibleMessages = React.useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return messages;
    // 逻辑：前端本地做关键字过滤，后续接入服务端搜索。
    return messages.filter((message) => {
      const haystack = `${message.from} ${message.subject} ${message.preview}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [messages, searchKeyword]);

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

  /** Open the email page in stack panel. */
  const handleOpenEmailPage = React.useCallback(() => {
    if (!activeTabId) {
      toast.error("未找到当前标签页");
      return;
    }
    useTabRuntime.getState().pushStackItem(activeTabId, {
      id: "email-page",
      sourceKey: "email-page",
      component: "email-page",
      title: "邮箱",
    });
  }, [activeTabId]);

  /** Handle message selection. */
  const handleSelectMessage = React.useCallback(
    (message: EmailMessageSummary) => {
      setActiveMessageId(message.id);
      handleOpenEmailPage();
    },
    [handleOpenEmailPage],
  );

  const isLoading = accountsQuery.isLoading || messagesQuery.isLoading;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">收件箱</div>
          <div className="text-xs text-muted-foreground">
            {isLoading ? "加载中…" : `${visibleMessages.length} 封`}
          </div>
        </div>
      </div>
      <div className="mt-3 relative">
        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder="搜索邮件"
          className="h-8 pl-8 text-xs"
        />
      </div>
      <div
        ref={messagesListRef}
        className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 text-sm show-scrollbar"
      >
        {!workspaceId ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            未找到工作区
          </div>
        ) : accountsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            正在加载账号...
          </div>
        ) : !hasAccounts ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            <div>未配置邮箱账号</div>
            <button
              type="button"
              onClick={handleOpenEmailPage}
              className="text-xs text-[var(--brand)] hover:underline"
            >
              去邮箱设置
            </button>
          </div>
        ) : messagesQuery.isLoading ? (
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
                  className={cn(
                    "min-h-[92px] w-full rounded-lg border px-2 py-3 text-left transition",
                    isActive
                      ? "border-border bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/40",
                  )}
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
                    {mail.hasAttachments ? <Paperclip className="h-3 w-3" /> : null}
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
  );
}
