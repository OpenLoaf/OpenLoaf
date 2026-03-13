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
  const { t } = useTranslation('common');
  return (
    <>
      <div className={cn("border-b px-4 py-3", EMAIL_TINT_DETAIL_CLASS, EMAIL_DIVIDER_CLASS)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {detail.isPrivate ? <Lock className="h-3.5 w-3.5 text-chart-3/90" /> : null}
            <span className="truncate">{detail.detailSubject}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <div className="min-w-0 max-w-full">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 truncate">
                    {detail.isPrivate ? <Lock className="h-3 w-3 text-chart-3/90" /> : null}
                    <span className="truncate">{detail.detailFrom}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem
                    onClick={detail.onSetPrivateSender}
                    disabled={!detail.detailFromAddress || detail.isPrivate}
                  >
                    {t('email.setPrivateSender')}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={detail.onRemovePrivateSender}
                    disabled={!detail.detailFromAddress || !detail.isPrivate}
                  >
                    {t('email.cancelPrivateSender')}
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
                {t('email.reply')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={detail.onStartReplyAll}
              >
                <ReplyAll className="h-3 w-3" />
                {t('email.replyAll')}
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
                {t('email.forward')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 gap-1 px-2 text-[11px] ${
                  detail.isFlagged ? "bg-chart-3/16 text-chart-3/95" : ""
                }`}
                onClick={detail.onToggleFlagged}
              >
                <Star className={`h-3 w-3 ${detail.isFlagged ? "fill-chart-3/95" : ""}`} />
                {t('email.favorite')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/12"
                onClick={detail.onDeleteMessage}
              >
                <Trash2 className="h-3 w-3" />
                {t('delete')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-background p-3">
        <div className={cn("px-5 py-3 text-xs text-muted-foreground", EMAIL_GLASS_INSET_CLASS)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0">{t('email.to')}</span>
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {detail.detailTo}
            </span>
          </div>
          {detail.hasCc ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">{t('email.cc')}</span>
              <span className="min-w-0 truncate">{detail.detailCc}</span>
            </div>
          ) : null}
          {detail.hasBcc ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">{t('email.bcc')}</span>
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
            <div className="text-xs text-muted-foreground">{t('email.loadingDetail')}</div>
          ) : detail.showingRawHtml && detail.messageDetail?.bodyHtmlRaw ? (
            <RawHtmlIframe html={detail.messageDetail.bodyHtmlRaw} />
          ) : detail.messageDetail?.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-foreground prose-img:max-w-full prose-p:my-3 leading-7"
              dangerouslySetInnerHTML={{ __html: detail.messageDetail.bodyHtml }}
            />
          ) : (
            <p className="break-words">
              {detail.messageDetail?.bodyText || detail.activeMessage?.preview || t('email.noBody')}
            </p>
          )}
        </div>
        {detail.shouldShowAttachments ? (
          <div className={cn("px-5 py-3", EMAIL_GLASS_INSET_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-muted-foreground">{t('email.attachment')}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {detail.messageDetailLoading ? (
                <span className="text-xs text-muted-foreground">{t('email.attachmentsLoading')}</span>
              ) : (
                detail.messageDetail?.attachments?.map((attachment, index) => {
                  const sizeLabel = formatAttachmentSize(attachment.size);
                  const downloadUrl = detail.messageDetail
                    ? `${resolveServerUrl()}/api/email/attachment?messageId=${encodeURIComponent(detail.messageDetail.id)}&index=${index}`
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
                      {attachment.filename ?? t('email.unnamedAttachment')}
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
            <AlertDialogTitle>{t('email.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('email.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={detail.onDeleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
