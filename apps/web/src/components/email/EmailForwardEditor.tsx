import { Input } from "@tenas-ai/ui/input";
import { Button } from "@tenas-ai/ui/button";
import { Textarea } from "@tenas-ai/ui/textarea";
import type { DetailState } from "./use-email-page-state";
import { formatAttachmentSize } from "./email-utils";

type EmailForwardEditorProps = {
  detail: DetailState;
};

export function EmailForwardEditor({ detail }: EmailForwardEditorProps) {
  if (!detail.forwardDraft) return null;
  return (
    <>
      <div className="border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-foreground">转发</div>
          <div className="flex items-center gap-2 text-[11px]">
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[11px]"
              disabled
              title="暂未接入发送能力"
            >
              发送
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={detail.onCancelForward}
            >
              取消
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="shrink-0">收件人</span>
            <Input
              value={detail.forwardDraft.to}
              onChange={(event) =>
                detail.setForwardDraft((prev) =>
                  prev ? { ...prev, to: event.target.value } : prev,
                )
              }
              placeholder="输入收件人"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">抄送</span>
            <Input
              value={detail.forwardDraft.cc}
              onChange={(event) =>
                detail.setForwardDraft((prev) =>
                  prev ? { ...prev, cc: event.target.value } : prev,
                )
              }
              placeholder="抄送"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">密送</span>
            <Input
              value={detail.forwardDraft.bcc}
              onChange={(event) =>
                detail.setForwardDraft((prev) =>
                  prev ? { ...prev, bcc: event.target.value } : prev,
                )
              }
              placeholder="密送"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">主题</span>
            <Input
              value={detail.forwardDraft.subject}
              onChange={(event) =>
                detail.setForwardDraft((prev) =>
                  prev ? { ...prev, subject: event.target.value } : prev,
                )
              }
              placeholder="主题"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="border-b border-border px-4 py-3">
          <Textarea
            value={detail.forwardDraft.body}
            onChange={(event) =>
              detail.setForwardDraft((prev) =>
                prev ? { ...prev, body: event.target.value } : prev,
              )
            }
            className="min-h-[260px] text-xs leading-5"
          />
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
      </div>
    </>
  );
}
