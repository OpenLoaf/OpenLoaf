"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  FILE_DRAG_REF_MIME,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_URI_MIME,
} from "@/components/ui/teatime/drag-drop-types";
import type { Value } from "platejs";
import { setValue } from "platejs";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import { ClipboardKit } from "@/components/editor/plugins/clipboard-kit";
import { ParagraphPlugin, Plate, usePlateEditor } from "platejs/react";
import { Editor as SlateEditor, Text, type BaseEditor } from "slate";
import type { RenderLeafProps } from "platejs";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { ParagraphElement } from "@/components/ui/paragraph-node";
import {
  buildMentionNode,
  getPlainTextValue,
  parseChatValue,
  serializeChatValue,
} from "./chat-input-utils";
import { buildUriFromRoot } from "@/components/project/filesystem/file-system-utils";
import { trpc } from "@/utils/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTabs } from "@/hooks/use-tabs";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { toast } from "sonner";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import ChatImageOutputOption from "./ChatImageOutputOption";
import { resolveServerUrl } from "@/utils/server-url";

interface ChatInputProps {
  className?: string;
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onClearAttachments?: () => void;
}

const MAX_CHARS = 2000;
const COMMAND_REGEX = /(^|\s)(\/[\w-]+)/g;


function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isImageFileName(name: string) {
  return /\.(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i.test(name);
}

function getFileNameFromUri(uri: string) {
  const raw = uri.split("/").pop() || "image";
  const clean = raw.split("?")[0] || "image";
  return decodeURIComponent(clean);
}

function getPreviewEndpoint(url: string) {
  const apiBase = resolveServerUrl();
  const encoded = encodeURIComponent(url);
  return apiBase
    ? `${apiBase}/chat/attachments/preview?url=${encoded}`
    : `/chat/attachments/preview?url=${encoded}`;
}

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
  /** Optional header content above the input form. */
  header?: ReactNode;
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
  header,
}: ChatInputBoxProps) {
  const initialValue = useMemo(() => parseChatValue(value), []);
  const [plainTextValue, setPlainTextValue] = useState(() =>
    getPlainTextValue(initialValue)
  );
  const isOverLimit = plainTextValue.length > MAX_CHARS;
  const hasReadyAttachments = (attachments ?? []).some((item) => {
    if (item.status !== "ready" || !item.remoteUrl) return false;
    if (!item.mask) return true;
    return item.mask.status === "ready" && Boolean(item.mask.remoteUrl);
  });
  const imageAttachmentsRef = useRef<ChatImageAttachmentsHandle | null>(null);
  const lastSerializedRef = useRef(value);
  const { data: projects = [] } = useQuery(trpc.project.list.queryOptions());
  const queryClient = useQueryClient();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const plugins = useMemo(
    () => [
      ParagraphPlugin.withComponent(ParagraphElement),
      ...MentionKit,
      ...ClipboardKit,
    ],
    []
  );
  const editor = usePlateEditor({
    id: "chat-input",
    plugins,
    value: initialValue,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    if (submitDisabled) return;
    if (isOverLimit) return;
    if (!plainTextValue.trim() && !hasReadyAttachments) return;
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
    : submitDisabled || isOverLimit || (!plainTextValue.trim() && !hasReadyAttachments);

  const decorate = useCallback(
    (entry: any) => {
      if (!Array.isArray(entry)) return [];
      const [node, path] = entry;
      const ranges: Array<{ command?: boolean; anchor: any; focus: any }> = [];
      if (!Text.isText(node)) return ranges;
      COMMAND_REGEX.lastIndex = 0;
      let match = COMMAND_REGEX.exec(node.text);
      while (match) {
        const lead = match[1] ?? "";
        const command = match[2] ?? "";
        const start = match.index + lead.length;
        const end = start + command.length;
        ranges.push({
          command: true,
          anchor: { path, offset: start },
          focus: { path, offset: end },
        });
        match = COMMAND_REGEX.exec(node.text);
      }
      return ranges;
    },
    []
  );

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => {
      const { attributes, children, leaf } = props;
      if ((leaf as any).command) {
        return (
          <span
            {...attributes}
            className="inline-flex items-center rounded-md bg-muted px-1.5 text-[11px] font-semibold text-foreground"
          >
            {children}
          </span>
        );
      }
      return <span {...attributes}>{children}</span>;
    },
    []
  );

  useEffect(() => {
    if (value === lastSerializedRef.current) return;
    const nextValue = parseChatValue(value);
    setValue(editor, nextValue);
    setPlainTextValue(getPlainTextValue(nextValue));
    lastSerializedRef.current = value;
  }, [editor, value]);

  const handleValueChange = useCallback(
    (nextValue: Value) => {
      const serialized = serializeChatValue(nextValue);
      lastSerializedRef.current = serialized;
      onChange(serialized);
      setPlainTextValue(getPlainTextValue(nextValue));
    },
    [onChange]
  );

  const resolveRootUri = useCallback(
    (projectId: string) => {
      const queue = [...projects];
      while (queue.length > 0) {
        const node = queue.shift() as any;
        if (!node) continue;
        if (node.projectId === projectId && typeof node.rootUri === "string") {
          return node.rootUri as string;
        }
        const children = Array.isArray(node.children) ? node.children : [];
        for (const child of children) {
          queue.push(child);
        }
      }
      return "";
    },
    [projects]
  );

  const handleMentionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("button")) return;
      const mentionEl = target.closest<HTMLElement>("[data-teatime-mention=\"true\"]");
      if (!mentionEl) return;
      if (mentionEl.querySelector("button")?.contains(target)) return;
      const value =
        mentionEl.getAttribute("data-mention-value") ||
        mentionEl.getAttribute("data-slate-value") ||
        "";
      if (!value) return;
      const match = value.match(/^(.*?)(?::(\d+)-(\d+))?$/);
      const baseValue = match?.[1] ?? value;
      if (!baseValue.includes("/")) return;
      const parts = baseValue.split("/");
      const projectId = parts[0] ?? "";
      const relativePath = parts.slice(1).join("/");
      if (!projectId || !relativePath) return;
      const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
      // 根据扩展名判断文件类型（图片/代码）。
      const isImageExt = /^(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i.test(ext);
      const isCodeExt = /^(js|ts|tsx|jsx|json|yml|yaml|toml|ini|py|go|rs|java|cpp|c|h|hpp|css|scss|less|html|xml|sh|zsh|md|mdx)$/i.test(ext);
      if (!isImageExt && !isCodeExt) return;
      const rootUri = resolveRootUri(projectId);
      if (!rootUri) return;
      const uri = buildUriFromRoot(rootUri, relativePath);
      if (!uri || !activeTabId) return;
      event.preventDefault();
      event.stopPropagation();
      const fileName = relativePath.split("/").pop() ?? relativePath;
      const stackId = `${isImageExt ? "image-viewer" : "code-viewer"}:${uri}`;
      pushStackItem(activeTabId, {
        id: stackId,
        sourceKey: stackId,
        component: isImageExt ? "image-viewer" : "code-viewer",
        title: fileName,
        params: {
          uri,
          name: fileName,
          ext,
          rootUri: isCodeExt ? rootUri : undefined,
          projectId: isCodeExt ? projectId : undefined,
        },
      });
    },
    [activeTabId, pushStackItem, resolveRootUri]
  );

  const insertFileMention = useCallback((fileRef: string) => {
    // 将文件引用插入为 mention，并补一个空格。
    if (!editor.selection) {
      const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
      editor.tf.select(endPoint);
    }
    editor.tf.focus();
    editor.tf.insertNodes(buildMentionNode(fileRef), { select: true });
    editor.tf.insertText(" ");
  }, [editor]);

  useEffect(() => {
    const handleInsertMention = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: string }>).detail;
      const value = detail?.value?.trim();
      if (!value) return;
      insertFileMention(value);
    };
    window.addEventListener("teatime:chat-insert-mention", handleInsertMention);
    return () => {
      window.removeEventListener("teatime:chat-insert-mention", handleInsertMention);
    };
  }, [insertFileMention]);


  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-xl bg-background border transition-all duration-200 flex flex-col",
        variant === "default" ? "mt-4 max-h-[30%]" : "max-h-none",
        isFocused ? "border-primary ring-1 ring-primary/20" : "border-border",
        isOverLimit &&
          "border-destructive ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
        "teatime-thinking-border",
        // SSE 请求进行中（含非流式）：给输入框加边框流动动画，提示 AI 正在思考
        isStreaming && !isOverLimit && "teatime-thinking-border-on border-transparent",
        className
      )}
      onPointerDownCapture={handleMentionPointerDown}
      onDragOver={(event) => {
        if (
          !event.dataTransfer.types.includes(FILE_DRAG_REF_MIME) &&
          !event.dataTransfer.types.includes(FILE_DRAG_URI_MIME)
        ) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={async (event) => {
        const fileUri = event.dataTransfer.getData(FILE_DRAG_URI_MIME);
        if (fileUri) {
          event.preventDefault();
          if (!onAddAttachments) return;
          try {
            // 处理从消息中拖拽的图片，复用附件上传流程。
            const fileName =
              event.dataTransfer.getData(FILE_DRAG_NAME_MIME) ||
              getFileNameFromUri(fileUri);
            const isImageByName = isImageFileName(fileName);
            const blob = fileUri.startsWith("teatime-file://")
              ? await fetch(getPreviewEndpoint(fileUri)).then((res) => res.blob())
              : await fetch(fileUri).then((res) => res.blob());
            const isImageByType = blob.type.startsWith("image/");
            if (!isImageByName && !isImageByType) return;
            const file = new File([blob], fileName, {
              type: blob.type || "application/octet-stream",
            });
            onAddAttachments([file]);
          } catch {
            return;
          }
          return;
        }
        const fileRef = event.dataTransfer.getData(FILE_DRAG_REF_MIME);
        if (!fileRef) return;
        event.preventDefault();
        const match = fileRef.match(/^(.*?)(?::(\d+)-(\d+))?$/);
        const baseValue = match?.[1] ?? fileRef;
        if (!baseValue.includes("/")) return;
        const parts = baseValue.split("/");
        const projectId = parts[0] ?? "";
        const relativePath = parts.slice(1).join("/");
        if (!projectId || !relativePath) return;
        const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
        const isImageExt = /^(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i.test(ext);
        if (!isImageExt || !onAddAttachments) {
          insertFileMention(fileRef);
          return;
        }
        const rootUri = resolveRootUri(projectId);
        if (!rootUri) return;
        const uri = buildUriFromRoot(rootUri, relativePath);
        if (!uri) return;
        try {
          // 将项目内图片转为 File，交给 ChatImageAttachments 走上传。
          const payload = await queryClient.fetchQuery(
            trpc.fs.readBinary.queryOptions({ uri })
          );
          if (!payload?.contentBase64) return;
          const bytes = base64ToUint8Array(payload.contentBase64);
          const mime = payload.mime || "application/octet-stream";
          const fileName = relativePath.split("/").pop() || "image";
          const arrayBuffer = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(arrayBuffer).set(bytes);
          const file = new File([arrayBuffer], fileName, { type: mime });
          onAddAttachments([file]);
        } catch {
          return;
        }
      }}
      onDropCapture={(event) => {
        const fileRef = event.dataTransfer.getData(FILE_DRAG_REF_MIME);
        const fileUri = event.dataTransfer.getData(FILE_DRAG_URI_MIME);
        if (!fileRef && !fileUri) return;
        event.preventDefault();
      }}
    >
      {header ? (
        <div className="rounded-t-xl border-b border-border bg-muted/30">
          {header}
        </div>
      ) : null}
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
            "px-2 pt-1 pb-2 flex-1 min-h-0 transition-[padding] duration-500 ease-out",
            compact && "pb-3",
            attachments && attachments.length > 0 && "pt-2"
          )}
        >
          <ScrollArea.Root className="w-full h-full">
            <ScrollArea.Viewport className="w-full h-full min-h-0">
              <Plate
                editor={editor}
                decorate={decorate}
                renderLeaf={renderLeaf}
                onValueChange={({ value: nextValue }) =>
                  handleValueChange(nextValue)
                }
              >
                <EditorContainer className="bg-transparent">
                  <Editor
                    variant="none"
                    className={cn(
                      "min-h-[56px] text-[13px] leading-5",
                      isOverLimit && "text-destructive"
                    )}
                    placeholder={placeholder}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    data-teatime-chat-input="true"
                  />
                </EditorContainer>
              </Plate>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-2 px-1.5 pb-1.5 shrink-0 min-w-0">
          {!compact ? (
            <div className="flex shrink-0 items-center gap-0.5">
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

          <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-0.5 overflow-hidden">
            {isOverLimit && (
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors mr-2",
                  "text-destructive"
                )}
              >
                {plainTextValue.length} / {MAX_CHARS}
              </span>
            )}
            
            {!compact && (
              <div className="min-w-0 shrink">
                <SelectMode />
              </div>
            )}

            {!compact && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                  "h-7 rounded-full px-2.5 text-xs shrink-0",
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
                  "h-8 w-8 rounded-full shrink-0 transition-all duration-200 shadow-none",
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
    imageOptions,
  } = useChatContext();
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels],
  );
  const selectedModelId =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId.trim()
      : "";
  const isAutoModel = !selectedModelId;
  const selectedModel = modelOptions.find((option) => option.id === selectedModelId);
  const supportsImageGeneration = Boolean(selectedModel?.tags?.includes("image_generation"));
  const supportsImageEdit = Boolean(selectedModel?.tags?.includes("image_edit"));
  // 模型声明图片生成时显示图片输出选项。
  const showImageOutputOptions = supportsImageGeneration;
  const canAttachImage = isAutoModel
    ? true
    : supportsImageEdit;
  const handleAddAttachments = canAttachImage ? onAddAttachments : undefined;

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "submitted" || status === "streaming";
  const hasPendingAttachments = (attachments ?? []).some(
    (item) => item.status === "loading" || item.mask?.status === "loading"
  );
  // 有图片编辑时隐藏比例选项。
  const hasMaskedAttachment = (attachments ?? []).some((item) => item.mask);

  const handleSubmit = async (value: string) => {
    const canSubmit = status === "ready" || status === "error";
    if (!canSubmit) return;
    // 切换 session 的历史加载期间禁止发送，避免 parentMessageId 与当前会话链不一致
    if (isHistoryLoading) return;
    if (hasPendingAttachments) return;
    const textValue = value.trim();
    const readyImages = (attachments ?? []).filter((item) => {
      if (item.status !== "ready" || !item.remoteUrl) return false;
      if (!item.mask) return true;
      return item.mask.status === "ready" && Boolean(item.mask.remoteUrl);
    });
    if (!textValue && readyImages.length === 0) return;
    // 存在遮罩时必须命中图片编辑模型。
    const hasMaskedAttachment = readyImages.some(
      (item) => item.mask && item.mask.remoteUrl
    );
    if (!isAutoModel && (hasMaskedAttachment || readyImages.length > 0)) {
      if (!supportsImageEdit) {
        toast.error("当前模型不支持图片编辑");
        return;
      }
    }
    if (status === "error") clearError();
    const imageParts = readyImages.flatMap((item) => {
      if (!item.remoteUrl) return [];
      const base = {
        type: "file" as const,
        url: item.remoteUrl,
        mediaType: item.mediaType || item.file.type || "application/octet-stream",
      };
      if (!item.mask?.remoteUrl) return [base];
      // mask 通过 purpose=mask 传递给服务端。
      const maskPart = {
        type: "file" as const,
        url: item.mask.remoteUrl,
        mediaType: item.mask.mediaType || item.mask.file.type || "application/octet-stream",
        purpose: "mask" as const,
      };
      return [base, maskPart];
    });
    const parts = [
      ...imageParts,
      ...(textValue ? [{ type: "text", text: textValue }] : []),
    ];
    // 从 chat session 选项读取图片参数，写入本次消息 metadata。
    const normalizedImageOptions = normalizeImageOptions(imageOptions);
    // 不支持图片生成时，不传递图片生成参数。
    const safeImageOptions = supportsImageGeneration ? normalizedImageOptions : undefined;
    const metadata = safeImageOptions ? { imageOptions: safeImageOptions } : undefined;
    // 关键：必须走 UIMessage.parts 形式，才能携带 parentMessageId 等扩展字段
    sendMessage({ parts, ...(metadata ? { metadata } : {}) } as any);
    setInput("");
    onClearAttachments?.();
  };

  return (
    <>
      <ChatInputBox
        value={input}
        onChange={setInput}
        className={className}
        variant="default"
        compact={false}
        isLoading={isLoading}
        isStreaming={isStreaming}
        submitDisabled={
          isHistoryLoading ||
          (status !== "ready" && status !== "error") ||
          hasPendingAttachments
        }
        onSubmit={handleSubmit}
        onStop={stopGenerating}
        attachments={attachments}
        onAddAttachments={handleAddAttachments}
        onRemoveAttachment={onRemoveAttachment}
        header={
          showImageOutputOptions ? (
            <ChatImageOutputOption
              model={selectedModel}
              variant="inline"
              hideAspectRatio={hasMaskedAttachment}
            />
          ) : null
        }
      />
    </>
  );
}
