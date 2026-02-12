import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Lock,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Search,
  Square,
  Star,
} from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
import { Input } from "@tenas-ai/ui/input";
import { cn } from "@/lib/utils";
import {
  EMAIL_DIVIDER_CLASS,
  EMAIL_FLAT_INPUT_CLASS,
  EMAIL_GLASS_PANEL_CLASS,
  EMAIL_LIST_READ_ROW_CLASS,
  EMAIL_LIST_UNREAD_ROW_CLASS,
  EMAIL_TONE_ACTIVE_CLASS,
  EMAIL_TONE_HOVER_CLASS,
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
  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden p-0",
        EMAIL_GLASS_PANEL_CLASS,
      )}
    >
      <div className={cn("border-b px-3 py-2.5", EMAIL_DIVIDER_CLASS)}>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
          <div className="ml-auto flex items-center gap-1 text-xs text-[#5f6368] dark:text-slate-400">
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
        </div>
      </div>
      <div
        ref={messageList.messagesListRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#ffffff] text-sm show-scrollbar dark:bg-slate-900/84"
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
              const rowTime = formatMessageTime(mail.time ?? "");
              return (
                <button
                  key={mail.id}
                  type="button"
                  onClick={() => {
                    messageList.onSelectMessage(mail);
                    onMessageOpen?.(mail);
                  }}
                  className={cn(
                    "grid h-10 w-full grid-cols-[68px_minmax(128px,220px)_minmax(0,1fr)_72px] items-center gap-2 border-b px-3 text-left transition-colors duration-150",
                    EMAIL_DIVIDER_CLASS,
                    isActive
                      ? EMAIL_TONE_ACTIVE_CLASS
                      : cn(
                          mail.unread ? EMAIL_LIST_UNREAD_ROW_CLASS : EMAIL_LIST_READ_ROW_CLASS,
                          EMAIL_TONE_HOVER_CLASS,
                        ),
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[#9aa0a6] dark:text-slate-400">
                    <Square className="h-3.5 w-3.5 shrink-0" />
                    <Star
                      className="h-3.5 w-3.5 shrink-0 text-[#bdc1c6] dark:text-slate-500"
                    />
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        mail.unread ? "bg-[#1a73e8]" : "bg-transparent",
                      )}
                    />
                  </div>
                  <div
                    className={cn(
                      "truncate text-[13px]",
                      mail.unread
                        ? "font-semibold text-[#202124] dark:text-slate-50"
                        : "font-medium text-[#3c4043] dark:text-slate-300",
                    )}
                  >
                    {mail.from}
                  </div>
                  <div className="min-w-0 truncate text-[13px] text-[#5f6368] dark:text-slate-400">
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
                      <span className="ml-2 inline-flex items-center text-[#5f6368] dark:text-slate-400">
                        <Paperclip className="h-3 w-3" />
                      </span>
                    ) : null}
                    {mail.isPrivate ? (
                      <span className="ml-2 inline-flex items-center text-[#1a73e8] dark:text-sky-300">
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
                </button>
              );
            })}
            <div ref={messageList.loadMoreRef} className="h-6" />
            {messageList.messagesFetchingNextPage ? (
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
