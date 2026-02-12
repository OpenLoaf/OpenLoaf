import { Input } from "@tenas-ai/ui/input";
import { Button } from "@tenas-ai/ui/button";
import { Textarea } from "@tenas-ai/ui/textarea";
import type { DetailState } from "./use-email-page-state";
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

  return (
    <>
      <div className="border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-foreground">
            {modeLabel}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[11px]"
              disabled={!canSend || detail.isSending}
              onClick={detail.onSendMessage}
            >
              {detail.isSending ? "发送中..." : "发送"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={detail.onCancelCompose}
            >
              取消
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="shrink-0">收件人</span>
            <Input
              value={draft.to}
              onChange={(event) => updateField("to", event.target.value)}
              placeholder="输入收件人"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">抄送</span>
            <Input
              value={draft.cc}
              onChange={(event) => updateField("cc", event.target.value)}
              placeholder="抄送"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">密送</span>
            <Input
              value={draft.bcc}
              onChange={(event) => updateField("bcc", event.target.value)}
              placeholder="密送"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">主题</span>
            <Input
              value={draft.subject}
              onChange={(event) => updateField("subject", event.target.value)}
              placeholder="主题"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="border-b border-border px-4 py-3">
          <Textarea
            value={draft.body}
            onChange={(event) => updateField("body", event.target.value)}
            className="min-h-[260px] text-xs leading-5"
          />
        </div>
        {isForwardMode && detail.shouldShowAttachments ? (
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
        {isForwardMode ? (
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            <div className="text-xs text-muted-foreground">原邮件内容</div>
            <div className="mt-2 text-sm leading-6 text-foreground">
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
          </div>
        ) : null}
      </div>
    </>
  );
}
