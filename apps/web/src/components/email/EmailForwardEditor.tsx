import { Loader2, Paperclip, X } from "lucide-react";
import { Input } from "@tenas-ai/ui/input";
import { Button } from "@tenas-ai/ui/button";
import { Textarea } from "@tenas-ai/ui/textarea";
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

const MODE_LABELS: Record<string, string> = {
  compose: "写邮件",
  reply: "回复",
  replyAll: "全部回复",
  forward: "转发",
};

export function EmailForwardEditor({ detail }: EmailForwardEditorProps) {
  const draft = detail.composeDraft ?? detail.forwardDraft;
  if (!draft) return null;

  const mode = "mode" in draft ? (draft.mode as string) : "forward";
  const modeLabel = MODE_LABELS[mode] ?? "转发";
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
            <div className="text-sm font-semibold text-[#202124] dark:text-slate-100">
              {modeLabel}
            </div>
            {isCompose && detail.draftSaveStatus === 'saving' ? (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                保存中...
              </span>
            ) : isCompose && detail.draftSaveStatus === 'saved' ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">已保存</span>
            ) : isCompose && detail.draftSaveStatus === 'error' ? (
              <span className="text-[10px] text-destructive">保存失败</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full bg-[#0b57d0] px-4 text-[12px] text-white transition-colors duration-150 hover:bg-[#0a4cbc] dark:bg-sky-600 dark:hover:bg-sky-500"
              disabled={!canSend || detail.isSending}
              onClick={detail.onSendMessage}
            >
              {detail.isSending ? "发送中..." : "发送"}
            </Button>
            {isCompose ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-[12px] text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={handleFileSelect}
                title="添加附件"
              >
                <Paperclip className="mr-1 h-3 w-3" />
                附件
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-[12px] text-[#5f6368] hover:bg-[#e8eaed] dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={detail.onCancelCompose}
            >
              取消
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#ffffff] dark:bg-slate-900/84">
        <div className={cn("space-y-2 px-4 py-3 text-xs text-[#5f6368] dark:text-slate-400 border-b", EMAIL_DIVIDER_CLASS)}>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">收件人</span>
            <Input
              value={draft.to}
              onChange={(event) => updateField("to", event.target.value)}
              placeholder="输入收件人"
              className={cn("h-8 rounded-md text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">抄送</span>
            <Input
              value={draft.cc}
              onChange={(event) => updateField("cc", event.target.value)}
              placeholder="抄送"
              className={cn("h-8 rounded-md text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">密送</span>
            <Input
              value={draft.bcc}
              onChange={(event) => updateField("bcc", event.target.value)}
              placeholder="密送"
              className={cn("h-8 rounded-md text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-3">
            <span className="shrink-0">主题</span>
            <Input
              value={draft.subject}
              onChange={(event) => updateField("subject", event.target.value)}
              placeholder="主题"
              className={cn("h-8 rounded-md text-xs", EMAIL_FLAT_INPUT_CLASS)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 px-4 py-4">
          <Textarea
            value={draft.body}
            onChange={(event) => updateField("body", event.target.value)}
            className={cn(
              "min-h-[260px] rounded-lg text-sm leading-6",
              EMAIL_FLAT_INPUT_CLASS,
              "bg-[#ffffff] dark:bg-slate-900/72",
            )}
          />
        </div>
        {composeAttachments.length > 0 ? (
          <div className={cn("border-t px-4 py-3", EMAIL_DIVIDER_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-[#5f6368] dark:text-slate-400">附件</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#5f6368] dark:text-slate-400">
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
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
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
            <div className="text-xs text-[#5f6368] dark:text-slate-400">附件</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#5f6368] dark:text-slate-400">
              {detail.messageDetailLoading ? (
                <span className="text-xs text-[#5f6368] dark:text-slate-400">附件加载中...</span>
              ) : (
                detail.messageDetail?.attachments?.map((attachment, index) => {
                  const sizeLabel = formatAttachmentSize(attachment.size);
                  return (
                    <span
                      key={`${attachment.filename ?? "attachment"}-${index}`}
                      className={EMAIL_META_CHIP_CLASS}
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
        {isForwardMode ? (
          <div className={cn("border-t px-4 py-4 text-xs", EMAIL_DIVIDER_CLASS, EMAIL_TINT_LIST_CLASS)}>
            <div className="text-xs text-[#5f6368] dark:text-slate-400">原邮件内容</div>
            <div className="mt-2 text-sm leading-7 text-[#202124] dark:text-slate-100">
              {detail.messageDetailLoading ? (
                <div className="text-xs text-[#5f6368] dark:text-slate-400">正在加载邮件详情...</div>
              ) : detail.messageDetail?.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none text-foreground prose-img:max-w-full leading-7"
                  dangerouslySetInnerHTML={{ __html: detail.messageDetail.bodyHtml }}
                />
              ) : (
                <p className="break-words">
                  {detail.messageDetail?.bodyText || detail.activeMessage?.preview || "暂无正文"}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
