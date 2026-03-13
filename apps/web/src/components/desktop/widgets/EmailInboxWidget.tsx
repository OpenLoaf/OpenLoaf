/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Lock, Paperclip, Search, Mail } from "lucide-react";
import { useInfiniteQuery, useQuery, skipToken } from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@openloaf/ui/input";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { useLayoutState } from "@/hooks/use-layout-state";
import { formatDateTime } from "@/components/email/email-utils";
import { MESSAGE_PAGE_SIZE, type EmailMessageSummary } from "@/components/email/email-types";

/** Render unified inbox list widget. */
export default function EmailInboxWidget() {
  const { t } = useTranslation('desktop');
  const [searchKeyword, setSearchKeyword] = React.useState("");
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  const messagesListRef = React.useRef<HTMLDivElement | null>(null);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);

  const accountsQuery = useQuery(
    trpc.email.listAccounts.queryOptions({}),
  );
  const accounts = (accountsQuery.data ?? []) as Array<{ emailAddress: string }>;
  const hasAccounts = accounts.length > 0;

  const unifiedMessagesInput = React.useMemo(() => {
    if (!hasAccounts) return null;
    return { scope: "all-inboxes" as const, pageSize: MESSAGE_PAGE_SIZE };
  }, [hasAccounts]);

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
    useLayoutState.getState().pushStackItem({
      id: "email-page",
      sourceKey: "email-page",
      component: "email-page",
      title: t('emailInbox.emailPage'),
    });
  }, [t]);

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
          <div className="text-sm font-semibold text-foreground">{t('emailInbox.title')}</div>
          <div className="text-xs text-muted-foreground">
            {isLoading ? t('emailInbox.loading') : t('emailInbox.messageCount', { count: visibleMessages.length })}
          </div>
        </div>
      </div>
      <div className="mt-3 relative">
        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder={t('emailInbox.searchPlaceholder')}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <div
        ref={messagesListRef}
        className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 text-sm show-scrollbar"
      >
        {accountsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            {t('emailInbox.loadingAccounts')}
          </div>
        ) : !hasAccounts ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            <div>{t('emailInbox.noAccount')}</div>
            <button
              type="button"
              onClick={handleOpenEmailPage}
              className="text-xs text-[var(--brand)] hover:underline"
            >
              {t('emailInbox.configureEmail')}
            </button>
          </div>
        ) : messagesQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            {t('emailInbox.loadingMessages')}
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            {t('emailInbox.noMessages')}
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
                {t('emailInbox.loadingMore')}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
