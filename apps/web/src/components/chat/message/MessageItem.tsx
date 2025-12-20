"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChatInputBox } from "../ChatInput";
import MessageAiAction from "./MessageAiAction";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageHumanAction from "./MessageHumanAction";
import { useChatContext } from "../ChatProvider";
import { messageHasVisibleContent } from "@/lib/chat/message-visible";

interface MessageItemProps {
  message: UIMessage;
  isLastHumanMessage?: boolean;
  isLastAiMessage?: boolean;
  hideAiActions?: boolean;
}

function MessageItem({
  message,
  isLastHumanMessage,
  isLastAiMessage,
  hideAiActions,
}: MessageItemProps) {
  const { resendUserMessage, status, clearError, branchMessageIds, siblingNav } = useChatContext();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const messageText = React.useMemo(() => {
    return (message.parts ?? [])
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text)
      .join("");
  }, [message.parts]);

  // 判断消息是否有可见内容（避免空消息也渲染底部操作按钮）
  const hasVisibleContent = React.useMemo(() => {
    return messageHasVisibleContent(message);
  }, [message]);

  // 中文注释：当消息本身没有可见内容时，如果它是“分支节点”，仍然要显示分支切换（否则切到边界会“消失”）。
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
      if (!value.trim()) return;
      if (status === "error") clearError();

      // 关键：编辑重发 = 在同 parent 下创建新 sibling，并把 UI 切到新分支
      resendUserMessage(message.id, value);

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

  return (
    <div
      className={cn("group my-0.5", message.role === "user" && "pr-4")}
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
                autoFocus
                placeholder="编辑消息…"
                className="w-full max-w-[70%]"
                actionVariant="text"
                submitLabel="发送"
                cancelLabel="取消"
                onCancel={cancelEdit}
                submitDisabled={status !== "ready" && status !== "error"}
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
          <MessageAi message={message} />
          {!hideAiActions && (hasVisibleContent || shouldShowBranchNav) && (
            <div className={cn("mt-1", actionVisibility(isLastAiMessage))}>
              <MessageAiAction message={message} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default React.memo(MessageItem);
