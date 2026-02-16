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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tenas-ai/ui/alert-dialog";
import { Button } from "@tenas-ai/ui/button";
import { Checkbox } from "@tenas-ai/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@tenas-ai/ui/dropdown-menu";
import { Input } from "@tenas-ai/ui/input";
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
  const { hasSelection, isAllSelected, selectedIds } = messageList

  const densityLabels: Record<EmailDensity, string> = {
    compact: '紧凑',
    default: '默认',
    comfortable: '宽松',
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
            <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[#1a73e8] dark:bg-sky-400" />
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          {/* 全选 checkbox */}
          <div className="flex h-8 w-8 items-center justify-center">
            <Checkbox
              checked={isAllSelected ? true : hasSelection ? "indeterminate" : false}
              onCheckedChange={() => messageList.onToggleSelectAll()}
              aria-label="全选"
              className="h-3.5 w-3.5"
            />
          </div>

          {hasSelection ? (
            <>
              <span className="ml-1 text-xs text-[#5f6368] dark:text-slate-400">
                已选 {selectedIds.size} 封
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => messageList.onBatchArchive()}
                disabled={messageList.batchActionPending}
                title="归档"
                className={cn(
                  "h-8 w-8 rounded-full text-[#f9ab00] transition-colors duration-150",
                  "hover:bg-[hsl(var(--muted)/0.58)] dark:text-amber-300 dark:hover:bg-[hsl(var(--muted)/0.46)]",
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
                title="删除"
                className={cn(
                  "h-8 w-8 rounded-full text-red-500 transition-colors duration-150",
                  "hover:bg-[hsl(var(--muted)/0.58)] dark:text-red-400 dark:hover:bg-[hsl(var(--muted)/0.46)]",
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
                      "h-8 w-8 rounded-full text-[#9334e6] transition-colors duration-150",
                      "hover:bg-[hsl(var(--muted)/0.58)] dark:text-violet-300 dark:hover:bg-[hsl(var(--muted)/0.46)]",
                    )}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => messageList.onBatchMarkRead()}>
                    <MailOpen className="mr-2 h-3.5 w-3.5" />
                    标记为已读
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
                  "h-8 w-8 rounded-full text-[#f9ab00] transition-colors duration-150",
                  "hover:bg-[hsl(var(--muted)/0.58)] dark:text-amber-300 dark:hover:bg-[hsl(var(--muted)/0.46)]",
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
                title="刷新"
                className={cn(
                  "h-8 w-8 rounded-full text-[#188038] transition-colors duration-150",
                  "hover:bg-[hsl(var(--muted)/0.58)] dark:text-emerald-300 dark:hover:bg-[hsl(var(--muted)/0.46)]",
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
                  "h-8 w-8 rounded-full text-[#9334e6] transition-colors duration-150",
                  "hover:bg-[hsl(var(--muted)/0.58)] dark:text-violet-300 dark:hover:bg-[hsl(var(--muted)/0.46)]",
                )}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1 text-xs text-[#5f6368] dark:text-slate-400">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCycleDensity}
              title={`密度: ${densityLabels[messageList.density]}`}
              className={cn(
                "h-7 w-7 rounded-full text-[#5f6368] transition-colors duration-150",
                "hover:bg-[hsl(var(--muted)/0.58)] dark:text-slate-400 dark:hover:bg-[hsl(var(--muted)/0.46)]",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </Button>
            <span>{messageList.visibleMessages.length} 封邮件</span>
            <ChevronLeft className="h-3.5 w-3.5" />
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2 relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#5f6368] dark:text-slate-400" />
          <Input
            value={messageList.searchKeyword}
            onChange={(event) => messageList.setSearchKeyword(event.target.value)}
            placeholder="搜索邮件"
            className={cn("h-9 rounded-full pl-9 text-xs", EMAIL_FLAT_INPUT_CLASS)}
          />
          {messageList.isSearching ? (
            <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-[#5f6368] dark:text-slate-400" />
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
            正在加载邮件...
          </div>
        ) : messageList.visibleMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            暂无邮件
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
                      ? "bg-[#e8f0fe] dark:bg-sky-900/50"
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
                    <Star className="h-3.5 w-3.5 shrink-0 text-[#f9ab00] dark:text-amber-300" />
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        mail.unread ? "bg-[#1a73e8]" : "bg-transparent",
                      )}
                    />
                  </div>
                  <div
                    className={cn(
                      "truncate",
                      EMAIL_DENSITY_TEXT_SIZE[messageList.density],
                      mail.unread
                        ? "font-semibold text-[#202124] dark:text-slate-50"
                        : "font-medium text-[#3c4043] dark:text-slate-300",
                    )}
                  >
                    {mail.from}
                  </div>
                  <div className={cn("min-w-0 truncate text-[#5f6368] dark:text-slate-400", EMAIL_DENSITY_TEXT_SIZE[messageList.density])}>
                    <span
                      className={cn(
                        mail.unread
                          ? "font-semibold text-[#202124] dark:text-slate-100"
                          : "text-[#3c4043] dark:text-slate-300",
                      )}
                    >
                      {mail.subject || "（无主题）"}
                    </span>
                    <span className="text-[#5f6368] dark:text-slate-400">
                      {" "}
                      - {mail.preview || "（无预览）"}
                    </span>
                    {mail.hasAttachments ? (
                      <span className="ml-2 inline-flex items-center text-[#9334e6] dark:text-violet-300">
                        <Paperclip className="h-3 w-3" />
                      </span>
                    ) : null}
                    {mail.isPrivate ? (
                      <span className="ml-2 inline-flex items-center text-[#188038] dark:text-emerald-300">
                        <Lock className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "truncate text-right text-xs",
                      mail.unread
                        ? "font-semibold text-[#202124] dark:text-slate-100"
                        : "text-[#5f6368] dark:text-slate-400",
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
                正在加载更多...
              </div>
            ) : messageList.visibleMessages.length > 0 && !messageList.hasNextPage ? (
              <div className="py-2 text-center text-xs text-muted-foreground/70">
                没有更多内容了
              </div>
            ) : null}
          </>
        )}
      </div>

      <AlertDialog open={messageList.batchDeleteConfirmOpen} onOpenChange={messageList.onBatchDeleteConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {messageList.selectedIds.size} 封邮件吗？此操作将把邮件移至已删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={messageList.onBatchDeleteConfirmed}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
