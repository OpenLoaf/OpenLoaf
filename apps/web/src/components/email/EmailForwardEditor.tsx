/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Loader2, Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@openloaf/ui/input";
import { Button } from "@openloaf/ui/button";
import { Textarea } from "@openloaf/ui/textarea";
import { cn } from "@/lib/utils";
import type { DetailState } from "./use-email-page-state";
import {
  EMAIL_DIVIDER_CLASS,
  EMAIL_FLAT_INPUT_CLASS,
  EMAIL_META_CHIP_CLASS,
  EMAIL_TINT_DETAIL_CLASS,
  EMAIL_TINT_LIST_CLASS,
} from "./email-style-system";
import { formatAttachmentSize } from "./email-utils";

type EmailForwardEditorProps = {
  detail: DetailState;
};

export function EmailForwardEditor({ detail }: EmailForwardEditorProps) {
  const { t } = useTranslation('common');
  const draft = detail.composeDraft ?? detail.forwardDraft;
  if (!draft) return null;

  const MODE_LABELS: Record<string, string> = {
    compose: t('email.compose'),
    reply: t('email.reply'),
    replyAll: t('email.replyAll'),
    forward: t('email.forward'),
  };

  const mode = "mode" in draft ? (draft.mode as string) : "forward";
  const modeLabel = MODE_LABELS[mode] ?? t('email.forward');
  const isCompose = detail.composeDraft !== null;
  const isForwardMode = mode === "forward";

  const updateField = (field: string, value: string) => {
    if (isCompose && detail.composeDraft) {
      detail.setComposeDraft((prev) =>
        prev ? { ...prev, [field]: value } : prev,
      );
    } else {
      detail.setForwardDraft((prev) =>
        prev ? { ...prev, [field]: value } : prev,
      );
    }
  };

  const canSend = Boolean(draft.to.trim());

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length || !isCompose || !detail.composeDraft) return;
      const newAttachments: Array<{ filename: string; content: string; contentType?: string }> = [];
      for (const file of Array.from(input.files)) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        );
        newAttachments.push({
          filename: file.name,
          content: base64,
          contentType: file.type || undefined,
        });
      }
      detail.setComposeDraft((prev) =>
        prev ? { ...prev, attachments: [...(prev.attachments ?? []), ...newAttachments] } : prev,
      );
    };
    input.click();
  };

  const handleRemoveAttachment = (index: number) => {
    if (!isCompose) return;
    detail.setComposeDraft((prev) => {
      if (!prev?.attachments) return prev;
      const next = [...prev.attachments];
      next.splice(index, 1);
      return { ...prev, attachments: next };
    });
  };

  const composeAttachments = isCompose ? (detail.composeDraft?.attachments ?? []) : [];

  return (
    <>
      <div className={cn("px-4 py-3 border-b", EMAIL_TINT_DETAIL_CLASS, EMAIL_DIVIDER_CLASS)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground">
              {modeLabel}
            </div>
            {isCompose && detail.draftSaveStatus === 'saving' ? (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('saving')}
              </span>
            ) : isCompose && detail.draftSaveStatus === 'saved' ? (
              <span className="text-[10px] text-muted-foreground">{t('email.draftSaved')}</span>
            ) : isCompose && detail.draftSaveStatus === 'error' ? (
              <span className="text-[10px] text-destructive">{t('email.draftSaveError')}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-3xl bg-foreground px-4 text-[12px] text-white transition-colors duration-150 hover:bg-foreground/85"
              disabled={!canSend || detail.isSending}
              onClick={detail.onSendMessage}
            >
              {detail.isSending ? t('email.sending') : t('email.send')}
            </Button>
            {isCompose ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-3xl px-3 text-[12px] text-muted-foreground hover:bg-accent"
                onClick={handleFileSelect}
                title={t('email.addAttachment')}
              >
                <Paperclip className="mr-1 h-3 w-3" />
                {t('email.attachment')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-3xl px-3 text-[12px] text-muted-foreground hover:bg-accent"
              onClick={detail.onCancelCompose}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
        <div className={cn("space-y-2 px-4 py-3 text-xs text-muted-foreground border-b", EMAIL_DIVIDER_CLASS)}>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">{t('email.to')}</span>
            <Input
              value={draft.to}
              onChange={(event) => updateField("to", event.target.value)}
              placeholder={t('email.toPlaceholder')}
              className={cn("h-8 rounded-3xl text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">{t('email.cc')}</span>
            <Input
              value={draft.cc}
              onChange={(event) => updateField("cc", event.target.value)}
              placeholder={t('email.ccPlaceholder')}
              className={cn("h-8 rounded-3xl text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">{t('email.bcc')}</span>
            <Input
              value={draft.bcc}
              onChange={(event) => updateField("bcc", event.target.value)}
              placeholder={t('email.bccPlaceholder')}
              className={cn("h-8 rounded-3xl text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">{t('email.subject')}</span>
            <Input
              value={draft.subject}
              onChange={(event) => updateField("subject", event.target.value)}
              placeholder={t('email.subjectPlaceholder')}
              className={cn("h-8 rounded-3xl text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 px-4 py-4">
          <Textarea
            value={draft.body}
            onChange={(event) => updateField("body", event.target.value)}
            className={cn(
              "min-h-[260px] rounded-3xl text-sm leading-6",
              EMAIL_FLAT_INPUT_CLASS,
              "bg-background",
            )}
          />
        </div>
        {composeAttachments.length > 0 ? (
          <div className={cn("border-t px-4 py-3", EMAIL_DIVIDER_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-muted-foreground">{t('email.attachments')}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {composeAttachments.map((att, index) => (
                <span
                  key={`${att.filename}-${index}`}
                  className={cn("inline-flex items-center gap-1", EMAIL_META_CHIP_CLASS)}
                >
                  <Paperclip className="h-3 w-3" />
                  {att.filename}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(index)}
                    className="ml-0.5 rounded-3xl p-0.5 hover:bg-muted"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {isForwardMode && detail.shouldShowAttachments ? (
          <div className={cn("border-t px-4 py-3", EMAIL_DIVIDER_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-muted-foreground">{t('email.attachments')}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {detail.messageDetailLoading ? (
                <span className="text-xs text-muted-foreground">{t('email.attachmentsLoading')}</span>
              ) : (
                detail.messageDetail?.attachments?.map((attachment, index) => {
                  const sizeLabel = formatAttachmentSize(attachment.size);
                  return (
                    <span
                      key={`${attachment.filename ?? "attachment"}-${index}`}
                      className={EMAIL_META_CHIP_CLASS}
                    >
                      {attachment.filename ?? t('email.unnamedAttachment')}
                      {sizeLabel ? ` · ${sizeLabel}` : ""}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
        {isForwardMode ? (
          <div className={cn("border-t px-4 py-4 text-xs", EMAIL_DIVIDER_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-muted-foreground">{t('email.originalContent')}</div>
            <div className="mt-2 text-sm leading-7 text-foreground">
              {detail.messageDetailLoading ? (
                <div className="text-xs text-muted-foreground">{t('email.loadingDetail')}</div>
              ) : detail.messageDetail?.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none text-foreground prose-img:max-w-full leading-7"
                  dangerouslySetInnerHTML={{ __html: detail.messageDetail.bodyHtml }}
                />
              ) : (
                <p className="break-words">
                  {detail.messageDetail?.bodyText || detail.activeMessage?.preview || t('email.noBody')}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
