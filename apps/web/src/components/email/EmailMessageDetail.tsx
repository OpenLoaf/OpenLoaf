import { Forward, Lock, Reply, Star } from "lucide-react";

import { Button } from "@tenas-ai/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tenas-ai/ui/context-menu";
import type { DetailState } from "./use-email-page-state";
import { formatAttachmentSize } from "./email-utils";

type EmailMessageDetailProps = {
  detail: DetailState;
};

export function EmailMessageDetail({ detail }: EmailMessageDetailProps) {
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {detail.isPrivate ? <Lock className="h-3.5 w-3.5 text-[var(--brand)]" /> : null}
            <span className="truncate">{detail.detailSubject}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="min-w-0 space-y-0.5 text-[11px] leading-4">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 truncate">
                    {detail.isPrivate ? <Lock className="h-3 w-3 text-[var(--brand)]" /> : null}
                    <span className="truncate">{detail.detailFrom}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem
                    onClick={detail.onSetPrivateSender}
                    disabled={!detail.detailFromAddress || detail.isPrivate}
                  >
                    设为私密发件人
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={detail.onRemovePrivateSender}
                    disabled={!detail.detailFromAddress || !detail.isPrivate}
                  >
                    取消私密发件人
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <div className="truncate">{detail.detailTime}</div>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                <Reply className="h-3 w-3" />
                回复
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={detail.onStartForward}
              >
                <Forward className="h-3 w-3" />
                转发
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 gap-1 px-2 text-[11px] ${
                  detail.isFlagged ? "border-[var(--brand)]/40 text-[var(--brand)]" : ""
                }`}
                onClick={detail.onToggleFlagged}
              >
                <Star className={`h-3 w-3 ${detail.isFlagged ? "fill-[var(--brand)]" : ""}`} />
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
              {detail.detailTo}
            </span>
          </div>
          {detail.hasCc ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">抄送</span>
              <span className="min-w-0 truncate">{detail.detailCc}</span>
            </div>
          ) : null}
          {detail.hasBcc ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">密送</span>
              <span className="min-w-0 truncate">{detail.detailBcc}</span>
            </div>
          ) : null}
        </div>
        <div className="border-b border-border px-8 py-4 text-sm leading-6 text-foreground">
          {detail.messageDetailLoading ? (
            <div className="text-xs text-muted-foreground">正在加载邮件详情...</div>
          ) : detail.messageDetail?.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-foreground prose-img:max-w-full"
              dangerouslySetInnerHTML={{ __html: detail.messageDetail.bodyHtml }}
            />
          ) : (
            <p className="break-words">
              {detail.messageDetail?.bodyText || detail.activeMessage?.preview || "暂无正文"}
            </p>
          )}
        </div>
        {detail.shouldShowAttachments ? (
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">附件</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {detail.messageDetailLoading ? (
                <span className="text-xs text-muted-foreground">附件加载中...</span>
              ) : (
                detail.messageDetail?.attachments?.map((attachment, index) => {
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
  );
}
