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

import { useCallback, useEffect, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Download, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
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
  fallbackFrom?: string;
  fallbackTime?: string;
  fallbackPreview?: string;
};

export default function EmailMessageStackPanel({
  messageId,
  fallbackFrom,
  fallbackTime,
  fallbackPreview,
}: EmailMessageStackPanelProps) {
  const { t } = useTranslation('common');

  const messageQuery = useQuery(
    trpc.email.getMessage.queryOptions(
      messageId
        ? { id: messageId }
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
  const textBody = detail?.bodyText || fallbackPreview || t('email.noBody');
  const attachments = detail?.attachments ?? [];

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", EMAIL_GLASS_PANEL_CLASS)}>
      <header className={cn("px-5 py-3", EMAIL_TINT_DETAIL_CLASS, "border-b", EMAIL_DIVIDER_CLASS)}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{fromLine}</span>
          <span>·</span>
          <span>{timeLine}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <section
          className={cn(
            "px-5 py-3 text-xs text-muted-foreground border-b",
            EMAIL_DIVIDER_CLASS,
            EMAIL_TINT_LIST_CLASS,
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0">{t('email.to')}</span>
            <span className="min-w-0 truncate text-sm text-foreground">{toLine}</span>
          </div>
          {ccLine ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">{t('email.cc')}</span>
              <span className="min-w-0 truncate">{ccLine}</span>
            </div>
          ) : null}
          {bccLine ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="shrink-0">{t('email.bcc')}</span>
              <span className="min-w-0 truncate">{bccLine}</span>
            </div>
          ) : null}
        </section>

        <section className="min-h-0 flex-1 bg-background px-7 py-6 text-sm leading-7 text-foreground">
          {hasRawHtml ? (
            <div className="mb-3">
              <EmailContentFilterBanner
                showingRawHtml={showingRawHtml}
                onToggle={handleToggleRawHtml}
              />
            </div>
          ) : null}
          {messageQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">{t('email.loadingBody')}</div>
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
            <div className="text-xs text-muted-foreground">{t('email.attachment')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => {
                const sizeLabel = formatAttachmentSize(attachment.size);
                const canDownload = Boolean(detail?.id);
                const downloadUrl = canDownload
                  ? `${resolveServerUrl()}/api/email/attachment?messageId=${encodeURIComponent(
                      detail!.id,
                    )}&index=${index}`
                  : "#";
                return (
                  <a
                    key={`${attachment.filename ?? "attachment"}-${index}`}
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-accent",
                      EMAIL_META_CHIP_CLASS,
                    )}
                  >
                    <Paperclip className="h-3 w-3" />
                    <span>{attachment.filename ?? t('email.unnamedAttachment')}</span>
                    {sizeLabel ? <span className="text-muted-foreground">· {sizeLabel}</span> : null}
                    <Download className="ml-1 h-3 w-3 text-muted-foreground" />
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
