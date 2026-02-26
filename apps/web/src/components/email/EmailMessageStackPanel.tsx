/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useCallback, useEffect, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Download, Paperclip } from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { resolveServerUrl } from "@/utils/server-url";
import { trpc } from "@/utils/trpc";
import type { EmailMessageDetail } from "./email-types";
import { EmailContentFilterBanner, RawHtmlIframe } from "./EmailContentFilterBanner";
import {
  EMAIL_DIVIDER_CLASS,
  EMAIL_GLASS_PANEL_CLASS,
  EMAIL_META_CHIP_CLASS,
  EMAIL_TINT_DETAIL_CLASS,
  EMAIL_TINT_LIST_CLASS,
} from "./email-style-system";
import { formatAttachmentSize, formatDateTime } from "./email-utils";

type EmailMessageStackPanelProps = {
  panelKey: string;
  tabId: string;
  messageId?: string;
  workspaceId?: string;
  fallbackFrom?: string;
  fallbackTime?: string;
  fallbackPreview?: string;
};

export default function EmailMessageStackPanel({
  messageId,
  workspaceId,
  fallbackFrom,
  fallbackTime,
  fallbackPreview,
}: EmailMessageStackPanelProps) {
  const { workspace } = useWorkspace();
  const resolvedWorkspaceId = workspaceId ?? workspace?.id;

  const messageQuery = useQuery(
    trpc.email.getMessage.queryOptions(
      resolvedWorkspaceId && messageId
        ? { workspaceId: resolvedWorkspaceId, id: messageId }
        : skipToken,
    ),
  );

  const detail = messageQuery.data as EmailMessageDetail | undefined;

  const [showingRawHtml, setShowingRawHtml] = useState(false);
  useEffect(() => {
    setShowingRawHtml(false);
  }, [messageId]);
  const hasRawHtml = false;
  const handleToggleRawHtml = useCallback(() => {
    setShowingRawHtml((prev) => !prev);
  }, []);

  const fromLine = detail?.from?.join("; ") || fallbackFrom || "—";
  const timeLine = formatDateTime(detail?.date ?? fallbackTime ?? "") || "—";
  const toLine = detail?.to?.join("; ") || "—";
  const ccLine = detail?.cc?.join("; ") || "";
  const bccLine = detail?.bcc?.join("; ") || "";
  const htmlBody = detail?.bodyHtml;
  const textBody = detail?.bodyText || fallbackPreview || "暂无正文";
  const attachments = detail?.attachments ?? [];

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", EMAIL_GLASS_PANEL_CLASS)}>
      <header className={cn("px-5 py-3", EMAIL_TINT_DETAIL_CLASS, "border-b", EMAIL_DIVIDER_CLASS)}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5f6368] dark:text-slate-400">
          <span className="font-medium text-[#202124] dark:text-slate-100">{fromLine}</span>
          <span>·</span>
          <span>{timeLine}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <section
          className={cn(
            "px-5 py-3 text-xs text-[#5f6368] dark:text-slate-400 border-b",
            EMAIL_DIVIDER_CLASS,
            EMAIL_TINT_LIST_CLASS,
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0">收件人</span>
            <span className="min-w-0 truncate text-sm text-[#202124] dark:text-slate-100">{toLine}</span>
          </div>
          {ccLine ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">抄送</span>
              <span className="min-w-0 truncate">{ccLine}</span>
            </div>
          ) : null}
          {bccLine ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">密送</span>
              <span className="min-w-0 truncate">{bccLine}</span>
            </div>
          ) : null}
        </section>

        <section className="min-h-0 flex-1 bg-[#ffffff] px-7 py-6 text-sm leading-7 text-[#202124] dark:bg-slate-900/84 dark:text-slate-100">
          {hasRawHtml ? (
            <div className="mb-3">
              <EmailContentFilterBanner
                showingRawHtml={showingRawHtml}
                onToggle={handleToggleRawHtml}
              />
            </div>
          ) : null}
          {messageQuery.isLoading ? (
            <div className="text-xs text-[#5f6368] dark:text-slate-400">正在加载邮件正文...</div>
          ) : htmlBody ? (
            <div
              className="prose prose-sm max-w-none text-foreground prose-img:max-w-full prose-p:my-3 leading-7"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{textBody}</p>
          )}
        </section>

        {attachments.length > 0 ? (
          <section className={cn("px-5 py-3 border-t", EMAIL_DIVIDER_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-[#5f6368] dark:text-slate-400">附件</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => {
                const sizeLabel = formatAttachmentSize(attachment.size);
                const canDownload = Boolean(detail?.id && resolvedWorkspaceId);
                const downloadUrl = canDownload
                  ? `${resolveServerUrl()}/api/email/attachment?workspaceId=${encodeURIComponent(
                      resolvedWorkspaceId!,
                    )}&messageId=${encodeURIComponent(detail!.id)}&index=${index}`
                  : "#";
                return (
                  <a
                    key={`${attachment.filename ?? "attachment"}-${index}`}
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-[#dde3ec] dark:hover:bg-slate-700",
                      EMAIL_META_CHIP_CLASS,
                    )}
                  >
                    <Paperclip className="h-3 w-3" />
                    <span>{attachment.filename ?? "未命名附件"}</span>
                    {sizeLabel ? <span className="text-[#5f6368] dark:text-slate-400">· {sizeLabel}</span> : null}
                    <Download className="ml-1 h-3 w-3 text-[#5f6368] dark:text-slate-400" />
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
