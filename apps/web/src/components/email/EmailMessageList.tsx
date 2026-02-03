import { Lock, Paperclip, Search } from "lucide-react";

import { Input } from "@tenas-ai/ui/input";
import type { MessageListState } from "./use-email-page-state";
import { formatDateTime } from "./email-utils";

type EmailMessageListProps = {
  messageList: MessageListState;
};

export function EmailMessageList({ messageList }: EmailMessageListProps) {
  return (
    <section className="flex w-full min-w-0 flex-col border-b border-border bg-background p-3 lg:w-80 lg:border-b-0 lg:border-r min-h-0">
      <div className="relative">
        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          value={messageList.searchKeyword}
          onChange={(event) => messageList.setSearchKeyword(event.target.value)}
          placeholder="搜索邮件"
          className="h-8 pl-8 text-xs"
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{messageList.activeMailboxLabel || "文件夹"}</span>
        <span>{messageList.visibleMessages.length} 封</span>
      </div>
      <div
        ref={messageList.messagesListRef}
        className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 text-sm show-scrollbar"
      >
        {messageList.messagesLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            正在加载邮件...
          </div>
        ) : messageList.visibleMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
            暂无邮件
          </div>
        ) : (
          <>
            {messageList.visibleMessages.map((mail) => {
              const isActive = mail.id === messageList.activeMessageId;
              return (
                <button
                  key={mail.id}
                  type="button"
                  onClick={() => messageList.onSelectMessage(mail)}
                  className={`w-full rounded-lg border px-2 py-3 text-left transition ${
                    isActive
                      ? "border-border bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {mail.isPrivate ? <Lock className="h-3 w-3 text-[var(--brand)]" /> : null}
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
