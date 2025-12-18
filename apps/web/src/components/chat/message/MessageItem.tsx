"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChatInputBox } from "../ChatInput";
import MessageAiAction from "./MessageAiAction";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageHumanAction from "./MessageHumanAction";

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
    const parts = message.parts ?? [];
    const hasText = parts.some(
      (part: any) =>
        part?.type === "text" && typeof part?.text === "string" && part.text.trim().length > 0
    );
    if (hasText) return true;
    return parts.some(
      (part: any) =>
        typeof part?.type === "string" &&
        (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
    );
  }, [message.parts]);

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

  const actionVisibility = (showAlways?: boolean) =>
    cn(
      "transition-opacity duration-200",
      showAlways
        ? "opacity-100"
        : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
    );

  return (
    <div className={cn("group my-0.5", message.role === "user" && "pr-4")}>
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
                submitDisabled
                placeholder="编辑消息…"
                className="w-full max-w-[70%]"
                actionVariant="text"
                submitLabel="发送"
                cancelLabel="取消"
                onCancel={cancelEdit}
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
          {!hideAiActions && hasVisibleContent && (
            <div className={cn("mt-1", actionVisibility(isLastAiMessage))}>
              <MessageAiAction
                message={message}
                canRetry={Boolean(isLastAiMessage)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default React.memo(MessageItem);
