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
import { useTranslation } from "react-i18next";
import type { FocusEvent, ReactNode } from "react";
import {
  Cloud,
  Mic,
  Paperclip,
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
import { resolveWorkspaceDisplayName } from "@/utils/workspace-display-name";
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
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { ChatInputEditor, type ChatInputEditorHandle } from "./ChatInputEditor";
import { ChatProjectSelector } from "./ChatProjectSelector";
import { createFileEntryFromUri, openFile } from "@/components/file/lib/open-file";
import { trpc } from "@/utils/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/hooks/use-projects";
import { useTabs } from "@/hooks/use-tabs";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { resolveProjectRootUri } from "@/lib/chat/mention-pointer";
import { resolveServerUrl } from "@/utils/server-url";
import { toast } from "sonner";
import ChatImageOutputOption, { type ChatImageOutputTarget } from "./ChatImageOutputOption";
import CodexOption from "./CodexOption";
import ClaudeCodeOption from "./ClaudeCodeOption";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import ChatCommandMenu, { type ChatCommandMenuHandle } from "./ChatCommandMenu";
import { useChatMessageComposer } from "../hooks/use-chat-message-composer";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import ApprovalModeSelector, { type ApprovalMode } from "./ApprovalModeSelector";
import ChatModeSelector, { type ChatMode } from "./ChatModeSelector";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { CLI_TOOLS_META } from "./model-preferences/CliToolsList";
import { useMainAgentModel } from "../hooks/use-main-agent-model";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
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
  /** When true, hides icon/title/subtitle in blocked state (used in centered layout). */
  blockedCompact?: boolean;
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
  /** When true, hides icon/title/subtitle in blocked state (used in centered layout). */
  blockedCompact?: boolean;
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
  /** Whether the conversation has started (has messages). */
  conversationStarted?: boolean;
  /** Display label for the selected CLI tool (e.g. "Claude Code"). */
  cliToolLabel?: string;
  /** Workspace display name shown in project selector. */
  workspaceName?: string;
  /** Called when user switches project from selector. */
  onProjectChange?: (projectId: string | undefined) => void;
  /** Whether the conversation has already started (disables project switching). */
  projectSelectorDisabled?: boolean;
  /** Optional content rendered after project selector. */
  afterProjectSelector?: ReactNode;
  /**
   * 上传文件到 session files 目录，返回绝对路径。
   * 用于系统文件拖拽场景，生成 @[/abs/path] mention。
   */
  uploadFileToSession?: (file: File) => Promise<string | null>;
}

export function ChatInputBox({
  value,
  onChange,
  className,
  placeholder,
  compact,
  variant = "default",
  actionVariant = "icon",
  submitLabel,
  cancelLabel,
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
  conversationStarted = false,
  cliToolLabel,
  blockedCompact = false,
  uploadFileToSession,
  workspaceName,
  onProjectChange,
  projectSelectorDisabled = false,
  afterProjectSelector,
}: ChatInputBoxProps) {
  const { t } = useTranslation('ai');
  const resolvedSubmitLabel = submitLabel ?? t('chat.send');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
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
  /** ContentEditable editor handle for focus/insert/mention operations. */
  const editorHandleRef = useRef<ChatInputEditorHandle | null>(null);
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

  const resolvedPlaceholder = chatMode === "cli"
    ? t('input.cliPlaceholder', { tool: cliToolLabel || "CLI" })
    : (placeholder ?? t('input.defaultPlaceholder'));
  const showProjectSelector = Boolean(
    onProjectChange && (workspaceId || projects.length > 0),
  );

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

  /** Focus the editor and optionally move caret to the end. */
  const focusInputSafely = useCallback(
    (position: "keep" | "end" = "keep") => {
      editorHandleRef.current?.focus(position);
    },
    [],
  );

  /** Insert text or a mention chip at the editor's current caret position. */
  const insertTextAtSelection = useCallback(
    (
      rawText: string,
      options?: {
        skipFocus?: boolean;
        ensureLeadingSpace?: boolean;
        ensureTrailingSpace?: boolean;
      },
    ) => {
      const handle = editorHandleRef.current;
      if (!handle) return;
      const insertOpts = {
        ensureLeadingSpace: options?.ensureLeadingSpace,
        ensureTrailingSpace: options?.ensureTrailingSpace,
      };
      // Single mention token → insert as chip
      if (/^@\[[^\]]+\]$/.test(rawText)) {
        handle.insertMention(rawText, insertOpts);
        return;
      }
      // Plain text (no mention tokens) → insert as text
      if (!/@\[[^\]]+\]/.test(rawText)) {
        handle.insertText(rawText, insertOpts);
        return;
      }
      // Mixed content (rare): append to value and let sync re-render
      const current = valueRef.current;
      const leading = insertOpts.ensureLeadingSpace && current && !/\s$/.test(current) ? " " : "";
      const trailing = insertOpts.ensureTrailingSpace ? " " : "";
      const newValue = `${current}${leading}${rawText}${trailing}`;
      valueRef.current = newValue;
      onChange(newValue);
      requestAnimationFrame(() => handle.focus("end"));
    },
    [onChange],
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

  /** Handle click on a mention chip — open file preview via generic open-file pipeline. */
  const handleChipClick = useCallback(
    (ref: string) => {
      const clean = ref.replace(/:\d+-\d+$/, "");
      let uri: string | null = null;
      let projectId: string | undefined;
      let rootUri: string | undefined;

      if (clean.startsWith("/")) {
        uri = `file://${clean}`;
      } else {
        const parsed = parseScopedProjectPath(clean);
        if (parsed?.projectId) {
          projectId = parsed.projectId;
          rootUri = resolveRootUri(parsed.projectId) || undefined;
          if (rootUri) {
            uri = resolveFileUriFromRoot(rootUri, parsed.relativePath);
          }
        }
      }

      if (!uri) return;

      const parts = clean.split("/");
      const name = parts[parts.length - 1] ?? "file";
      const entry = createFileEntryFromUri({ uri, name });
      if (!entry) return;

      openFile({
        entry,
        tabId,
        projectId: projectId || defaultProjectId || undefined,
        rootUri: rootUri || defaultRootUri,
        mode: "stack",
        readOnly: true,
      });
    },
    [defaultRootUri, defaultProjectId, resolveRootUri, tabId],
  );

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

  /** Insert a file reference token at the current cursor position. */
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
    // 优先级 3：系统文件拖拽 — 上传到 session files 目录，插入 @[/abs/path] mention
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      if (uploadFileToSession) {
        for (const file of files) {
          const absPath = await uploadFileToSession(file);
          if (absPath) {
            insertTextAtSelection(`@[${absPath}]`, { ensureLeadingSpace: true, ensureTrailingSpace: true });
          }
        }
        return;
      }
      // 无 uploadFileToSession 时回退到原有附件逻辑（兼容外部使用）。
      if (!onAddAttachments) return;
      if (!canAttachAll && !canAttachImage) return;
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
    insertTextAtSelection,
    isRelativePath,
    onAddAttachments,
    onAddMaskedAttachment,
    normalizeFileRef,
    uploadFileToSession,
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
        // 修复：dragover 阶段 files 始终为空，改用 items 检测。
        const hasFiles = (event.dataTransfer.items?.length ?? 0) > 0;
        if (!hasImageDrag && !hasFileRef && !hasFiles) return;
        if (!canAttachAll && !canAttachImage && !uploadFileToSession) return;
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
        <div className={cn("flex flex-col items-center justify-center gap-2.5 px-5 py-4", blockedCompact && "min-h-[104px]")}>
          {!blockedCompact && (
            <img
              src="/logo_nobody.png"
              alt="OpenLoaf"
              className="size-12 object-contain"
            />
          )}
          {!blockedCompact && (
            <div className="text-center">
              <p className="text-[13px] font-medium text-[#202124] dark:text-slate-50">
                {blockedReason === 'cloud-login'
                  ? t('blocked.titleCloudLogin')
                  : blockedReason === 'local-empty'
                    ? t('blocked.titleLocalEmpty')
                    : t('blocked.titleDefault')}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5f6368] dark:text-slate-400">
                {blockedReason === 'cloud-login'
                  ? t('blocked.descCloudLogin')
                  : blockedReason === 'local-empty'
                    ? onRequestSwitchCloud
                      ? t('blocked.descLocalEmptySwitch')
                      : t('blocked.descDefault')
                    : t('blocked.descDefault')}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {blockedReason === 'local-empty' && onRequestSwitchCloud ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e8f0fe] px-4 text-[12px] font-medium text-[#1a73e8] transition-colors duration-150 hover:bg-[#d2e3fc] disabled:opacity-50 dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70"
                onClick={onRequestSwitchCloud}
              >
                <Cloud className="size-3.5" />
                {t('blocked.btnSwitchCloud')}
              </button>
            ) : (
              <button
                type="button"
                className="h-8 rounded-full bg-[#e8f0fe] px-4 text-[12px] font-medium text-[#1a73e8] transition-colors duration-150 hover:bg-[#d2e3fc] disabled:opacity-50 dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70"
                onClick={onRequestLogin}
                disabled={!onRequestLogin}
              >
                {t('blocked.btnLoginCloud')}
              </button>
            )}
            {blockedReason === 'cloud-login' && onRequestSwitchLocal ? (
              <button
                type="button"
                className="h-8 rounded-full bg-[#f1f3f4] px-4 text-[12px] font-medium text-[#3c4043] transition-colors duration-150 hover:bg-[#e3e8ef] dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-300 dark:hover:bg-[hsl(var(--muted)/0.50)]"
                onClick={onRequestSwitchLocal}
              >
                {t('blocked.btnSwitchLocal')}
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f1f3f4] px-4 text-[12px] font-medium text-[#3c4043] transition-colors duration-150 hover:bg-[#e3e8ef] disabled:opacity-50 dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-300 dark:hover:bg-[hsl(var(--muted)/0.50)]"
                onClick={onRequestLocalConfig}
                disabled={!onRequestLocalConfig}
              >
                <Settings2 className="size-3.5" />
                {t('blocked.btnConfigLocal')}
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
            {showProjectSelector && (
              <div className="px-3 pt-2 pb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <ChatProjectSelector
                    projectId={defaultProjectId}
                    workspaceId={workspaceId}
                    workspaceName={workspaceName}
                    projects={projects}
                    onProjectChange={onProjectChange}
                    disabled={projectSelectorDisabled}
                  />
                  {afterProjectSelector ? (
                    <div className="min-w-0 flex-1 overflow-x-auto">
                      <div className="flex w-full min-w-max items-center justify-end">
                        {afterProjectSelector}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            <div className="w-full h-full min-h-0">
              <ChatInputEditor
                ref={editorHandleRef}
                value={value}
                onChange={onChange}
                onKeyDown={handleKeyDown}
                onChipClick={handleChipClick}
                onPasteFiles={onAddAttachments ? (files) => {
                  const dt = new DataTransfer();
                  for (const f of files) dt.items.add(f);
                  onAddAttachments(dt.files);
                } : undefined}
                placeholder={resolvedPlaceholder}
                className={cn(isOverLimit && "text-destructive")}
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
                      aria-label={t('input.addAttachment')}
                    >
                      <Paperclip className="w-4 h-4" />
                    </PromptInputButton>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {t('input.addAttachment')}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {!compact ? (
                <ApprovalModeSelector value={approvalMode} onChange={handleApprovalModeChange} disabled={chatMode === 'cli' && conversationStarted} />
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

              {!compact && !!defaultProjectId && hasCliTools && !conversationStarted ? (
                <ChatModeSelector
                  value={chatMode}
                  onChange={(mode) => onChatModeChange?.(mode)}
                  compact={toolbarCompact}
                  className="shrink-0 mr-0.5"
                />
              ) : null}

              {!compact ? <SelectMode triggerVariant="icon" className="shrink-0" chatMode={chatMode} disabled={chatMode === 'cli' && conversationStarted} /> : null}

              {actionVariant === "text" && onCancel && (
                <PromptInputButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs shadow-none"
                  onClick={onCancel}
                >
                  {resolvedCancelLabel}
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
                      aria-label={t('input.voiceInput')}
                    >
                      <Mic className={cn("w-4 h-4", isListening && "text-destructive")} />
                    </PromptInputButton>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {isListening ? t('input.stopVoiceInput') : t('input.voiceInput')}
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
                  {resolvedSubmitLabel}
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
                    {isLoading ? t('input.stopGenerating') : t('input.sendMessage')}
                  </TooltipContent>
                </Tooltip>
              )}
            </PromptInputTools>
          </PromptInputFooter>
          </TooltipProvider>

          {isOverLimit && (
             <div className="px-4 pb-2 text-xs text-destructive font-medium animate-in fade-in slide-in-from-top-1">
               {t('input.characterLimitExceeded', { max: MAX_CHARS })}
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
  blockedCompact,
  canImageEdit,
  isCodexProvider,
  onDropHandled,
}: ChatInputProps) {
  const { t } = useTranslation('ai');
  const { sendMessage, stopGenerating, clearError, setPendingCloudMessage } = useChatActions();
  const { status, isHistoryLoading, messages } = useChatState();
  const conversationStarted = messages.length > 0;
  const { input, setInput, imageOptions, codexOptions, claudeCodeOptions, addMaskedAttachment } = useChatOptions();
  const { projectId, workspaceId, tabId, sessionId } = useChatSession();
  const hasReasoningModel = useHasPreferredReasoningModel(projectId);

  /** 上传文件到 session files 目录，返回绝对路径（用于系统文件拖拽场景）。 */
  const uploadFileToSession = useCallback(
    async (file: File): Promise<string | null> => {
      if (!workspaceId) return null;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);
      if (projectId) formData.append("projectId", projectId);
      formData.append("sessionId", sessionId);
      try {
        const apiBase = resolveServerUrl();
        const endpoint = apiBase ? `${apiBase}/chat/files` : "/chat/files";
        const res = await fetch(endpoint, { method: "POST", body: formData });
        if (!res.ok) return null;
        const data = (await res.json()) as { path?: string };
        return data?.path ?? null;
      } catch {
        return null;
      }
    },
    [sessionId, projectId, workspaceId]
  );
  const activeTabId = useTabs((state) => state.activeTabId);
  const setSessionProjectId = useTabs((state) => state.setSessionProjectId);
  const setTabChatParams = useTabs((state) => state.setTabChatParams);
  const tabOnlineSearchEnabled = useTabs((state) => {
    const targetTabId = tabId ?? state.activeTabId;
    if (!targetTabId) return undefined;
    const tab = state.tabs.find((item) => item.id === targetTabId);
    const value = (tab?.chatParams as Record<string, unknown> | undefined)
      ?.chatOnlineSearchEnabled;
    return typeof value === "boolean" ? value : undefined;
  });
  /** Resolve workspace display name for project selector (with i18n). */
  const { t: tWorkspace } = useTranslation('workspace', { keyPrefix: 'workspace' });
  const { data: workspaceList } = useQuery({
    ...trpc.workspace.getList.queryOptions(),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const workspaceName = useMemo(() => {
    const raw = workspaceList?.find((w: { id: string; name: string }) => w.id === workspaceId)?.name;
    if (!raw) return undefined;
    return resolveWorkspaceDisplayName(raw, tWorkspace);
  }, [workspaceList, workspaceId, tWorkspace]);
  /** Switch project scope from the project selector. */
  const handleProjectChange = useCallback(
    (nextProjectId: string | undefined) => {
      const targetTabId = tabId ?? activeTabId;
      if (!targetTabId || !sessionId) return;
      // 更新 session 的 projectId；TabLayout useEffect 会自动同步 leftDock
      setSessionProjectId(targetTabId, sessionId, nextProjectId ?? "");
    },
    [tabId, activeTabId, sessionId, setSessionProjectId],
  );
  const { providerItems, loaded: settingsLoaded } = useSettingsValues();
  const { loggedIn: authLoggedIn, loading: authLoading } = useSaasAuth();
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const { basic, setBasic } = useBasicConfig();
  const setTabDictationStatus = useChatRuntime((s) => s.setTabDictationStatus);
  const dictationLanguage = basic.uiLanguage ?? undefined;
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
  // 没有项目时，CLI 模式无意义，强制回退到 agent 模式
  useEffect(() => {
    if (!projectId && chatMode === 'cli') {
      setChatMode('agent');
    }
  }, [projectId, chatMode]);
  const handleChatModeChange = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
    }
  }, []);
  /** Detect installed CLI tools to control mode selector visibility. */
  const installedCliProviderIds = useInstalledCliProviderIds();
  const hasCliTools = installedCliProviderIds.size > 0;
  const hasCodexCli = installedCliProviderIds.has("codex-cli");
  const hasClaudeCodeCli = installedCliProviderIds.has("claude-code-cli");
  /** Resolve selected CLI tool label for placeholder. */
  const { detail: mainAgentDetail, setCodeModelIds } = useMainAgentModel(projectId);
  const selectedCodeModelId = mainAgentDetail?.codeModelIds?.[0] ?? "";
  const isLegacyCodexSelected = selectedCodeModelId === "codex";
  const isLegacyClaudeCodeSelected = selectedCodeModelId === "claudeCode";
  const cliToolLabel = useMemo(() => {
    if (selectedCodeModelId.startsWith("claude-code-cli:")) {
      return CLI_TOOLS_META.find((item) => item.id === "claudeCode")?.label ?? selectedCodeModelId;
    }
    if (selectedCodeModelId.startsWith("codex-cli:")) {
      return CLI_TOOLS_META.find((item) => item.id === "codex")?.label ?? selectedCodeModelId;
    }
    if (isLegacyClaudeCodeSelected) {
      return CLI_TOOLS_META.find((item) => item.id === "claudeCode")?.label ?? "Claude Code";
    }
    if (isLegacyCodexSelected) {
      return CLI_TOOLS_META.find((item) => item.id === "codex")?.label ?? "Codex CLI";
    }
    if (hasClaudeCodeCli) {
      return CLI_TOOLS_META.find((item) => item.id === "claudeCode")?.label ?? "Claude Code";
    }
    if (hasCodexCli) {
      return CLI_TOOLS_META.find((item) => item.id === "codex")?.label ?? "Codex CLI";
    }
    return CLI_TOOLS_META[0]?.label;
  }, [hasClaudeCodeCli, hasCodexCli, isLegacyClaudeCodeSelected, isLegacyCodexSelected, selectedCodeModelId]);
  // 逻辑：根据当前 code model 判断 CLI 工具类型，驱动参数面板展示与请求 metadata。
  const isCodexCliSelected = useMemo(() => {
    if (!selectedCodeModelId) return false;
    return selectedCodeModelId.startsWith("codex-cli:") || isLegacyCodexSelected;
  }, [isLegacyCodexSelected, selectedCodeModelId]);
  const isClaudeCodeCliSelected = useMemo(() => {
    if (!selectedCodeModelId) return false;
    return selectedCodeModelId.startsWith("claude-code-cli:") || isLegacyClaudeCodeSelected;
  }, [isLegacyClaudeCodeSelected, selectedCodeModelId]);
  const activeCliProvider = useMemo<"codex-cli" | "claude-code-cli" | undefined>(() => {
    // 优先根据已选择的 code model 判断
    if (isCodexCliSelected) return "codex-cli";
    if (isClaudeCodeCliSelected) return "claude-code-cli";
    // 非 CLI 模式直接返回
    if (chatMode !== "cli") return undefined;
    // CLI 模式下，即使未选择具体模型，也根据已安装的 CLI 工具返回默认值
    // 优先返回 Codex（保持向后兼容）
    if (hasCodexCli) return "codex-cli";
    if (hasClaudeCodeCli) return "claude-code-cli";
    // 如果都未安装，仍返回 codex-cli 作为默认值（避免 UI 闪烁）
    return "codex-cli";
  }, [chatMode, hasClaudeCodeCli, hasCodexCli, isClaudeCodeCliSelected, isCodexCliSelected]);
  useEffect(() => {
    // 逻辑：兼容历史错误值（codex/claudeCode），自动迁移到 provider:modelId。
    if (selectedCodeModelId === "codex") {
      setCodeModelIds(["codex-cli:gpt-5.2-codex"]);
      return;
    }
    if (selectedCodeModelId === "claudeCode") {
      setCodeModelIds(["claude-code-cli:claude-sonnet-4-6"]);
    }
  }, [selectedCodeModelId, setCodeModelIds]);
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
  // 数据未加载完成时不判定为 unconfigured，避免刷新页面时闪现登录遮罩。
  const authResolved = !authLoading;
  const settingsResolved = settingsLoaded;
  const needsCloudLogin = authResolved && basic.chatSource === 'cloud' && !authLoggedIn;
  const needsLocalConfig = settingsResolved && basic.chatSource === 'local' && !hasConfiguredProviders;
  const isUnconfigured = (authResolved && settingsResolved)
    ? (needsCloudLogin || needsLocalConfig || (!authLoggedIn && !hasConfiguredProviders))
    : false;
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
        title: t('input.manageModels'),
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
  const showCodexModelSelector =
    resolvedIsCodexProvider || (chatMode === "cli" && activeCliProvider === "codex-cli");
  const showClaudeCodeModelSelector =
    chatMode === "cli" && activeCliProvider === "claude-code-cli";
  // 逻辑：CLI 直连且选中 Codex 时，也要携带 codexOptions 元数据。
  const codexOptionsEnabled =
    resolvedIsCodexProvider || (chatMode === "cli" && isCodexCliSelected);
  // 模型声明图片生成时显示图片输出选项。
  const showImageOutputOptions = resolvedCanImageGeneration;
  const allowAll = Boolean(canAttachAll);
  const allowImage = typeof canAttachImage === "boolean" ? canAttachImage : allowAll;
  const handleAddAttachments = allowImage ? onAddAttachments : undefined;
  const composeMessage = useChatMessageComposer({
    canImageGeneration: resolvedCanImageGeneration,
    isCodexProvider: codexOptionsEnabled,
    selectedCliProvider: chatMode === "cli" ? activeCliProvider : undefined,
    selectedCliModelId: chatMode === "cli" ? selectedCodeModelId : undefined,
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
      toast.error(t('image.noEditingSupport'));
      return;
    }
    if (!allowImage && readyImages.length > 0) {
      toast.error(t('image.noInputSupport'));
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
    const { parts, metadata, chatModelId } = composeMessage({
      textValue,
      imageParts,
      imageOptions,
      codexOptions: codexOptionsEnabled ? codexOptions : undefined,
      claudeCodeOptions:
        chatMode === "cli" && activeCliProvider === "claude-code-cli"
          ? claudeCodeOptions
          : undefined,
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
    // chatModelId 通过 body 传递，transport.ts 会将其提取到请求顶层
    sendMessage({
      parts,
      ...(metadata ? { metadata } : {}),
      ...(chatModelId ? { body: { chatModelId } } : {})
    } as any);
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
        conversationStarted={conversationStarted}
        cliToolLabel={cliToolLabel}
        blockedCompact={blockedCompact}
        uploadFileToSession={uploadFileToSession}
        workspaceName={workspaceName}
        onProjectChange={handleProjectChange}
        projectSelectorDisabled={conversationStarted}
        afterProjectSelector={
          !isUnconfigured && (showCodexModelSelector || showClaudeCodeModelSelector) ? (
            showCodexModelSelector ? (
              <CodexOption
                variant="inline"
                showMode={false}
                hideLabels
                disabled={conversationStarted}
                className="gap-2 px-0 py-0 flex-nowrap"
              />
            ) : showClaudeCodeModelSelector ? (
              <ClaudeCodeOption
                variant="inline"
                hideLabels
                disabled={conversationStarted}
                className="gap-2 px-0 py-0 flex-nowrap"
              />
            ) : null
          ) : null
        }
        header={
          !isUnconfigured && showImageOutputOptions ? (
            <ChatImageOutputOption
              model={model ?? null}
              variant="inline"
              hideAspectRatio={hasMaskedAttachment}
            />
          ) : null
        }
      />
    </>
  );
}
