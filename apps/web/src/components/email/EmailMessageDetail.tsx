/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Download, Forward, Lock, Reply, ReplyAll, Star, Trash2 } from "lucide-react";

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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { cn } from "@/lib/utils";
import { resolveServerUrl } from "@/utils/server-url";
import type { DetailState } from "./use-email-page-state";
import { EmailContentFilterBanner, RawHtmlIframe } from "./EmailContentFilterBanner";
import {
  EMAIL_DIVIDER_CLASS,
  EMAIL_GLASS_INSET_CLASS,
  EMAIL_META_CHIP_CLASS,
  EMAIL_TINT_DETAIL_CLASS,
  EMAIL_TINT_LIST_CLASS,
} from "./email-style-system";
import { formatAttachmentSize } from "./email-utils";

type EmailMessageDetailProps = {
  detail: DetailState;
};

export function EmailMessageDetail({ detail }: EmailMessageDetailProps) {
  return (
    <>
      <div className={cn("border-b px-4 py-3", EMAIL_TINT_DETAIL_CLASS, EMAIL_DIVIDER_CLASS)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {detail.isPrivate ? <Lock className="h-3.5 w-3.5 text-[hsl(var(--chart-3)/0.9)]" /> : null}
            <span className="truncate">{detail.detailSubject}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <div className="min-w-0 max-w-full">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 truncate">
                    {detail.isPrivate ? <Lock className="h-3 w-3 text-[hsl(var(--chart-3)/0.9)]" /> : null}
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
            </div>
            <span>·</span>
            <span className="truncate">{detail.detailTime}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className={cn("flex items-center gap-1 rounded-lg p-1", EMAIL_GLASS_INSET_CLASS)}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={detail.onStartReply}
              >
                <Reply className="h-3 w-3" />
                回复
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={detail.onStartReplyAll}
              >
                <ReplyAll className="h-3 w-3" />
                全部回复
              </Button>
            </div>
            <div className={cn("flex w-full items-center justify-end gap-1 rounded-lg p-1 sm:ml-auto sm:w-auto", EMAIL_TINT_LIST_CLASS)}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={detail.onStartForward}
              >
                <Forward className="h-3 w-3" />
                转发
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 gap-1 px-2 text-[11px] ${
                  detail.isFlagged ? "bg-[hsl(var(--chart-3)/0.16)] text-[hsl(var(--chart-3)/0.95)]" : ""
                }`}
                onClick={detail.onToggleFlagged}
              >
                <Star className={`h-3 w-3 ${detail.isFlagged ? "fill-[hsl(var(--chart-3)/0.95)]" : ""}`} />
                收藏
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/12"
                onClick={detail.onDeleteMessage}
              >
                <Trash2 className="h-3 w-3" />
                删除
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-[#ffffff] p-3 dark:bg-slate-900/82">
        <div className={cn("px-5 py-3 text-xs text-muted-foreground", EMAIL_GLASS_INSET_CLASS)}>
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
        <div className={cn("flex-1 px-6 py-5 text-sm leading-7 text-foreground", EMAIL_GLASS_INSET_CLASS)}>
          {detail.hasRawHtml ? (
            <div className="mb-3">
              <EmailContentFilterBanner
                showingRawHtml={detail.showingRawHtml}
                onToggle={detail.onToggleRawHtml}
              />
            </div>
          ) : null}
          {detail.messageDetailLoading ? (
            <div className="text-xs text-muted-foreground">正在加载邮件详情...</div>
          ) : detail.showingRawHtml && detail.messageDetail?.bodyHtmlRaw ? (
            <RawHtmlIframe html={detail.messageDetail.bodyHtmlRaw} />
          ) : detail.messageDetail?.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-foreground prose-img:max-w-full prose-p:my-3 leading-7"
              dangerouslySetInnerHTML={{ __html: detail.messageDetail.bodyHtml }}
            />
          ) : (
            <p className="break-words">
              {detail.messageDetail?.bodyText || detail.activeMessage?.preview || "暂无正文"}
            </p>
          )}
        </div>
        {detail.shouldShowAttachments ? (
          <div className={cn("px-5 py-3", EMAIL_GLASS_INSET_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-muted-foreground">附件</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {detail.messageDetailLoading ? (
                <span className="text-xs text-muted-foreground">附件加载中...</span>
              ) : (
                detail.messageDetail?.attachments?.map((attachment, index) => {
                  const sizeLabel = formatAttachmentSize(attachment.size);
                  const downloadUrl = detail.messageDetail && detail.workspaceId
                    ? `${resolveServerUrl()}/api/email/attachment?workspaceId=${encodeURIComponent(detail.workspaceId)}&messageId=${encodeURIComponent(detail.messageDetail.id)}&index=${index}`
                    : "#";
                  return (
                    <a
                      key={`${attachment.filename ?? "attachment"}-${index}`}
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors duration-200 hover:bg-background/90",
                        EMAIL_META_CHIP_CLASS,
                      )}
                    >
                      <Download className="h-3 w-3" />
                      {attachment.filename ?? "未命名附件"}
                      {sizeLabel ? ` · ${sizeLabel}` : ""}
                    </a>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>

      <AlertDialog open={detail.deleteConfirmOpen} onOpenChange={detail.onDeleteConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这封邮件吗？此操作将把邮件移至已删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={detail.onDeleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
