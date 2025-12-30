"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronUp,
  X,
  Mic,
  AtSign,
  Hash,
  Image,
} from "lucide-react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useChatContext } from "./ChatProvider";
import { cn } from "@/lib/utils";
import SelectMode from "./input/SelectMode";
import type { ChatAttachment } from "./chat-attachments";
import {
  ChatImageAttachments,
  type ChatImageAttachmentsHandle,
} from "./file/ChatImageAttachments";
import {
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_REF_MIME,
} from "@/components/ui/teatime/drag-drop-types";
import { MentionsInput, Mention } from "react-mentions";

interface ChatInputProps {
  className?: string;
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onClearAttachments?: () => void;
}

const MAX_CHARS = 2000;

export interface ChatInputBoxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  compact?: boolean;
  variant?: "default" | "inline";
  actionVariant?: "icon" | "text";
  submitLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  submitDisabled?: boolean;
  onSubmit?: (value: string) => void;
  onStop?: () => void;
  onCancel?: () => void;
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
}

export function ChatInputBox({
  value,
  onChange,
  className,
  placeholder = "Ask, search, or make anything…",
  compact,
  variant = "default",
  actionVariant = "icon",
  submitLabel = "发送",
  cancelLabel = "取消",
  isLoading,
  isStreaming,
  submitDisabled,
  onSubmit,
  onStop,
  onCancel,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
}: ChatInputBoxProps) {
  const [plainTextValue, setPlainTextValue] = useState(value);
  const isOverLimit = plainTextValue.length > MAX_CHARS;
  const imageAttachmentsRef = useRef<ChatImageAttachmentsHandle | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const [textareaHeight, setTextareaHeight] = useState(48);

  /**
   * Animate the textarea height to match its content.
   */
  const syncTextareaHeight = (textarea: HTMLTextAreaElement) => {
    // 中文注释：用 rAF 合并高度测量，避免同步读写触发布局抖动。
    if (resizeRafRef.current) {
      window.cancelAnimationFrame(resizeRafRef.current);
    }
    resizeRafRef.current = window.requestAnimationFrame(() => {
      const nextHeight = Math.max(48, textarea.scrollHeight);
      setTextareaHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    if (submitDisabled) return;
    if (isOverLimit) return;
    if (!plainTextValue.trim()) return;
    onSubmit(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 检查是否正在使用输入法进行输入，如果是则不发送消息
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (onSubmit && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const [isFocused, setIsFocused] = useState(false);
  const canSubmit = Boolean(onSubmit) && !submitDisabled && !isOverLimit;
  // 流式生成时按钮变为“停止”，不应被 submitDisabled 禁用
  const isSendDisabled = isLoading
    ? false
    : submitDisabled || isOverLimit || !plainTextValue.trim();

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    syncTextareaHeight(textarea);
  }, [value]);

  useLayoutEffect(() => {
    return () => {
      if (!resizeRafRef.current) return;
      window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    };
  }, []);

  useEffect(() => {
    setPlainTextValue(value);
  }, [value]);

  const mentionInputStyle = useMemo(
    () => ({
      control: {
        fontSize: "15px",
        lineHeight: "1.5",
      },
      highlighter: {
        padding: 0,
        border: "none",
      },
      input: {
        margin: 0,
        border: "none",
        outline: "none",
        background: "transparent",
        color: "var(--color-foreground)",
        height: `${textareaHeight}px`,
      },
    }),
    [textareaHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // 中文注释：为外部聚焦逻辑保留 data 标记。
    textarea.dataset.teatimeChatInput = "true";
  }, []);

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-xl bg-background border transition-all duration-200 flex flex-col",
        variant === "default" ? "mt-4 max-h-[30%]" : "max-h-none",
        isFocused ? "border-primary ring-1 ring-primary/20" : "border-border",
        isOverLimit &&
          "border-destructive ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
        "teatime-thinking-border",
        // 流式生成中：给输入框加边框流动动画，提示 AI 正在思考
        isStreaming && !isOverLimit && "teatime-thinking-border-on border-transparent",
        className
      )}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(FILE_DRAG_REF_MIME)) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(FILE_DRAG_REF_MIME)) return;
        event.preventDefault();
        const fileName = event.dataTransfer.getData(FILE_DRAG_NAME_MIME);
        const fileRef = event.dataTransfer.getData(FILE_DRAG_REF_MIME);
        if (!fileName || !fileRef) return;
        const mentionText = `@{${fileRef}}`;
        const prefix = value.trim().length > 0 ? `${value} ` : value;
        onChange(`${prefix}${mentionText} `);
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col min-h-[52px] overflow-hidden"
      >
        <ChatImageAttachments
          ref={imageAttachmentsRef}
          attachments={attachments}
          onAddAttachments={onAddAttachments}
          onRemoveAttachment={onRemoveAttachment}
        />

        <div
          className={cn(
            "px-4 pt-3 pb-2 flex-1 min-h-0 transition-[padding] duration-500 ease-out",
            compact && "pb-3",
            attachments && attachments.length > 0 && "pt-2"
          )}
        >
          <ScrollArea.Root className="w-full h-full">
            <ScrollArea.Viewport className="w-full h-full min-h-0">
              <MentionsInput
                value={value}
                onChange={(_event, nextValue, nextPlainTextValue) => {
                  onChange(nextValue);
                  setPlainTextValue(nextPlainTextValue);
                }}
                inputRef={textareaRef}
                style={mentionInputStyle}
                placeholder={placeholder}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className={cn(
                  "w-full",
                  isOverLimit && "text-destructive"
                )}
              >
                <Mention
                  trigger="@"
                  data={[]}
                  markup="@{__id__}"
                  className="teatime-mention-chip"
                  displayTransform={(id) => {
                    const parts = id.split("/");
                    return parts[parts.length - 1] || id;
                  }}
                  appendSpaceOnAdd
                />
              </MentionsInput>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-2 px-3 pb-3 shrink-0 min-w-0">
          {!compact ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <AtSign className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Hash className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={() => imageAttachmentsRef.current?.openPicker()}
                disabled={!onAddAttachments}
              >
                <Image className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div />
          )}

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {isOverLimit && (
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors mr-2",
                  "text-destructive"
                )}
              >
                {value.length} / {MAX_CHARS}
              </span>
            )}
            
            {!compact && <SelectMode />}

            {!compact && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}

            {actionVariant === "text" && onCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full px-2.5 text-xs shadow-none"
                onClick={onCancel}
              >
                {cancelLabel}
              </Button>
            )}

            {actionVariant === "text" ? (
              <Button
                type={canSubmit ? "submit" : "button"}
                disabled={isSendDisabled}
                size="sm"
                className={cn(
                  "h-7 rounded-full px-2.5 text-xs",
                  canSubmit
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                )}
              >
                {submitLabel}
              </Button>
            ) : (
              <Button
                type={isLoading ? "button" : canSubmit ? "submit" : "button"}
                onClick={isLoading ? onStop : undefined}
                disabled={isSendDisabled || (isLoading && !onStop)}
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-full transition-all duration-200 shadow-none",
                  isLoading
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                    : isOverLimit
                      ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                      : canSubmit
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                )}
              >
                {isLoading ? <X className="h-4 w-4" /> : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        
        {isOverLimit && (
           <div className="px-4 pb-2 text-xs text-destructive font-medium animate-in fade-in slide-in-from-top-1">
             Content exceeds the {MAX_CHARS} character limit. Please shorten your message.
           </div>
        )}
      </form>
    </div>
  );
}

export default function ChatInput({
  className,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onClearAttachments,
}: ChatInputProps) {
  const {
    sendMessage,
    status,
    stopGenerating,
    clearError,
    input,
    setInput,
    isHistoryLoading,
  } = useChatContext();

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  const handleSubmit = (value: string) => {
    const canSubmit = status === "ready" || status === "error";
    if (!canSubmit) return;
    // 切换 session 的历史加载期间禁止发送，避免 parentMessageId 与当前会话链不一致
    if (isHistoryLoading) return;
    if (!value.trim()) return;
    if (status === "error") clearError();
    // 关键：必须走 UIMessage.parts 形式，才能携带 parentMessageId 等扩展字段
    sendMessage({ parts: [{ type: "text", text: value }] } as any);
    setInput("");
    onClearAttachments?.();
  };

  return (
    <ChatInputBox
      value={input}
      onChange={setInput}
      className={className}
      variant="default"
      compact={false}
      isLoading={isLoading}
      isStreaming={isStreaming}
      submitDisabled={isHistoryLoading || (status !== "ready" && status !== "error")}
      onSubmit={handleSubmit}
      onStop={stopGenerating}
      attachments={attachments}
      onAddAttachments={onAddAttachments}
      onRemoveAttachment={onRemoveAttachment}
    />
  );
}
