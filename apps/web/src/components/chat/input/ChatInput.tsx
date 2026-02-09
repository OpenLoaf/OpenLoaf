"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import { Button } from "@tenas-ai/ui/button";
import {
  ChevronUp,
  X,
  Mic,
  AtSign,
} from "lucide-react";
import { useChatActions, useChatOptions, useChatSession, useChatState } from "../context";
import { cn } from "@/lib/utils";
import SelectMode from "./SelectMode";
import type {
  ChatAttachment,
  ChatAttachmentInput,
  MaskedAttachmentInput,
} from "./chat-attachments";
import {
  ChatImageAttachments,
  type ChatImageAttachmentsHandle,
} from "./ChatImageAttachments";
import {
  FILE_DRAG_REF_MIME,
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_URI_MIME,
  FILE_DRAG_MASK_URI_MIME,
} from "@tenas-ai/ui/tenas/drag-drop-types";
import { readImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import { buildMaskedPreviewUrl, resolveMaskFileName } from "@/lib/image/mask";
import {
  clearProjectFileDragSession,
  matchProjectFileDragSession,
} from "@/lib/project-file-drag-session";
import type { Value } from "platejs";
import { setValue } from "platejs";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import { ClipboardKit } from "@/components/editor/plugins/clipboard-kit";
import { ParagraphPlugin, Plate, usePlateEditor } from "platejs/react";
import { Editor as SlateEditor, Text, type BaseEditor } from "slate";
import type { RenderLeafProps } from "platejs";
import { Editor, EditorContainer } from "@tenas-ai/ui/editor";
import { ParagraphElement } from "@tenas-ai/ui/paragraph-node";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import {
  appendChatInputText,
  buildMentionNode,
  buildSkillCommandText,
  getPlainTextValue,
  parseChatValue,
  normalizeFileMentionSpacing,
  serializeChatValue,
} from "./chat-input-utils";
import {
  buildUriFromRoot,
  formatScopedProjectPath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { trpc } from "@/utils/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/hooks/use-projects";
import { useTabs } from "@/hooks/use-tabs";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { handleChatMentionPointerDown, resolveProjectRootUri } from "@/lib/chat/mention-pointer";
import { toast } from "sonner";
import ChatImageOutputOption, { type ChatImageOutputTarget } from "./ChatImageOutputOption";
import CodexOption from "./CodexOption";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import ChatCommandMenu, { type ChatCommandMenuHandle } from "./ChatCommandMenu";
import { useChatMessageComposer } from "../hooks/use-chat-message-composer";

interface ChatInputProps {
  className?: string;
  attachments?: ChatAttachment[];
  onAddAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onClearAttachments?: () => void;
  onReplaceMaskedAttachment?: (attachmentId: string, input: MaskedAttachmentInput) => void;
  canAttachAll?: boolean;
  canAttachImage?: boolean;
  model?: ChatImageOutputTarget | null;
  isAutoModel?: boolean;
  canImageGeneration?: boolean;
  canImageEdit?: boolean;
  isCodexProvider?: boolean;
  onDropHandled?: () => void;
}

const MAX_CHARS = 20000;
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
  /** Workspace id for mention file resolution. */
  workspaceId?: string;
  /** Active chat tab id for mention inserts. */
  tabId?: string;
  /** Whether to show slash command menu. */
  commandMenuEnabled?: boolean;
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
  workspaceId,
  tabId,
  commandMenuEnabled = false,
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
  /** Slash command menu handle. */
  const commandMenuRef = useRef<ChatCommandMenuHandle | null>(null);
  const { data: projects = [] } = useProjects();
  const queryClient = useQueryClient();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
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
    if (commandMenuRef.current?.handleKeyDown(e)) {
      return;
    }

    if (onSubmit && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const [isFocused, setIsFocused] = useState(false);
  /** Focus tracking container ref. */
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  /** Keep focus state while any element inside the input container is focused. */
  const handleContainerFocus = useCallback(() => {
    // 中文注释：输入区域内任意元素获得焦点时，保持面板处于聚焦状态。
    setIsFocused(true);
  }, [setIsFocused]);
  /** Clear focus state only when focus leaves the input container. */
  const handleContainerBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && inputContainerRef.current?.contains(nextTarget)) {
        // 中文注释：焦点仍在输入区域内，不应关闭面板。
        return;
      }
      setIsFocused(false);
    },
    [setIsFocused]
  );
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
        workspaceId,
        projectId: defaultProjectId,
        projects,
        pushStackItem,
      });
    },
    [activeTabId, defaultProjectId, projects, pushStackItem, workspaceId]
  );

  /** Focus the editor without throwing when DOM is unavailable. */
  const focusEditorSafely = useCallback(() => {
    try {
      if (!editor.selection) {
        // 中文注释：没有选区时补到末尾，确保显示输入光标。
        const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
        editor.tf.select(endPoint);
      }
      editor.tf.focus();
    } catch (error) {
      console.warn("[ChatInput] focus failed", error);
    }
  }, [editor]);

  /** Focus the editor and move caret to end. */
  const focusEditorAtEndSafely = useCallback(() => {
    try {
      const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
      editor.tf.select(endPoint);
      editor.tf.focus();
    } catch (error) {
      console.warn("[ChatInput] focus end failed", error);
    }
  }, [editor]);

  useEffect(() => {
    /** Handle external focus requests for the chat input. */
    const handleFocusRequest = () => {
      // 逻辑：通过 editor API 聚焦，确保 Slate 选区与输入状态同步。
      focusEditorSafely();
    };
    window.addEventListener("tenas:chat-focus-input", handleFocusRequest);
    return () => {
      window.removeEventListener("tenas:chat-focus-input", handleFocusRequest);
    };
  }, [focusEditorSafely]);

  useEffect(() => {
    /** Handle external focus requests that require caret at end. */
    const handleFocusToEnd = () => {
      // 中文注释：强制光标移动到输入末尾。
      focusEditorAtEndSafely();
    };
    window.addEventListener("tenas:chat-focus-input-end", handleFocusToEnd);
    return () => {
      window.removeEventListener("tenas:chat-focus-input-end", handleFocusToEnd);
    };
  }, [focusEditorAtEndSafely]);

  /** Normalize a file reference string to a scoped path. */
  const normalizeFileRef = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
    const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
    const baseValue = match?.[1] ?? normalized;
    const parsed = parseScopedProjectPath(baseValue);
    if (!parsed) return "";
    const scoped = formatScopedProjectPath({
      projectId: parsed.projectId,
      currentProjectId: defaultProjectId,
      relativePath: parsed.relativePath,
    });
    if (!scoped) return "";
    if (match?.[2] && match?.[3]) {
      return `${scoped}:${match[2]}-${match[3]}`;
    }
    return scoped;
  }, [defaultProjectId]);

  /** Insert a file reference as a mention node. */
  const insertFileMention = useCallback((fileRef: string, options?: { skipFocus?: boolean }) => {
    // 逻辑：将文件引用插入为 mention，并补一个空格。
    const normalizedRef = normalizeFileRef(fileRef);
    if (!normalizedRef) return;
    if (!editor.selection) {
      const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
      editor.tf.select(endPoint);
    }
    if (!options?.skipFocus) {
      focusEditorSafely();
    }
    editor.tf.insertNodes(buildMentionNode(normalizedRef));
    editor.tf.insertText(" ");
  }, [editor, focusEditorSafely, normalizeFileRef]);

  /** Check whether a value is a relative path. */
  const isRelativePath = (value: string) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

  /** Insert file references using the same logic as drag-and-drop. */
  const handleProjectFileRefsInsert = useCallback(
    async (fileRefs: string[]) => {
      if (!canAttachAll && !canAttachImage) return;
      if (!workspaceId) return;
      const normalizedRefs = Array.from(
        new Set(
          fileRefs
            .map((value) => normalizeFileRef(value))
            .filter(Boolean)
        )
      );
      for (const fileRef of normalizedRefs) {
        const match = fileRef.match(/^(.*?)(?::(\d+)-(\d+))?$/);
        const baseValue = match?.[1] ?? fileRef;
        const parsed = parseScopedProjectPath(baseValue);
        const projectId = parsed?.projectId ?? defaultProjectId ?? "";
        const relativePath = parsed?.relativePath ?? "";
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
            trpc.fs.readBinary.queryOptions({
              workspaceId,
              projectId,
              uri,
            })
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
      defaultProjectId,
      insertFileMention,
      onAddAttachments,
      queryClient,
      normalizeFileRef,
      resolveRootUri,
      trpc.fs.readBinary,
      workspaceId,
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
      const value = detail?.value ?? "";
      const normalizedRef = normalizeFileRef(value);
      if (!normalizedRef) return;
      insertFileMention(normalizedRef, { skipFocus: detail?.keepSelection });
    };
    window.addEventListener("tenas:chat-insert-mention", handleInsertMention);
    return () => {
      window.removeEventListener("tenas:chat-insert-mention", handleInsertMention);
    };
  }, [activeTabId, insertFileMention, normalizeFileRef, tabId]);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    console.debug("[ChatInput] drop payload", formatDragData(event.dataTransfer));
    const session = matchProjectFileDragSession(event.dataTransfer);
    if (
      session &&
      session.projectId === defaultProjectId &&
      session.fileRefs.length > 0
    ) {
      // 中文注释：拖拽来自项目文件系统时优先插入文件引用。
      await handleProjectFileRefsInsert(session.fileRefs);
      clearProjectFileDragSession("chat-drop");
      return;
    }
    const imagePayload = readImageDragPayload(event.dataTransfer);
    if (imagePayload) {
      if (!canAttachImage && !canAttachAll) return;
      const payloadFileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
      const isPayloadImage = Boolean(imagePayload.maskUri) || isImageFileName(payloadFileName);
      if (!isPayloadImage && canAttachAll) {
        const fileRef =
          normalizeFileRef(event.dataTransfer.getData(FILE_DRAG_REF_MIME)) ||
          (isRelativePath(imagePayload.baseUri) ? imagePayload.baseUri : "");
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
          const baseBlob = await fetchBlobFromUri(imagePayload.baseUri, {
            projectId: defaultProjectId,
          });
          const maskBlob = await fetchBlobFromUri(imagePayload.maskUri, {
            projectId: defaultProjectId,
          });
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
        const blob = await fetchBlobFromUri(imagePayload.baseUri, {
          projectId: defaultProjectId,
        });
        const isImageByType = blob.type.startsWith("image/");
        if (!isImageByName && !isImageByType) return;
        const file = new File([blob], fileName, {
          type: blob.type || "application/octet-stream",
        });
        const sourceUrl = isRelativePath(imagePayload.baseUri)
          ? imagePayload.baseUri
          : undefined;
        // 中文注释：应用内拖拽优先使用相对路径上传。
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
    const fileRef = normalizeFileRef(event.dataTransfer.getData(FILE_DRAG_REF_MIME));
    if (!fileRef) return;
    await handleProjectFileRefsInsert([fileRef]);
  }, [
    canAttachAll,
    canAttachImage,
    defaultProjectId,
    handleProjectFileRefsInsert,
    isRelativePath,
    onAddAttachments,
    onAddMaskedAttachment,
    normalizeFileRef,
  ]);


  if (!editor) {
    return null;
  }

  return (
    <div
      ref={inputContainerRef}
      className={cn(
        "relative shrink-0 rounded-xl bg-background transition-all duration-200 flex flex-col",
        variant === "default" ? "mt-4 max-h-[30%]" : "max-h-none",
        "tenas-thinking-border",
        isFocused && "tenas-thinking-border-focus",
        isOverLimit && "tenas-thinking-border-danger",
        // SSE 请求进行中（含非流式）或语音输入中：给输入框加边框流动动画。
        (isStreaming || isListening) &&
          !isOverLimit &&
          "tenas-thinking-border-on",
        className
      )}
      onFocusCapture={handleContainerFocus}
      onBlurCapture={handleContainerBlur}
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
    const fileRef = normalizeFileRef(event.dataTransfer.getData(FILE_DRAG_REF_MIME));
    const imagePayload = readImageDragPayload(event.dataTransfer);
    const hasFiles = event.dataTransfer.files?.length > 0;
    if (!fileRef && !imagePayload && !hasFiles) return;
        event.preventDefault();
        event.stopPropagation();
        onDropHandled?.();
        void handleDrop(event);
      }}
    >
      {commandMenuEnabled ? (
        <ChatCommandMenu
          ref={commandMenuRef}
          value={value}
          onChange={onChange}
          onRequestFocus={focusEditorSafely}
          isFocused={isFocused}
          projectId={defaultProjectId}
        />
      ) : null}
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
          projectId={defaultProjectId}
        />

        <div
          className={cn(
            "px-2 pt-1 pb-2 flex-1 min-h-0 transition-[padding] duration-500 ease-out",
            compact && "pb-3",
            attachments && attachments.length > 0 && "pt-2"
          )}
        >
          <div className="w-full h-full min-h-0 overflow-auto show-scrollbar">
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
                  data-tenas-chat-input="true"
                />
              </EditorContainer>
            </Plate>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-2 gap-y-2 px-1.5 pb-1.5 shrink-0 min-w-0">
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
            </div>
          ) : (
            <div />
          )}

          {!compact ? (
            <div className="min-w-0 flex-1 flex items-center justify-end overflow-hidden">
              <SelectMode className="w-full max-w-full justify-end" />
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}

          <div className="flex shrink-0 items-center gap-1.5">
            {isOverLimit && (
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors mr-1",
                  "text-destructive"
                )}
              >
                {plainTextValue.length} / {MAX_CHARS}
              </span>
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
  model,
  isAutoModel,
  canImageGeneration,
  canImageEdit,
  isCodexProvider,
  onDropHandled,
}: ChatInputProps) {
  const { sendMessage, stopGenerating, clearError } = useChatActions();
  const { status, isHistoryLoading } = useChatState();
  const { input, setInput, imageOptions, codexOptions, addMaskedAttachment } = useChatOptions();
  const { projectId, workspaceId, tabId } = useChatSession();
  const activeTabId = useTabs((state) => state.activeTabId);
  const { basic } = useBasicConfig();
  const setTabDictationStatus = useChatRuntime((s) => s.setTabDictationStatus);
  const dictationLanguage = basic.modelResponseLanguage;
  const dictationSoundEnabled = basic.appNotificationSoundEnabled;
  useEffect(() => {
    return () => {
      if (!tabId) return;
      setTabDictationStatus(tabId, false);
    };
  }, [setTabDictationStatus, tabId]);

  /** Handle skill insert events. */
  useEffect(() => {
    const handleInsertSkill = (event: Event) => {
      // 中文注释：仅活跃标签页响应插入事件，避免隐藏面板写入输入内容。
      if (tabId) {
        if (!activeTabId || activeTabId !== tabId) return;
      }
      const detail = (event as CustomEvent<{ skillName?: string }>).detail;
      const skillName = detail?.skillName?.trim() ?? "";
      if (!skillName) return;
      const nextToken = buildSkillCommandText(skillName);
      if (!nextToken) return;
      setInput((prev) => appendChatInputText(prev, nextToken));
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("tenas:chat-focus-input-end"));
      });
    };
    window.addEventListener("tenas:chat-insert-skill", handleInsertSkill);
    return () => {
      window.removeEventListener("tenas:chat-insert-skill", handleInsertSkill);
    };
  }, [activeTabId, setInput, tabId]);
  const resolvedIsAutoModel = Boolean(isAutoModel);
  const resolvedCanImageGeneration = Boolean(canImageGeneration);
  const resolvedCanImageEdit = Boolean(canImageEdit);
  const resolvedIsCodexProvider = Boolean(isCodexProvider);
  // 模型声明图片生成时显示图片输出选项。
  const showImageOutputOptions = resolvedCanImageGeneration;
  const allowAll = Boolean(canAttachAll);
  const allowImage = typeof canAttachImage === "boolean" ? canAttachImage : allowAll;
  const handleAddAttachments = allowImage ? onAddAttachments : undefined;
  const composeMessage = useChatMessageComposer({
    canImageGeneration: resolvedCanImageGeneration,
    isCodexProvider: resolvedIsCodexProvider,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "submitted" || status === "streaming";
  const hasPendingAttachments = (attachments ?? []).some(
    (item) => item.status === "loading" || item.mask?.status === "loading"
  );
  // 有图片编辑时隐藏比例选项。
  const hasMaskedAttachment = (attachments ?? []).some((item) => item.mask);

  /** Handle input submit triggered by UI actions. */
  const handleSubmit = async (value: string) => {
    const canSubmit = status === "ready" || status === "error";
    if (!canSubmit) return;
    // 切换 session 的历史加载期间禁止发送，避免 parentMessageId 与当前会话链不一致
    if (isHistoryLoading) return;
    // 中文注释：发送前规范化文件引用的空格，避免路径与后续文本粘连。
    const textValue = normalizeFileMentionSpacing(value).trim();
    if (hasPendingAttachments) return;
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
    if (!resolvedIsAutoModel && hasMaskedAttachment && !resolvedCanImageEdit) {
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
    const { parts, metadata } = composeMessage({
      textValue,
      imageParts,
      imageOptions,
      codexOptions,
    });
    // 关键：必须走 UIMessage.parts 形式，才能携带 parentMessageId 等扩展字段
    sendMessage({ parts, ...(metadata ? { metadata } : {}) } as any);
    setInput("");
    onClearAttachments?.();
  };

  useEffect(() => {
    /** Handle AI request forwarded from Search dialog. */
    const handleSearchAiRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const nextValue = detail?.text?.trim();
      if (!nextValue) return;
      // 逻辑：复用统一的发送逻辑，保证校验一致。
      void handleSubmit(nextValue);
    };
    window.addEventListener("tenas:chat-send-message", handleSearchAiRequest);
    return () => {
      window.removeEventListener("tenas:chat-send-message", handleSearchAiRequest);
    };
  }, [handleSubmit]);

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
        commandMenuEnabled
        defaultProjectId={projectId}
        workspaceId={workspaceId}
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
                  model={model ?? null}
                  variant="inline"
                  hideAspectRatio={hasMaskedAttachment}
                />
              ) : null}
              {resolvedIsCodexProvider ? <CodexOption variant="inline" /> : null}
            </div>
          ) : null
        }
      />
    </>
  );
}
