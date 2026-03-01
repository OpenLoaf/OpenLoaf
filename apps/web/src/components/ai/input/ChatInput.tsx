/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import {
  Cloud,
  Mic,
  Paperclip,
  Sparkles,
  Settings2,
} from "lucide-react";
import { useChatActions, useChatOptions, useChatSession, useChatState } from "../context";
import { cn } from "@/lib/utils";
import SelectMode from "./SelectMode";
import { useHasPreferredReasoningModel } from "./model-preferences/useHasPreferredReasoningModel";
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
} from "@/components/ai-elements/drag-drop";
import { readImageDragPayload } from "@/lib/image/drag";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import { buildMaskedPreviewUrl, resolveMaskFileName } from "@/lib/image/mask";
import {
  clearProjectFileDragSession,
  matchProjectFileDragSession,
} from "@/lib/project-file-drag-session";
import ProjectFileSystemTransferDialog from "@/components/project/filesystem/components/ProjectFileSystemTransferDialog";
import {
  appendChatInputText,
  buildSkillCommandText,
  getFileLabel,
  normalizeFileMentionSpacing,
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
import { useSettingsValues } from "@/hooks/use-settings";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { resolveProjectRootUri } from "@/lib/chat/mention-pointer";
import { toast } from "sonner";
import ChatImageOutputOption, { type ChatImageOutputTarget } from "./ChatImageOutputOption";
import CodexOption from "./CodexOption";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import ChatCommandMenu, { type ChatCommandMenuHandle } from "./ChatCommandMenu";
import { useChatMessageComposer } from "../hooks/use-chat-message-composer";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import ApprovalModeSelector, { type ApprovalMode } from "./ApprovalModeSelector";
import ChatModeSelector, { type ChatMode } from "./ChatModeSelector";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";

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
const ONLINE_SEARCH_GLOBAL_STORAGE_KEY = "openloaf:chat-online-search:global-enabled";
const CHAT_MODE_STORAGE_KEY = "openloaf:chat-mode";
const FILE_TOKEN_TEXT_REGEX = /@\[([^\]]+)\]/g;


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

/** Convert serialized chat text into a plain-text string for character counting. */
function getPlainTextFromInput(value: string): string {
  if (!value) return "";
  return value.replace(FILE_TOKEN_TEXT_REGEX, (_token, pathToken: string) =>
    getFileLabel(pathToken),
  );
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
  /** Whether input should be blocked and replaced by action buttons. */
  blocked?: boolean;
  /** Blocked reason hint for overlay wording. */
  blockedReason?: 'cloud-login' | 'local-empty' | 'unconfigured';
  /** Open SaaS login dialog when input is blocked. */
  onRequestLogin?: () => void;
  /** Open local model configuration when input is blocked. */
  onRequestLocalConfig?: () => void;
  /** Switch to local model source when input is blocked in cloud mode. */
  onRequestSwitchLocal?: () => void;
  /** Switch to cloud model source when input is blocked in local mode. */
  onRequestSwitchCloud?: () => void;
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
  /** Current approval mode. */
  approvalMode?: ApprovalMode;
  /** Approval mode change callback. */
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  /** Current chat mode (agent or direct CLI). */
  chatMode?: ChatMode;
  /** Chat mode change callback. */
  onChatModeChange?: (mode: ChatMode) => void;
  /** Whether CLI tools are installed (controls visibility of mode selector). */
  hasCliTools?: boolean;
}

export function ChatInputBox({
  value,
  onChange,
  className,
  placeholder = "提问、搜索或创作任何内容…",
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
  blocked = false,
  blockedReason,
  onRequestLogin,
  onRequestLocalConfig,
  onRequestSwitchLocal,
  onRequestSwitchCloud,
  onDropHandled,
  defaultProjectId,
  workspaceId,
  tabId,
  commandMenuEnabled = false,
  dictationLanguage,
  dictationSoundEnabled,
  onDictationListeningChange,
  approvalMode = "manual",
  onApprovalModeChange,
  chatMode = "agent",
  onChatModeChange,
  hasCliTools = false,
}: ChatInputBoxProps) {
  const isBlocked = Boolean(blocked);
  const plainTextValue = useMemo(() => getPlainTextFromInput(value), [value]);
  const isOverLimit = plainTextValue.length > MAX_CHARS;
  const hasReadyAttachments = (attachments ?? []).some((item) => {
    if (item.status !== "ready" || !item.remoteUrl) return false;
    if (!item.mask) return true;
    return item.mask.status === "ready" && Boolean(item.mask.remoteUrl);
  });
  const imageAttachmentsRef = useRef<ChatImageAttachmentsHandle | null>(null);
  const valueRef = useRef(value);
  /** Whether the file picker dialog is open. */
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  /** Slash command menu handle. */
  const commandMenuRef = useRef<ChatCommandMenuHandle | null>(null);
  /** Focus tracking container ref. */
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  const { data: projects = [] } = useProjects();
  const queryClient = useQueryClient();
  const activeTabId = useTabs((s) => s.activeTabId);
  const [isFocused, setIsFocused] = useState(false);
  const { isListening, isSupported: isDictationSupported, toggle: toggleDictation } =
    useSpeechDictation({
      language: dictationLanguage,
      enableStartTone: dictationSoundEnabled,
      onError: (message) => toast.error(message),
      onResultText: ({ text, isFinal }) => {
        if (!isFinal) return;
        const trimmed = text.trim();
        if (!trimmed) return;
        insertTextAtSelection(trimmed, {
          ensureLeadingSpace: true,
          ensureTrailingSpace: true,
        });
      },
    });
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onDictationListeningChange?.(isListening);
  }, [isListening, onDictationListeningChange]);

  const handleSubmit = () => {
    if (!onSubmit) return;
    if (submitDisabled) return;
    if (isOverLimit) return;
    if (!plainTextValue.trim() && !hasReadyAttachments) return;
    onSubmit(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isBlocked) {
      e.preventDefault();
      return;
    }
    // 检查是否正在使用输入法进行输入，如果是则不发送消息
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (commandMenuRef.current?.handleKeyDown(e)) {
      return;
    }

    if (onSubmit && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApprovalModeChange = useCallback(
    (mode: ApprovalMode) => {
      onApprovalModeChange?.(mode);
    },
    [onApprovalModeChange]
  );
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
  const canSubmit = Boolean(onSubmit) && !submitDisabled && !isOverLimit && !isBlocked;
  // 流式生成时按钮变为“停止”，不应被 submitDisabled 禁用
  const isSendDisabled = isLoading
    ? false
    : submitDisabled ||
      isOverLimit ||
      isBlocked ||
      (!plainTextValue.trim() && !hasReadyAttachments);

  const resolvedPlaceholder = chatMode === "cli" ? "直接与 CLI 对话..." : placeholder;

  // Responsive: collapse ChatModeSelector labels when footer is narrow
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const [toolbarCompact, setToolbarCompact] = useState(false);
  useEffect(() => {
    if (!footerEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setToolbarCompact(entry.contentRect.width < 400);
      }
    });
    ro.observe(footerEl);
    return () => ro.disconnect();
  }, [footerEl]);

  /** Resolve textarea element in current chat input container. */
  const getInputElement = useCallback(() => {
    return inputContainerRef.current?.querySelector<HTMLTextAreaElement>(
      "textarea[data-openloaf-chat-input='true']",
    ) ?? null;
  }, []);

  /** Focus textarea safely and optionally move caret to the end. */
  const focusInputSafely = useCallback(
    (position: "keep" | "end" = "keep") => {
      const input = getInputElement();
      if (!input) return;
      input.focus();
      if (position === "end") {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    },
    [getInputElement],
  );

  /** Insert text into textarea selection and keep caret in sync. */
  const insertTextAtSelection = useCallback(
    (
      rawText: string,
      options?: {
        skipFocus?: boolean;
        ensureLeadingSpace?: boolean;
        ensureTrailingSpace?: boolean;
      },
    ) => {
      const input = getInputElement();
      const currentValue = input?.value ?? valueRef.current;
      const start = input?.selectionStart ?? currentValue.length;
      const end = input?.selectionEnd ?? start;
      const prevChar = start > 0 ? currentValue[start - 1] : "";
      const nextChar = end < currentValue.length ? currentValue[end] : "";
      const leading =
        options?.ensureLeadingSpace && prevChar && !/\s/u.test(prevChar) ? " " : "";
      const trailing =
        options?.ensureTrailingSpace && (!nextChar || !/\s/u.test(nextChar)) ? " " : "";
      const inserted = `${leading}${rawText}${trailing}`;
      const nextValue = `${currentValue.slice(0, start)}${inserted}${currentValue.slice(end)}`;
      valueRef.current = nextValue;
      onChange(nextValue);

      requestAnimationFrame(() => {
        const nextInput = getInputElement();
        if (!nextInput) return;
        if (!options?.skipFocus) {
          nextInput.focus();
        }
        const caret = start + inserted.length;
        nextInput.setSelectionRange(caret, caret);
      });
    },
    [getInputElement, onChange],
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

  useEffect(() => {
    /** Handle external focus requests for the chat input. */
    const handleFocusRequest = () => {
      focusInputSafely("keep");
    };
    window.addEventListener("openloaf:chat-focus-input", handleFocusRequest);
    return () => {
      window.removeEventListener("openloaf:chat-focus-input", handleFocusRequest);
    };
  }, [focusInputSafely]);

  useEffect(() => {
    /** Handle external focus requests that require caret at end. */
    const handleFocusToEnd = () => {
      focusInputSafely("end");
    };
    window.addEventListener("openloaf:chat-focus-input-end", handleFocusToEnd);
    return () => {
      window.removeEventListener("openloaf:chat-focus-input-end", handleFocusToEnd);
    };
  }, [focusInputSafely]);

  /** Normalize a file reference string to a scoped path. */
  const normalizeFileRef = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    let normalized: string;
    if (trimmed.startsWith("@[") && trimmed.endsWith("]")) {
      normalized = trimmed.slice(2, -1);
    } else if (trimmed.startsWith("@")) {
      normalized = trimmed.slice(1);
    } else {
      normalized = trimmed;
    }
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

  /** Insert a file reference token and keep cursor behaviour stable. */
  const insertFileMention = useCallback(
    (fileRef: string, options?: { skipFocus?: boolean }) => {
      const normalizedRef = normalizeFileRef(fileRef);
      if (!normalizedRef) return;
      insertTextAtSelection(`@[${normalizedRef}]`, {
        skipFocus: options?.skipFocus,
        ensureLeadingSpace: true,
        ensureTrailingSpace: true,
      });
    },
    [insertTextAtSelection, normalizeFileRef],
  );

  /** Check whether a value is a relative path. */
  const isRelativePath = (value: string) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

  /** Insert file references using the same logic as drag-and-drop. */
  const handleProjectFileRefsInsert = useCallback(
    async (fileRefs: string[]) => {
      if (!canAttachAll && !canAttachImage) return;
      if (!workspaceId) return;
      const mentionRefs: string[] = [];
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
            mentionRefs.push(fileRef);
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
      if (mentionRefs.length > 0) {
        const mentionText = mentionRefs.map((item) => `@[${item}]`).join(" ");
        insertTextAtSelection(mentionText, {
          ensureLeadingSpace: true,
          ensureTrailingSpace: true,
        });
      }
    },
    [
      canAttachAll,
      canAttachImage,
      defaultProjectId,
      insertTextAtSelection,
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
      // 中文注释：仅活跃标签页响应插入事件，避免隐藏面板误写输入内容。
      if (tabId) {
        if (!activeTabId || activeTabId !== tabId) return;
      }
      const detail = (event as CustomEvent<{ value?: string; keepSelection?: boolean }>).detail;
      const value = detail?.value ?? "";
      const normalizedRef = normalizeFileRef(value);
      if (!normalizedRef) return;
      insertFileMention(normalizedRef, { skipFocus: detail?.keepSelection });
    };
    window.addEventListener("openloaf:chat-insert-mention", handleInsertMention);
    return () => {
      window.removeEventListener("openloaf:chat-insert-mention", handleInsertMention);
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

  return (
    <div
      ref={inputContainerRef}
      className={cn(
        "relative shrink-0 rounded-xl bg-background transition-all duration-200 flex flex-col overflow-hidden",
        variant === "default" ? "mt-4 max-h-[30%]" : "max-h-none",
        "openloaf-thinking-border",
        isFocused && "openloaf-thinking-border-focus",
        isOverLimit && "openloaf-thinking-border-danger",
        // SSE 请求进行中（含非流式）或语音输入中：给输入框加边框流动动画。
        (isStreaming || isListening) &&
          !isOverLimit &&
          "openloaf-thinking-border-on",
        className
      )}
      onFocusCapture={handleContainerFocus}
      onBlurCapture={handleContainerBlur}
      onDragOver={(event) => {
        if (isBlocked) return;
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
        if (isBlocked) return;
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
      {commandMenuEnabled && !isBlocked ? (
        <ChatCommandMenu
          ref={commandMenuRef}
          value={value}
          onChange={onChange}
          onRequestFocus={() => focusInputSafely("keep")}
          isFocused={isFocused}
          projectId={defaultProjectId}
        />
      ) : null}
      {header && !isBlocked ? (
        <div className="rounded-t-xl border-b border-border bg-muted/30">
          {header}
        </div>
      ) : null}
      {isBlocked ? (
        /* 未登录或未配置 AI 服务商时，替换输入框为引导内容 */
        <div className="flex flex-col items-center justify-center gap-2.5 px-5 py-4">
          <img
            src="/logo_nobody.png"
            alt="OpenLoaf"
            className="size-12 object-contain"
          />
          <div className="text-center">
            <p className="text-[13px] font-medium text-[#202124] dark:text-slate-50">
              {blockedReason === 'cloud-login'
                ? '登录后使用云端模型'
                : blockedReason === 'local-empty'
                  ? '本地模型未配置'
                  : '开始智能对话'}
            </p>
            <p className="mt-0.5 text-[11px] text-[#5f6368] dark:text-slate-400">
              {blockedReason === 'cloud-login'
                ? '当前选择的是云端模型，登录后即可使用'
                : blockedReason === 'local-empty'
                  ? onRequestSwitchCloud
                    ? '切换到云端模型，或配置本地 AI 服务商'
                    : '登录云端或配置本地 AI 服务商'
                  : '登录云端或配置本地 AI 服务商'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {blockedReason === 'local-empty' && onRequestSwitchCloud ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e8f0fe] px-4 text-[12px] font-medium text-[#1a73e8] transition-colors duration-150 hover:bg-[#d2e3fc] disabled:opacity-50 dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70"
                onClick={onRequestSwitchCloud}
              >
                <Cloud className="size-3.5" />
                使用云端模型
              </button>
            ) : (
              <button
                type="button"
                className="h-8 rounded-full bg-[#e8f0fe] px-4 text-[12px] font-medium text-[#1a73e8] transition-colors duration-150 hover:bg-[#d2e3fc] disabled:opacity-50 dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70"
                onClick={onRequestLogin}
                disabled={!onRequestLogin}
              >
                登录 OpenLoaf 云端
              </button>
            )}
            {blockedReason === 'cloud-login' && onRequestSwitchLocal ? (
              <button
                type="button"
                className="h-8 rounded-full bg-[#f1f3f4] px-4 text-[12px] font-medium text-[#3c4043] transition-colors duration-150 hover:bg-[#e3e8ef] dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-300 dark:hover:bg-[hsl(var(--muted)/0.50)]"
                onClick={onRequestSwitchLocal}
              >
                切换到本地模型
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f1f3f4] px-4 text-[12px] font-medium text-[#3c4043] transition-colors duration-150 hover:bg-[#e3e8ef] disabled:opacity-50 dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-300 dark:hover:bg-[hsl(var(--muted)/0.50)]"
                onClick={onRequestLocalConfig}
                disabled={!onRequestLocalConfig}
              >
                <Settings2 className="size-3.5" />
                自定义AI服务商
              </button>
            )}
          </div>
        </div>
      ) : (
        <PromptInput
          onSubmit={() => {
            handleSubmit();
          }}
          className="flex flex-col"
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
              "flex-1 min-h-0",
              attachments && attachments.length > 0 && "pt-1"
            )}
          >
            <div className="w-full h-full min-h-0 overflow-auto show-scrollbar">
              <PromptInputTextarea
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                className={cn(
                  "text-[13px] leading-5 px-3 py-2.5",
                  isOverLimit && "text-destructive",
                )}
                placeholder={resolvedPlaceholder}
                onKeyDown={handleKeyDown}
                data-openloaf-chat-input="true"
              />
            </div>
          </div>

          <TooltipProvider delayDuration={300}>
          <PromptInputFooter ref={setFooterEl} className="items-end gap-2 px-1.5 shrink-0 min-w-0">
            <PromptInputTools className="min-w-0 flex-1 gap-1.5 overflow-hidden">
              {!compact ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PromptInputButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      onClick={() => setFilePickerOpen(true)}
                      disabled={!canAttachAll && !canAttachImage}
                      aria-label="添加附件"
                    >
                      <Paperclip className="w-4 h-4" />
                    </PromptInputButton>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    添加附件
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {!compact ? (
                <ApprovalModeSelector value={approvalMode} onChange={handleApprovalModeChange} />
              ) : null}
            </PromptInputTools>

            <PromptInputTools className="shrink-0 gap-2">
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

              {!compact && hasCliTools ? (
                <ChatModeSelector
                  value={chatMode}
                  onChange={(mode) => onChatModeChange?.(mode)}
                  compact={toolbarCompact}
                  className="shrink-0 mr-0.5"
                />
              ) : null}

              {!compact ? <SelectMode triggerVariant="icon" className="shrink-0" chatMode={chatMode} /> : null}

              {actionVariant === "text" && onCancel && (
                <PromptInputButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs shadow-none"
                  onClick={onCancel}
                >
                  {cancelLabel}
                </PromptInputButton>
              )}

              {!compact && isDictationSupported && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PromptInputButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        "rounded-full w-8 h-8 shrink-0 transition-colors",
                        isListening
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      aria-pressed={isListening}
                      onClick={() => void toggleDictation()}
                      aria-label="语音输入"
                    >
                      <Mic className={cn("w-4 h-4", isListening && "text-destructive")} />
                    </PromptInputButton>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {isListening ? "停止语音输入" : "语音输入"}
                  </TooltipContent>
                </Tooltip>
              )}

              {actionVariant === "text" ? (
                <PromptInputButton
                  type={canSubmit ? "submit" : "button"}
                  disabled={isSendDisabled}
                  size="sm"
                  className={cn(
                    "h-8 rounded-full px-3 text-xs shrink-0 disabled:opacity-100",
                    canSubmit
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "bg-muted text-foreground/60 cursor-not-allowed"
                  )}
                >
                  {submitLabel}
                </PromptInputButton>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PromptInputSubmit
                      status={isLoading ? "streaming" : undefined}
                      onStop={onStop}
                      disabled={isLoading ? !onStop : isSendDisabled}
                      size="icon-sm"
                      className={cn(
                        "h-[30px] w-[30px] rounded-full shrink-0 transition-colors duration-200",
                        isLoading
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/15"
                          : isOverLimit
                            ? "bg-blue-100 text-blue-300 cursor-not-allowed dark:bg-blue-950 dark:text-blue-800"
                            : canSubmit
                              ? "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
                              : "bg-blue-100 text-blue-400 dark:bg-blue-950 dark:text-blue-700"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {isLoading ? "停止生成" : "发送消息"}
                  </TooltipContent>
                </Tooltip>
              )}
            </PromptInputTools>
          </PromptInputFooter>
          </TooltipProvider>

          {isOverLimit && (
             <div className="px-4 pb-2 text-xs text-destructive font-medium animate-in fade-in slide-in-from-top-1">
               Content exceeds the {MAX_CHARS} character limit. Please shorten your message.
             </div>
          )}
        </PromptInput>
      )}
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
  const { sendMessage, stopGenerating, clearError, setPendingCloudMessage } = useChatActions();
  const { status, isHistoryLoading } = useChatState();
  const { input, setInput, imageOptions, codexOptions, addMaskedAttachment } = useChatOptions();
  const { projectId, workspaceId, tabId } = useChatSession();
  const hasReasoningModel = useHasPreferredReasoningModel(projectId);
  const activeTabId = useTabs((state) => state.activeTabId);
  const setTabChatParams = useTabs((state) => state.setTabChatParams);
  const tabOnlineSearchEnabled = useTabs((state) => {
    const targetTabId = tabId ?? state.activeTabId;
    if (!targetTabId) return undefined;
    const tab = state.tabs.find((item) => item.id === targetTabId);
    const value = (tab?.chatParams as Record<string, unknown> | undefined)
      ?.chatOnlineSearchEnabled;
    return typeof value === "boolean" ? value : undefined;
  });
  const { providerItems } = useSettingsValues();
  const { loggedIn: authLoggedIn } = useSaasAuth();
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const { basic, setBasic } = useBasicConfig();
  const setTabDictationStatus = useChatRuntime((s) => s.setTabDictationStatus);
  const dictationLanguage = basic.modelResponseLanguage;
  const dictationSoundEnabled = basic.appNotificationSoundEnabled;
  const onlineSearchMemoryScope: "tab" | "global" =
    basic.chatOnlineSearchMemoryScope === "global" ? "global" : "tab";
  /** Login dialog open state. */
  const [loginOpen, setLoginOpen] = useState(false);
  /** Approval mode selected from input toolbar. */
  const [approvalMode, setApprovalMode] =
    useState<ApprovalMode>(basic.autoApproveTools ? "auto" : "manual");
  /** Chat mode: agent (default) or direct CLI. */
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    if (typeof window === "undefined") return "agent";
    return (window.localStorage.getItem(CHAT_MODE_STORAGE_KEY) as ChatMode) || "agent";
  });
  const handleChatModeChange = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
    }
  }, []);
  /** Detect installed CLI tools to control mode selector visibility. */
  const installedCliProviderIds = useInstalledCliProviderIds();
  const hasCliTools = installedCliProviderIds.size > 0;
  /** Global online-search switch state. */
  const [globalOnlineSearchEnabled, setGlobalOnlineSearchEnabled] =
    useState(false);
  /** Keep last memory scope to detect scope switches. */
  const onlineSearchScopeRef = useRef<"tab" | "global">(onlineSearchMemoryScope);
  // 逻辑：聊天场景优先使用上下文 tabId，非聊天场景回退到当前激活 tab。
  const activeChatTabId = tabId ?? activeTabId;
  // 逻辑：检查用户是否配置了至少一个本地 provider（排除注册表默认 CLI 项）。
  const hasConfiguredProviders = useMemo(
    () => providerItems.some((item) => (item.category ?? "general") === "provider"),
    [providerItems],
  );
  // 逻辑：云端模式未登录 / 本地模式无 provider / 未登录且无本地配置时，禁用输入并显示引导。
  const needsCloudLogin = basic.chatSource === 'cloud' && !authLoggedIn;
  const needsLocalConfig = basic.chatSource === 'local' && !hasConfiguredProviders;
  const isUnconfigured = needsCloudLogin || needsLocalConfig || (!authLoggedIn && !hasConfiguredProviders);
  useEffect(() => {
    return () => {
      if (!tabId) return;
      setTabDictationStatus(tabId, false);
    };
  }, [setTabDictationStatus, tabId]);
  useEffect(() => {
    if (!authLoggedIn) return;
    if (!loginOpen) return;
    setLoginOpen(false);
  }, [authLoggedIn, loginOpen]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadGlobalValue = () => {
      const raw = window.localStorage.getItem(ONLINE_SEARCH_GLOBAL_STORAGE_KEY);
      setGlobalOnlineSearchEnabled(raw === "true");
    };
    loadGlobalValue();
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ONLINE_SEARCH_GLOBAL_STORAGE_KEY) return;
      loadGlobalValue();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const onlineSearchEnabled =
    onlineSearchMemoryScope === "global"
      ? globalOnlineSearchEnabled
      : tabOnlineSearchEnabled ?? false;

  useEffect(() => {
    // 中文注释：审批模式与基础设置保持同步。
    setApprovalMode(basic.autoApproveTools ? "auto" : "manual");
  }, [basic.autoApproveTools]);

  useEffect(() => {
    if (onlineSearchScopeRef.current === onlineSearchMemoryScope) return;
    if (onlineSearchMemoryScope === "global") {
      const nextValue =
        typeof tabOnlineSearchEnabled === "boolean"
          ? tabOnlineSearchEnabled
          : globalOnlineSearchEnabled;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          ONLINE_SEARCH_GLOBAL_STORAGE_KEY,
          nextValue ? "true" : "false"
        );
      }
      setGlobalOnlineSearchEnabled(nextValue);
    } else if (activeChatTabId) {
      setTabChatParams(activeChatTabId, {
        chatOnlineSearchEnabled: globalOnlineSearchEnabled,
      });
    }
    onlineSearchScopeRef.current = onlineSearchMemoryScope;
  }, [
    activeChatTabId,
    globalOnlineSearchEnabled,
    onlineSearchMemoryScope,
    setTabChatParams,
    tabOnlineSearchEnabled,
  ]);

  /** Persist online-search switch based on configured memory scope. */
  const handleOnlineSearchChange = useCallback(
    (enabled: boolean) => {
      if (onlineSearchMemoryScope === "global") {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            ONLINE_SEARCH_GLOBAL_STORAGE_KEY,
            enabled ? "true" : "false"
          );
        }
        setGlobalOnlineSearchEnabled(enabled);
        return;
      }
      if (!activeChatTabId) return;
      setTabChatParams(activeChatTabId, { chatOnlineSearchEnabled: enabled });
    },
    [activeChatTabId, onlineSearchMemoryScope, setTabChatParams]
  );
  const handleApprovalModeChange = useCallback(
    (mode: ApprovalMode) => {
      setApprovalMode(mode);
      void setBasic({ autoApproveTools: mode === "auto" });
    },
    [setBasic]
  );
  /** Open SaaS login dialog. */
  const handleOpenLogin = () => {
    setLoginOpen(true);
  };

  /** Open the provider management panel inside the current tab stack. */
  const handleOpenProviderSettings = () => {
    if (!activeChatTabId) return;
    // 直接打开模型管理面板，避免进入设置菜单列表。
    pushStackItem(
      activeChatTabId,
      {
        id: "provider-management",
        sourceKey: "provider-management",
        component: "provider-management",
        title: "管理模型",
      },
      100,
    );
  };

  /** Switch chat source to local models. */
  const handleSwitchToLocal = useCallback(() => {
    void setBasic({ chatSource: 'local' });
  }, [setBasic]);

  /** Switch chat source to cloud models. */
  const handleSwitchToCloud = useCallback(() => {
    void setBasic({ chatSource: 'cloud' });
  }, [setBasic]);

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
        window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input-end"));
      });
    };
    window.addEventListener("openloaf:chat-insert-skill", handleInsertSkill);
    return () => {
      window.removeEventListener("openloaf:chat-insert-skill", handleInsertSkill);
    };
  }, [activeTabId, setInput, tabId]);

  /** Handle prefill text events (e.g. from task board "让AI创建"). */
  useEffect(() => {
    const handlePrefill = (event: Event) => {
      if (tabId) {
        if (!activeTabId || activeTabId !== tabId) return;
      }
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const text = detail?.text ?? "";
      if (!text) return;
      setInput(text);
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input-end"));
      });
    };
    window.addEventListener("openloaf:chat-prefill-input", handlePrefill);
    return () => {
      window.removeEventListener("openloaf:chat-prefill-input", handlePrefill);
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
    // 未配置时：将消息暂存为 pendingCloudMessage，登录后自动发送
    if (isUnconfigured) {
      const textValue = normalizeFileMentionSpacing(value).trim()
      if (!textValue) return
      setPendingCloudMessage({
        parts: [{ type: 'text', text: textValue }],
        metadata: undefined,
        text: textValue,
      })
      setInput('')
      return
    }
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
      reasoningMode: hasReasoningModel ? (basic.chatThinkingMode === "deep" ? "deep" : "fast") : undefined,
      onlineSearchEnabled,
      autoApproveTools: approvalMode === "auto",
      directCli: chatMode === "cli",
    });
    // 逻辑：云端模型 + 未登录时，暂存消息而不发送到服务端
    const isCloudSource = basic.chatSource === 'cloud'
    if (isCloudSource && !authLoggedIn) {
      setPendingCloudMessage({ parts, metadata, text: textValue })
      setInput('')
      onClearAttachments?.()
      return
    }
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
    window.addEventListener("openloaf:chat-send-message", handleSearchAiRequest);
    return () => {
      window.removeEventListener("openloaf:chat-send-message", handleSearchAiRequest);
    };
  }, [handleSubmit]);

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <ChatInputBox
        value={input}
        onChange={setInput}
        className={className}
        variant="default"
        compact={false}
        isLoading={isLoading}
        isStreaming={isStreaming}
        blocked={isUnconfigured}
        blockedReason={needsCloudLogin ? 'cloud-login' : needsLocalConfig ? 'local-empty' : 'unconfigured'}
        onRequestLogin={handleOpenLogin}
        onRequestLocalConfig={handleOpenProviderSettings}
        onRequestSwitchLocal={hasConfiguredProviders ? handleSwitchToLocal : undefined}
        onRequestSwitchCloud={authLoggedIn ? handleSwitchToCloud : undefined}
        submitDisabled={
          isHistoryLoading ||
          isUnconfigured ||
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
        approvalMode={approvalMode}
        onApprovalModeChange={handleApprovalModeChange}
        chatMode={chatMode}
        onChatModeChange={handleChatModeChange}
        hasCliTools={hasCliTools}
        header={
          !isUnconfigured && (showImageOutputOptions || isCodexProvider) ? (
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
