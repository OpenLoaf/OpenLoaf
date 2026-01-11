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
import type {
  ChatAttachment,
  ChatAttachmentInput,
  MaskedAttachmentInput,
} from "./chat-attachments";
import {
  ChatImageAttachments,
  type ChatImageAttachmentsHandle,
} from "./file/ChatImageAttachments";
import {
  FILE_DRAG_REF_MIME,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_URI_MIME,
  FILE_DRAG_MASK_URI_MIME,
} from "@/components/ui/tenas/drag-drop-types";
import { readImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import { buildMaskedPreviewUrl, resolveMaskFileName } from "@/lib/image/mask";
import type { Value } from "platejs";
import { setValue } from "platejs";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import { ClipboardKit } from "@/components/editor/plugins/clipboard-kit";
import { ParagraphPlugin, Plate, usePlateEditor } from "platejs/react";
import { Editor as SlateEditor, Text, type BaseEditor } from "slate";
import type { RenderLeafProps } from "platejs";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { ParagraphElement } from "@/components/ui/paragraph-node";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import {
  buildMentionNode,
  getPlainTextValue,
  parseChatValue,
  serializeChatValue,
} from "./chat-input-utils";
import { buildUriFromRoot, parseTenasFileUrl } from "@/components/project/filesystem/utils/file-system-utils";
import { trpc } from "@/utils/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/hooks/use-projects";
import { useTabs } from "@/hooks/use-tabs";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { handleChatMentionPointerDown, resolveProjectRootUri } from "@/lib/chat/mention-pointer";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { toast } from "sonner";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import { normalizeCodexOptions } from "@/lib/chat/codex-options";
import ChatImageOutputOption from "./ChatImageOutputOption";
import CodexOption from "./options/CodexOption";
import { supportsImageEdit, supportsImageGeneration, supportsToolCall } from "@/lib/model-capabilities";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";

interface ChatInputProps {
  className?: string;
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onClearAttachments?: () => void;
  onReplaceMaskedAttachment?: (attachmentId: string, input: MaskedAttachmentInput) => void;
  canAttachAll?: boolean;
  canAttachImage?: boolean;
  onDropHandled?: () => void;
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

function formatDragData(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? []).map((item) => ({
    kind: item.kind,
    type: item.type,
  }));
  const files = Array.from(dataTransfer.files ?? []).map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
  }));
  return JSON.stringify({
    types: Array.from(dataTransfer.types ?? []),
    items,
    files,
    data: {
      fileRef: dataTransfer.getData(FILE_DRAG_REF_MIME),
      fileUri: dataTransfer.getData(FILE_DRAG_URI_MIME),
      fileName: dataTransfer.getData(FILE_DRAG_NAME_MIME),
      fileMaskUri: dataTransfer.getData(FILE_DRAG_MASK_URI_MIME),
      text: dataTransfer.getData("text/plain"),
      uriList: dataTransfer.getData("text/uri-list"),
    },
  });
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
  onAddAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  onAddMaskedAttachment?: (input: MaskedAttachmentInput) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onReplaceMaskedAttachment?: (attachmentId: string, input: MaskedAttachmentInput) => void;
  attachmentEditEnabled?: boolean;
  /** Whether all file types can be attached via drag. */
  canAttachAll?: boolean;
  /** Whether image files can be attached via drag. */
  canAttachImage?: boolean;
  /** Optional header content above the input form. */
  header?: ReactNode;
  onDropHandled?: () => void;
  /** Default project id for file selection. */
  defaultProjectId?: string;
  /** Active chat tab id for mention inserts. */
  tabId?: string;
  /** Dictation language for OS speech recognition. */
  dictationLanguage?: string;
  /** Whether to play a start tone when dictation begins. */
  dictationSoundEnabled?: boolean;
  /** Notify dictation listening state changes. */
  onDictationListeningChange?: (isListening: boolean) => void;
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
  onAddMaskedAttachment,
  onRemoveAttachment,
  onReplaceMaskedAttachment,
  attachmentEditEnabled = true,
  canAttachAll = false,
  canAttachImage = false,
  header,
  onDropHandled,
  defaultProjectId,
  tabId,
  dictationLanguage,
  dictationSoundEnabled,
  onDictationListeningChange,
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
  /** Whether the file picker dialog is open. */
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const { data: projects = [] } = useProjects();
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
  const { isListening, isSupported: isDictationSupported, toggle: toggleDictation } =
    useSpeechDictation({
      editor,
      language: dictationLanguage,
      enableStartTone: dictationSoundEnabled,
      onError: (message) => toast.error(message),
    });
  useEffect(() => {
    onDictationListeningChange?.(isListening);
  }, [isListening, onDictationListeningChange]);

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
    (projectId: string) => resolveProjectRootUri(projects, projectId),
    [projects]
  );
  const defaultRootUri = useMemo(() => {
    if (!defaultProjectId) return undefined;
    const resolved = resolveProjectRootUri(projects, defaultProjectId);
    return resolved || undefined;
  }, [defaultProjectId, projects]);

  const handleMentionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleChatMentionPointerDown(event, {
        activeTabId,
        projects,
        pushStackItem,
      });
    },
    [activeTabId, projects, pushStackItem]
  );

  /** Focus the editor without throwing when DOM is unavailable. */
  const focusEditorSafely = useCallback(() => {
    try {
      editor.tf.focus();
    } catch (error) {
      console.warn("[ChatInput] focus failed", error);
    }
  }, [editor]);

  /** Insert a file reference as a mention node. */
  const insertFileMention = useCallback((fileRef: string, options?: { skipFocus?: boolean }) => {
    // 逻辑：将文件引用插入为 mention，并补一个空格。
    if (!editor.selection) {
      const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
      editor.tf.select(endPoint);
    }
    if (!options?.skipFocus) {
      focusEditorSafely();
    }
    editor.tf.insertNodes(buildMentionNode(fileRef));
    editor.tf.insertText(" ");
  }, [editor, focusEditorSafely]);

  /** Insert file references using the same logic as drag-and-drop. */
  const handleProjectFileRefsInsert = useCallback(
    async (fileRefs: string[]) => {
      if (!canAttachAll && !canAttachImage) return;
      const normalizedRefs = Array.from(
        new Set(
          fileRefs
            .map((value) => {
              const trimmed = value.trim();
              if (!trimmed) return "";
              if (trimmed.startsWith("tenas-file://")) {
                const parsed = parseTenasFileUrl(trimmed);
                return parsed ? `${parsed.projectId}/${parsed.relativePath}` : "";
              }
              return trimmed;
            })
            .filter(Boolean)
        )
      );
      for (const fileRef of normalizedRefs) {
        const match = fileRef.match(/^(.*?)(?::(\d+)-(\d+))?$/);
        const baseValue = match?.[1] ?? fileRef;
        if (!baseValue.includes("/")) continue;
        const parts = baseValue.split("/");
        const projectId = parts[0] ?? "";
        const relativePath = parts.slice(1).join("/");
        if (!projectId || !relativePath) continue;
        const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
        const isImageExt = /^(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i.test(ext);
        if (!isImageExt || !onAddAttachments) {
          if (canAttachAll) {
            insertFileMention(fileRef);
          }
          continue;
        }
        const rootUri = resolveRootUri(projectId);
        if (!rootUri) continue;
        const uri = buildUriFromRoot(rootUri, relativePath);
        if (!uri) continue;
        try {
          // 将项目内图片转为 File，交给 ChatImageAttachments 走上传。
          const payload = await queryClient.fetchQuery(
            trpc.fs.readBinary.queryOptions({ uri })
          );
          if (!payload?.contentBase64) continue;
          const bytes = base64ToUint8Array(payload.contentBase64);
          const mime = payload.mime || "application/octet-stream";
          const fileName = relativePath.split("/").pop() || "image";
          const arrayBuffer = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(arrayBuffer).set(bytes);
          const file = new File([arrayBuffer], fileName, { type: mime });
          onAddAttachments([file]);
        } catch {
          continue;
        }
      }
    },
    [
      canAttachAll,
      canAttachImage,
      insertFileMention,
      onAddAttachments,
      queryClient,
      resolveRootUri,
      trpc.fs.readBinary,
    ]
  );

  /** Handle file refs selected from the picker. */
  const handleSelectFileRefs = useCallback(
    (fileRefs: string[]) => {
      void handleProjectFileRefsInsert(fileRefs);
    },
    [handleProjectFileRefsInsert]
  );

  useEffect(() => {
    const handleInsertMention = (event: Event) => {
      // 中文注释：仅活跃标签页响应插入事件，避免隐藏面板触发 Slate DOM 错误。
      if (tabId) {
        if (!activeTabId || activeTabId !== tabId) return;
      }
      const detail = (event as CustomEvent<{ value?: string; keepSelection?: boolean }>).detail;
      const value = detail?.value?.trim();
      if (!value) return;
      insertFileMention(value, { skipFocus: detail?.keepSelection });
    };
    window.addEventListener("tenas:chat-insert-mention", handleInsertMention);
    return () => {
      window.removeEventListener("tenas:chat-insert-mention", handleInsertMention);
    };
  }, [activeTabId, insertFileMention, tabId]);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    console.debug("[ChatInput] drop payload", formatDragData(event.dataTransfer));
    const imagePayload = readImageDragPayload(event.dataTransfer);
    if (imagePayload) {
      if (!canAttachImage && !canAttachAll) return;
      const payloadFileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
      const isPayloadImage = Boolean(imagePayload.maskUri) || isImageFileName(payloadFileName);
      if (!isPayloadImage && canAttachAll) {
        const fileRef =
          event.dataTransfer.getData(FILE_DRAG_REF_MIME) ||
          (() => {
            if (!imagePayload.baseUri.startsWith("tenas-file://")) return "";
            const parsed = parseTenasFileUrl(imagePayload.baseUri);
            return parsed ? `${parsed.projectId}/${parsed.relativePath}` : "";
          })();
        if (fileRef) {
          await handleProjectFileRefsInsert([fileRef]);
        }
        return;
      }
      if (imagePayload.maskUri) {
        if (!onAddMaskedAttachment) return;
        try {
          // 逻辑：拖拽带 mask 的图片时，合成预览并写入附件列表。
          const fileName = payloadFileName;
          const baseBlob = await fetchBlobFromUri(imagePayload.baseUri);
          const maskBlob = await fetchBlobFromUri(imagePayload.maskUri);
          const baseFile = new File([baseBlob], fileName, {
            type: baseBlob.type || "application/octet-stream",
          });
          const maskFile = new File([maskBlob], resolveMaskFileName(fileName), {
            type: "image/png",
          });
          const previewUrl = await buildMaskedPreviewUrl(baseBlob, maskBlob);
          onAddMaskedAttachment({ file: baseFile, maskFile, previewUrl });
        } catch {
          return;
        }
        return;
      }
      if (!onAddAttachments) return;
      try {
        // 处理从消息中拖拽的图片，复用附件上传流程。
        const fileName = payloadFileName;
        const isImageByName = isImageFileName(fileName);
        const blob = await fetchBlobFromUri(imagePayload.baseUri);
        const isImageByType = blob.type.startsWith("image/");
        if (!isImageByName && !isImageByType) return;
        const file = new File([blob], fileName, {
          type: blob.type || "application/octet-stream",
        });
        const sourceUrl = imagePayload.baseUri.startsWith("tenas-file://")
          ? imagePayload.baseUri
          : undefined;
        // 中文注释：应用内拖拽优先使用 tenas-file 引用上传。
        onAddAttachments([{ file, sourceUrl }]);
      } catch {
        return;
      }
      return;
    }
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      if (!onAddAttachments) return;
      if (!canAttachAll && !canAttachImage) return;
      // 中文注释：支持从系统直接拖入图片文件。
      if (canAttachAll) {
        onAddAttachments(files);
      } else {
        const imageFiles = files.filter(
          (file) => file.type.startsWith("image/") || isImageFileName(file.name)
        );
        if (imageFiles.length === 0) return;
        onAddAttachments(imageFiles);
      }
      return;
    }
    const fileRef = event.dataTransfer.getData(FILE_DRAG_REF_MIME);
    if (!fileRef) return;
    await handleProjectFileRefsInsert([fileRef]);
  }, [
    canAttachAll,
    canAttachImage,
    handleProjectFileRefsInsert,
    onAddAttachments,
    onAddMaskedAttachment,
    queryClient,
    resolveRootUri,
    trpc.fs.readBinary,
  ]);


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
        "tenas-thinking-border",
        // SSE 请求进行中（含非流式）或语音输入中：给输入框加边框流动动画。
        (isStreaming || isListening) &&
          !isOverLimit &&
          "tenas-thinking-border-on border-transparent",
        className
      )}
      onPointerDownCapture={handleMentionPointerDown}
      onDragOver={(event) => {
        const hasImageDrag =
          event.dataTransfer.types.includes(FILE_DRAG_URI_MIME) ||
          Boolean(readImageDragPayload(event.dataTransfer));
        const hasFileRef = event.dataTransfer.types.includes(FILE_DRAG_REF_MIME);
        const hasFiles = event.dataTransfer.files?.length > 0;
        if (!hasImageDrag && !hasFileRef && !hasFiles) return;
        if (!canAttachAll && !canAttachImage) return;
        event.preventDefault();
      }}
      onDropCapture={(event) => {
        const fileRef = event.dataTransfer.getData(FILE_DRAG_REF_MIME);
        const imagePayload = readImageDragPayload(event.dataTransfer);
        const hasFiles = event.dataTransfer.files?.length > 0;
        if (!fileRef && !imagePayload && !hasFiles) return;
        event.preventDefault();
        event.stopPropagation();
        onDropHandled?.();
        void handleDrop(event);
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
          onReplaceMaskedAttachment={onReplaceMaskedAttachment}
          enableEdit={attachmentEditEnabled}
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
                    data-tenas-chat-input="true"
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
                onClick={() => setFilePickerOpen(true)}
                disabled={!canAttachAll && !canAttachImage}
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

          <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1.5 overflow-hidden">
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
                className={cn(
                  "rounded-full w-8 h-8 shrink-0 transition-colors",
                  isListening
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={isListening}
                onClick={() => void toggleDictation()}
                disabled={!isDictationSupported}
              >
                <Mic className={cn("w-4 h-4", isListening && "text-destructive")} />
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
                  "h-7 w-7 rounded-full shrink-0 transition-all duration-200 shadow-none",
                  isLoading
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                    : isOverLimit
                      ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                      : canSubmit
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                )}
              >
                {isLoading ? <X className="h-3.5 w-3.5" /> : (
                  <ChevronUp className="w-3.5 h-3.5" />
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
      <ProjectFileSystemTransferDialog
        open={filePickerOpen}
        onOpenChange={setFilePickerOpen}
        mode="select"
        selectTarget="file"
        defaultRootUri={defaultRootUri}
        onSelectFileRefs={handleSelectFileRefs}
      />
    </div>
  );
}

export default function ChatInput({
  className,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onClearAttachments,
  onReplaceMaskedAttachment,
  canAttachAll,
  canAttachImage,
  onDropHandled,
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
    codexOptions,
    addMaskedAttachment,
    projectId,
    tabId,
  } = useChatContext();
  const { basic } = useBasicConfig();
  const setTabDictationStatus = useTabs((s) => s.setTabDictationStatus);
  const dictationLanguage = basic.modelResponseLanguage;
  const dictationSoundEnabled = basic.appNotificationSoundEnabled;
  useEffect(() => {
    return () => {
      if (!tabId) return;
      setTabDictationStatus(tabId, false);
    };
  }, [setTabDictationStatus, tabId]);
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
  const isCodexProvider = selectedModel?.providerId === "codex-cli";
  const canImageGeneration = supportsImageGeneration(selectedModel);
  const canImageEdit = supportsImageEdit(selectedModel);
  // 模型声明图片生成时显示图片输出选项。
  const showImageOutputOptions = canImageGeneration;
  const allowAll =
    typeof canAttachAll === "boolean"
      ? canAttachAll
      : isAutoModel || supportsToolCall(selectedModel);
  const allowImage =
    typeof canAttachImage === "boolean"
      ? canAttachImage
      : allowAll || canImageEdit;
  const handleAddAttachments = allowImage ? onAddAttachments : undefined;

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
    if (!isAutoModel && hasMaskedAttachment && !canImageEdit) {
      toast.error("当前模型不支持图片编辑");
      return;
    }
    if (!allowImage && readyImages.length > 0) {
      toast.error("当前模型不支持图片输入");
      return;
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
    const safeImageOptions = canImageGeneration ? normalizedImageOptions : undefined;
    const normalizedCodexOptions = isCodexProvider
      ? normalizeCodexOptions(codexOptions)
      : undefined;
    const metadataPayload = {
      ...(safeImageOptions ? { imageOptions: safeImageOptions } : {}),
      ...(normalizedCodexOptions ? { codexOptions: normalizedCodexOptions } : {}),
    };
    const metadata =
      Object.keys(metadataPayload).length > 0 ? metadataPayload : undefined;
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
        onAddMaskedAttachment={addMaskedAttachment}
        onRemoveAttachment={onRemoveAttachment}
        onReplaceMaskedAttachment={onReplaceMaskedAttachment}
        canAttachAll={allowAll}
        canAttachImage={allowImage}
        onDropHandled={onDropHandled}
        defaultProjectId={projectId}
        tabId={tabId}
        dictationLanguage={dictationLanguage}
        dictationSoundEnabled={dictationSoundEnabled}
        onDictationListeningChange={(isListening) => {
          if (!tabId) return;
          setTabDictationStatus(tabId, isListening);
        }}
        header={
          showImageOutputOptions || isCodexProvider ? (
            <div className="flex flex-col gap-2">
              {showImageOutputOptions ? (
                <ChatImageOutputOption
                  model={selectedModel}
                  variant="inline"
                  hideAspectRatio={hasMaskedAttachment}
                />
              ) : null}
              {isCodexProvider ? <CodexOption variant="inline" /> : null}
            </div>
          ) : null
        }
      />
    </>
  );
}
