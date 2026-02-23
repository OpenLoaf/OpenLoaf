"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import { generateId } from "ai";
import { cn } from "@/lib/utils";
import { ChatInputBox } from "../input/ChatInput";
import MessageAiAction from "./MessageAiAction";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageHumanAction from "./MessageHumanAction";
import { useChatActions, useChatSession, useChatState, useChatTools } from "../context";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";
import type { ChatAttachment } from "../input/chat-attachments";
import { fetchBlobFromUri, resolveBaseName, resolveFileName } from "@/lib/image/uri";
import type { ChatMessageKind } from "@tenas-ai/api";
import { getMessagePlainText } from "@/lib/chat/message-text";
import { normalizeFileMentionSpacing } from "@/components/ai/input/chat-input-utils";
import CompactSummaryDivider from "./CompactSummaryDivider";
import { isToolPart } from "@/lib/chat/message-parts";
import { isApprovalPending } from "./tools/shared/tool-utils";

type ChatMessage = UIMessage & { messageKind?: ChatMessageKind };

interface MessageItemProps {
  message: ChatMessage;
  isLastHumanMessage?: boolean;
  isLastAiMessage?: boolean;
  /** Whether this assistant message should show actions by default. */
  isLastAiActionMessage?: boolean;
  hideAiActions?: boolean;
}

function MessageItem({
  message,
  isLastHumanMessage,
  isLastAiMessage,
  isLastAiActionMessage,
  hideAiActions,
}: MessageItemProps) {
  const { resendUserMessage, clearError } = useChatActions();
  const { status } = useChatState();
  const { branchMessageIds, siblingNav, projectId, workspaceId, tabId } = useChatSession();
  const { toolParts } = useChatTools();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [editAttachments, setEditAttachments] = React.useState<ChatAttachment[]>([]);
  const editAttachmentsRef = React.useRef<ChatAttachment[]>([]);
  const messageKind = message.messageKind;

  const messageText = React.useMemo(() => {
    return (message.parts ?? [])
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text)
      .join("");
  }, [message.parts]);
  const imageParts = React.useMemo(() => {
    return (message.parts ?? []).filter((part: any) => {
      if (!part || part.type !== "file") return false;
      if (typeof part.url !== "string") return false;
      return typeof part.mediaType === "string" && part.mediaType.startsWith("image/");
    }) as Array<{ type: "file"; url: string; mediaType?: string; purpose?: string }>;
  }, [message.parts]);

  // 仅对当前流式输出的最后一条 assistant 消息启用动画。
  const isAnimating =
    status === "streaming" && Boolean(isLastAiMessage) && message.role !== "user";

  // 判断消息是否有可见内容（避免空消息也渲染底部操作按钮）
  const hasVisibleContent = React.useMemo(() => {
    return messageHasVisibleContent(message);
  }, [message]);

  const toolPartsByTab = toolParts;
  const toolPartsInMessage = React.useMemo(() => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts.filter((part) => isToolPart(part));
  }, [message.parts]);
  const hasPendingApprovalInMessage = React.useMemo(() => {
    if (toolPartsInMessage.length === 0) return false;
    for (const part of toolPartsInMessage) {
      const toolCallId =
        typeof (part as any)?.toolCallId === "string" ? String((part as any).toolCallId) : "";
      const snapshot = toolCallId ? toolPartsByTab?.[toolCallId] : undefined;
      const mergedPart = snapshot ? { ...(part as any), ...snapshot } : part;
      if (isApprovalPending(mergedPart as any)) return true;
    }
    return false;
  }, [toolPartsInMessage, toolPartsByTab]);
  const hasPendingApprovalInTab = React.useMemo(() => {
    if (!toolPartsByTab) return false;
    return Object.values(toolPartsByTab).some((part) => isApprovalPending(part as any));
  }, [toolPartsByTab]);
  const shouldHideAiActionsForApproval =
    hasPendingApprovalInMessage ||
    (isLastAiMessage && toolPartsInMessage.length === 0 && hasPendingApprovalInTab);

  // 当消息本身没有可见内容时，如果它是“分支节点”，仍然要显示分支切换（否则切到边界会“消失”）。
  const shouldShowBranchNav = React.useMemo(() => {
    const id = String((message as any)?.id ?? "");
    if (!id) return false;
    if (!branchMessageIds.includes(id)) return false;
    const nav = siblingNav?.[id];
    return Boolean(nav && nav.siblingTotal > 1);
  }, [message, branchMessageIds, siblingNav]);

  const toggleEdit = React.useCallback(() => {
    setIsEditing((prev) => {
      const next = !prev;
      if (next) setDraft(messageText);
      return next;
    });
  }, [messageText]);

  const cancelEdit = React.useCallback(() => {
    setIsEditing(false);
    setDraft(messageText);
  }, [messageText]);

  const handleResend = React.useCallback(
    (value: string) => {
      const canSubmit = status === "ready" || status === "error";
      if (!canSubmit) return;
      const hasReadyAttachments = editAttachmentsRef.current.some(
        (item) => item.status === "ready"
      );
      // 中文注释：重发前规范化文件引用的空格，避免路径与后续文本粘连。
      const normalizedValue = normalizeFileMentionSpacing(value);
      if (!normalizedValue.trim() && !hasReadyAttachments) return;
      if (status === "error") clearError();

      const parts: Array<any> = [];
      for (const attachment of editAttachmentsRef.current) {
        if (attachment.status !== "ready") continue;
        const url = attachment.remoteUrl || attachment.objectUrl;
        if (!url) continue;
        parts.push({
          type: "file",
          url,
          mediaType: attachment.mediaType || attachment.file.type,
        });
        if (attachment.mask && attachment.mask.status === "ready") {
          const maskUrl = attachment.mask.remoteUrl || attachment.mask.objectUrl;
          if (maskUrl) {
            parts.push({
              type: "file",
              url: maskUrl,
              mediaType: attachment.mask.mediaType || attachment.mask.file.type,
              purpose: "mask",
            });
          }
        }
      }
      if (normalizedValue.trim()) {
        parts.push({ type: "text", text: normalizedValue });
      }

      // 关键：编辑重发 = 在同 parent 下创建新 sibling，并把 UI 切到新分支
      resendUserMessage(message.id, normalizedValue, parts);

      setIsEditing(false);
    },
    [resendUserMessage, status, clearError, message]
  );

  const actionVisibility = (showAlways?: boolean) =>
    cn(
      "transition-opacity duration-200",
      showAlways
        ? "opacity-100"
        : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
    );
  const showAiActionsAlways = isLastAiActionMessage ?? isLastAiMessage;

  const revokeAttachmentUrls = React.useCallback((items: ChatAttachment[]) => {
    for (const item of items) {
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
      if (item.mask?.objectUrl) URL.revokeObjectURL(item.mask.objectUrl);
    }
  }, []);

  const removeEditAttachment = React.useCallback((attachmentId: string) => {
    setEditAttachments((prev) => {
      const target = prev.find((item) => item.id === attachmentId);
      if (target) {
        if (target.objectUrl) URL.revokeObjectURL(target.objectUrl);
        if (target.mask?.objectUrl) URL.revokeObjectURL(target.mask.objectUrl);
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  }, []);

  React.useEffect(() => {
    editAttachmentsRef.current = editAttachments;
  }, [editAttachments]);

  React.useEffect(() => {
    if (!isEditing) {
      if (editAttachmentsRef.current.length) {
        revokeAttachmentUrls(editAttachmentsRef.current);
      }
      setEditAttachments([]);
      return;
    }
    if (imageParts.length === 0) {
      setEditAttachments([]);
      return;
    }

    let aborted = false;
    const objectUrls: string[] = [];

    // 中文注释：编辑态需要把消息内图片转为可复用的附件结构。
    const loadAttachments = async () => {
      const maskMap = new Map<string, { url: string; mediaType?: string }>();
      for (const part of imageParts) {
        if (part.purpose !== "mask") continue;
        const fileName = resolveFileName(part.url, part.mediaType);
        const baseName = resolveBaseName(fileName).replace(/_mask$/i, "");
        if (!baseName) continue;
        maskMap.set(baseName, { url: part.url, mediaType: part.mediaType });
      }

      const next: ChatAttachment[] = [];
      for (const part of imageParts) {
        if (part.purpose === "mask") continue;
        try {
          const fileName = resolveFileName(part.url, part.mediaType);
          const baseName = resolveBaseName(fileName);
          const baseBlob = await fetchBlobFromUri(part.url, { projectId });
          if (aborted) return;
          const baseFile = new File([baseBlob], fileName, {
            type: part.mediaType || baseBlob.type || "image/png",
          });
          const baseObjectUrl = URL.createObjectURL(baseBlob);
          objectUrls.push(baseObjectUrl);
          const attachment: ChatAttachment = {
            id: generateId(),
            file: baseFile,
            objectUrl: baseObjectUrl,
            status: "ready",
            remoteUrl: part.url,
            mediaType: part.mediaType || baseFile.type,
          };

          const mask = baseName ? maskMap.get(baseName) : undefined;
          if (mask?.url) {
            const maskBlob = await fetchBlobFromUri(mask.url, { projectId });
            if (aborted) return;
            const maskFileName = resolveFileName(mask.url, mask.mediaType);
            const maskFile = new File([maskBlob], maskFileName, {
              type: mask.mediaType || maskBlob.type || "image/png",
            });
            const maskObjectUrl = URL.createObjectURL(maskBlob);
            objectUrls.push(maskObjectUrl);
            attachment.mask = {
              file: maskFile,
              objectUrl: maskObjectUrl,
              status: "ready",
              remoteUrl: mask.url,
              mediaType: mask.mediaType || maskFile.type,
            };
            attachment.hasMask = true;
          }

          next.push(attachment);
        } catch {
          continue;
        }
      }

      if (aborted) return;
      setEditAttachments(next);
    };

    void loadAttachments();

    return () => {
      aborted = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [imageParts, isEditing, revokeAttachmentUrls]);

  if (messageKind === "compact_prompt") {
    return null;
  }

  if (messageKind === "compact_summary") {
    const summaryText = getMessagePlainText(message);
    // 中文注释：压缩摘要消息用分隔条展示，并支持点击展开。
    return (
      <div className="group my-0.5 px-2" data-message-id={message.id}>
        <CompactSummaryDivider summary={summaryText} />
      </div>
    );
  }

  return (
    <div
      className={cn("group my-0.5 px-2", message.role === "user" && "pr-5")}
      data-message-id={message.id}
    >
      {message.role === "user" ? (
        <>
          {isEditing ? (
            <div className="flex justify-end mb-6">
              <ChatInputBox
                value={draft}
                onChange={setDraft}
                variant="inline"
                compact
                placeholder="编辑消息…"
                className="w-full max-w-[88%]"
                actionVariant="text"
                submitLabel="发送"
                cancelLabel="取消"
                onCancel={cancelEdit}
                submitDisabled={status !== "ready" && status !== "error"}
                attachments={editAttachments}
                onRemoveAttachment={removeEditAttachment}
                attachmentEditEnabled={false}
                defaultProjectId={projectId}
                workspaceId={workspaceId}
                onSubmit={handleResend}
              />
            </div>
          ) : (
            <MessageHuman message={message} />
          )}
          {!isEditing && (
            <MessageHumanAction
              message={message}
              actionsClassName={actionVisibility(isLastHumanMessage)}
              isEditing={isEditing}
              onToggleEdit={toggleEdit}
            />
          )}
        </>
      ) : (
        <>
          <MessageAi message={message} isAnimating={isAnimating} />
          {!hideAiActions &&
            !shouldHideAiActionsForApproval &&
            (hasVisibleContent || shouldShowBranchNav) && (
            <div className={cn("mt-1", actionVisibility(showAiActionsAlways))}>
              <MessageAiAction message={message} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default React.memo(MessageItem);
