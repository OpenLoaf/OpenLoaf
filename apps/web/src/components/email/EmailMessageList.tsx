/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  MailOpen,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Rows3,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openloaf/ui/alert-dialog";
import { Button } from "@openloaf/ui/button";
import { Checkbox } from "@openloaf/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Input } from "@openloaf/ui/input";
import { cn } from "@/lib/utils";
import {
  EMAIL_DIVIDER_CLASS,
  EMAIL_FLAT_INPUT_CLASS,
  EMAIL_LIST_SURFACE_CLASS,
  EMAIL_LIST_READ_ROW_CLASS,
  EMAIL_LIST_UNREAD_ROW_CLASS,
  EMAIL_SPLIT_PANEL_CLASS,
  EMAIL_TONE_ACTIVE_CLASS,
  EMAIL_TONE_HOVER_CLASS,
  EMAIL_DENSITY_ROW_HEIGHT,
  EMAIL_DENSITY_TEXT_SIZE,
  type EmailDensity,
} from "./email-style-system";
import type { EmailMessageSummary } from "./email-types";
import type { MessageListState } from "./use-email-page-state";
import { formatMessageTime } from "./email-utils";

type EmailMessageListProps = {
  messageList: MessageListState;
  onMessageOpen?: (message: EmailMessageSummary) => void;
};

export function EmailMessageList({
  messageList,
  onMessageOpen,
}: EmailMessageListProps) {
  const { t } = useTranslation('common');
  const { hasSelection, isAllSelected, selectedIds } = messageList

  const densityLabels: Record<EmailDensity, string> = {
    compact: t('email.densityCompact'),
    default: t('email.densityDefault'),
    comfortable: t('email.densityComfortable'),
  }
  const densityCycle: EmailDensity[] = ['compact', 'default', 'comfortable']
  const handleCycleDensity = () => {
    const idx = densityCycle.indexOf(messageList.density)
    const next = densityCycle[(idx + 1) % densityCycle.length]!
    messageList.onSetDensity(next)
  }

  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden p-0",
        EMAIL_SPLIT_PANEL_CLASS,
      )}
    >
      <div className={cn("relative border-b px-3 py-2.5", EMAIL_DIVIDER_CLASS)}>
        {messageList.isRefreshing ? (
          <div className="absolute left-0 right-0 top-0 z-10 h-0.5 overflow-hidden bg-muted">
            <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-ol-blue" />
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          {/* 全选 checkbox */}
          <div className="flex h-8 w-8 items-center justify-center">
            <Checkbox
              checked={isAllSelected ? true : hasSelection ? "indeterminate" : false}
              onCheckedChange={() => messageList.onToggleSelectAll()}
              aria-label={t('email.selectAll')}
              className="h-3.5 w-3.5"
            />
          </div>

          {hasSelection ? (
            <>
              <span className="ml-1 text-xs text-ol-text-auxiliary">
                {t('email.selectedCount', { count: selectedIds.size })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => messageList.onBatchArchive()}
                disabled={messageList.batchActionPending}
                title={t('email.archive')}
                className={cn(
                  "h-8 w-8 rounded-full text-ol-amber transition-colors duration-150",
                  "hover:bg-muted/58 dark:hover:bg-muted/46",
                )}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => messageList.onBatchDelete()}
                disabled={messageList.batchActionPending}
                title={t('delete')}
                className={cn(
                  "h-8 w-8 rounded-full text-ol-red transition-colors duration-150",
                  "hover:bg-muted/58 dark:hover:bg-muted/46",
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={messageList.batchActionPending}
                    className={cn(
                      "h-8 w-8 rounded-full text-ol-purple transition-colors duration-150",
                      "hover:bg-muted/58 dark:hover:bg-muted/46",
                    )}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => messageList.onBatchMarkRead()}>
                    <MailOpen className="mr-2 h-3.5 w-3.5" />
                    {t('email.markAsRead')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                className={cn(
                  "h-8 w-8 rounded-full text-ol-amber transition-colors duration-150",
                  "hover:bg-muted/58 dark:hover:bg-muted/46",
                )}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => messageList.onRefresh()}
                disabled={messageList.isRefreshing}
                title={t('refresh')}
                className={cn(
                  "h-8 w-8 rounded-full text-ol-green transition-colors duration-150",
                  "hover:bg-muted/58 dark:hover:bg-muted/46",
                )}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", messageList.isRefreshing && "animate-spin")} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                className={cn(
                  "h-8 w-8 rounded-full text-ol-purple transition-colors duration-150",
                  "hover:bg-muted/58 dark:hover:bg-muted/46",
                )}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1 text-xs text-ol-text-auxiliary">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCycleDensity}
              title={t('email.densityLabel', { label: densityLabels[messageList.density] })}
              className={cn(
                "h-7 w-7 rounded-full text-ol-text-auxiliary transition-colors duration-150",
                "hover:bg-muted/58",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </Button>
            <span>{t('email.messageCount', { count: messageList.visibleMessages.length })}</span>
            <ChevronLeft className="h-3.5 w-3.5" />
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2 relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ol-text-auxiliary" />
          <Input
            value={messageList.searchKeyword}
            onChange={(event) => messageList.setSearchKeyword(event.target.value)}
            placeholder={t('email.searchPlaceholder')}
            className={cn("h-9 rounded-full pl-9 text-xs", EMAIL_FLAT_INPUT_CLASS)}
          />
          {messageList.isSearching ? (
            <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-ol-text-auxiliary" />
          ) : null}
        </div>
      </div>
      <div
        ref={messageList.messagesListRef}
        className={cn(
          "flex h-full min-h-0 flex-1 flex-col overflow-y-auto pb-16 text-sm scrollbar-hide",
          EMAIL_LIST_SURFACE_CLASS,
        )}
      >
        {messageList.messagesLoading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {t('email.loadingMessages')}
          </div>
        ) : messageList.visibleMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {t('email.noMessages')}
          </div>
        ) : (
          <>
            {messageList.visibleMessages.map((mail) => {
              const isActive = mail.id === messageList.activeMessageId;
              const isSelected = selectedIds.has(mail.id);
              const rowTime = formatMessageTime(mail.time ?? "");
              return (
                <div
                  key={mail.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    messageList.onSelectMessage(mail);
                    onMessageOpen?.(mail);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      messageList.onSelectMessage(mail);
                      onMessageOpen?.(mail);
                    }
                  }}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[68px_minmax(128px,220px)_minmax(0,1fr)_72px] items-center gap-2 border-b px-3 text-left transition-colors duration-150",
                    EMAIL_DENSITY_ROW_HEIGHT[messageList.density],
                    EMAIL_DIVIDER_CLASS,
                    isSelected
                      ? "bg-ol-blue-bg"
                      : isActive
                        ? EMAIL_TONE_ACTIVE_CLASS
                        : cn(
                            mail.unread ? EMAIL_LIST_UNREAD_ROW_CLASS : EMAIL_LIST_READ_ROW_CLASS,
                            EMAIL_TONE_HOVER_CLASS,
                          ),
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        messageList.onToggleSelect(mail.id, e.shiftKey);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.stopPropagation();
                          e.preventDefault();
                          messageList.onToggleSelect(mail.id);
                        }
                      }}
                      className="flex items-center justify-center"
                    >
                      <Checkbox
                        checked={isSelected}
                        tabIndex={-1}
                        className="h-3.5 w-3.5 pointer-events-none"
                      />
                    </div>
                    <Star className="h-3.5 w-3.5 shrink-0 text-ol-amber" />
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        mail.unread ? "bg-ol-blue" : "bg-transparent",
                      )}
                    />
                  </div>
                  <div
                    className={cn(
                      "truncate",
                      EMAIL_DENSITY_TEXT_SIZE[messageList.density],
                      mail.unread
                        ? "font-semibold text-ol-text-primary"
                        : "font-medium text-ol-text-secondary",
                    )}
                  >
                    {mail.from}
                  </div>
                  <div className={cn("min-w-0 truncate text-ol-text-auxiliary", EMAIL_DENSITY_TEXT_SIZE[messageList.density])}>
                    <span
                      className={cn(
                        mail.unread
                          ? "font-semibold text-ol-text-primary"
                          : "text-ol-text-secondary",
                      )}
                    >
                      {mail.subject || t('email.noSubject')}
                    </span>
                    <span className="text-ol-text-auxiliary">
                      {" "}
                      - {mail.preview || t('email.noPreview')}
                    </span>
                    {mail.hasAttachments ? (
                      <span className="ml-2 inline-flex items-center text-ol-purple">
                        <Paperclip className="h-3 w-3" />
                      </span>
                    ) : null}
                    {mail.isPrivate ? (
                      <span className="ml-2 inline-flex items-center text-ol-green">
                        <Lock className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "truncate text-right text-xs",
                      mail.unread
                        ? "font-semibold text-ol-text-primary"
                        : "text-ol-text-auxiliary",
                    )}
                  >
                    {rowTime}
                  </div>
                </div>
              );
            })}
            <div ref={messageList.loadMoreRef} className="h-6" />
            {messageList.messagesFetchingNextPage ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                {t('email.loadingMore')}
              </div>
            ) : messageList.visibleMessages.length > 0 && !messageList.hasNextPage ? (
              <div className="py-2 text-center text-xs text-muted-foreground/70">
                {t('email.noMoreMessages')}
              </div>
            ) : null}
          </>
        )}
      </div>

      <AlertDialog open={messageList.batchDeleteConfirmOpen} onOpenChange={messageList.onBatchDeleteConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('email.batchDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('email.batchDeleteDesc', { count: messageList.selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={messageList.onBatchDeleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
