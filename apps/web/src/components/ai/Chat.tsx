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

import { cn } from "@/lib/utils";
import ChatCoreProvider from "./ChatCoreProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./input/ChatInput";
import ChatHeader from "./ChatHeader";
import { useChatActions, useChatSession, useChatState } from "./context";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabs } from "@/hooks/use-tabs";
import { generateId } from "ai";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { LayoutGrid, Calendar, Mail, Clock } from "lucide-react";
import {
  CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  formatFileSize,
  isSupportedImageFile,
} from "./input/chat-attachments";
import type {
  ChatAttachment,
  ChatAttachmentInput,
  ChatAttachmentSource,
  MaskedAttachmentInput,
} from "./input/chat-attachments";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import { buildMaskedPreviewUrl, resolveMaskFileName } from "@/lib/image/mask";
import { readImageDragPayload } from "@/lib/image/drag";
import {
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_IMAGE_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
  FILE_DRAG_MASK_URI_MIME,
  DragDropOverlay,
} from "@/components/ai-elements/drag-drop";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";
import { useTabView } from "@/hooks/use-tab-view";
import { resolveServerUrl } from "@/utils/server-url";
import { createChatSessionId } from "@/lib/chat-session-id";
import { useChatModelSelection } from "./hooks/use-chat-model-selection";
import MessageHelper from "./message/MessageHelper";

type ChatProps = {
  className?: string;
  panelKey?: string;
  tabId?: string;
  sessionId?: string;
  loadHistory?: boolean;
  active?: boolean;
  /** Show full-page centered layout when empty (no left dock). */
  fullPage?: boolean;
  /** Callback for the header "new session" action. */
  onNewSession?: () => void;
  /** Callback for the header "close session" action. */
  onCloseSession?: () => void;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean; replaceCurrent?: boolean }
  ) => void;
} & Record<string, unknown>;

/** 最近会话列表，紧贴 ChatInput 上方，仅空会话时显示 */
function RecentSessionsBar() {
  const { messages } = useChatState()
  const { selectSession } = useChatActions()
  const { tabId } = useChatSession()
  const { recentSessions } = useChatSessions({ tabId })

  const isEmpty = !messages || messages.length === 0
  if (!isEmpty || recentSessions.length === 0) return null

  return (
    <div className="mx-3 mb-1">
      <div className="space-y-0.5">
        {recentSessions.map((session) => {
          const date = new Date(session.updatedAt)
          const isToday = date.toDateString() === new Date().toDateString()
          const timeLabel = isToday
            ? date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })
            : date.toLocaleDateString()
          return (
            <button
              key={session.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
              onClick={() => selectSession(session.id)}
            >
              <span className="min-w-0 flex-1 truncate text-foreground/80">
                {session.title}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/50">
                {timeLabel}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const QUICK_LAUNCH_ITEMS = [
  {
    baseId: "base:workbench", component: "workspace-desktop", label: "工作台", icon: LayoutGrid, title: "工作台", tabIcon: "bot",
    iconColor: "text-amber-700/70 dark:text-amber-300/70 group-hover:text-amber-700 dark:group-hover:text-amber-200",
    bgColor: "bg-amber-500/10 dark:bg-amber-400/10 group-hover:bg-amber-500/20 dark:group-hover:bg-amber-400/20",
  },
  {
    baseId: "base:calendar", component: "calendar-page", label: "日历", icon: Calendar, title: "日历", tabIcon: "🗓️",
    iconColor: "text-sky-700/70 dark:text-sky-300/70 group-hover:text-sky-700 dark:group-hover:text-sky-200",
    bgColor: "bg-sky-500/10 dark:bg-sky-400/10 group-hover:bg-sky-500/20 dark:group-hover:bg-sky-400/20",
  },
  {
    baseId: "base:mailbox", component: "email-page", label: "邮箱", icon: Mail, title: "邮箱", tabIcon: "📧",
    iconColor: "text-emerald-700/70 dark:text-emerald-300/70 group-hover:text-emerald-700 dark:group-hover:text-emerald-200",
    bgColor: "bg-emerald-500/10 dark:bg-emerald-400/10 group-hover:bg-emerald-500/20 dark:group-hover:bg-emerald-400/20",
  },
  {
    baseId: "base:scheduled-tasks", component: "scheduled-tasks-page", label: "任务", icon: Clock, title: "任务", tabIcon: "⏰",
    iconColor: "text-rose-700/70 dark:text-rose-300/70 group-hover:text-rose-700 dark:group-hover:text-rose-200",
    bgColor: "bg-rose-500/10 dark:bg-rose-400/10 group-hover:bg-rose-500/20 dark:group-hover:bg-rose-400/20",
  },
] as const

/** Quick launch bar shown at bottom of full-page empty state. */
function QuickLaunchBar() {
  const { tabId } = useChatSession()

  const handleQuickLaunch = React.useCallback(
    (item: (typeof QUICK_LAUNCH_ITEMS)[number]) => {
      if (!tabId) return
      useTabRuntime.getState().setTabBase(tabId, {
        id: item.baseId,
        component: item.component,
      })
      useTabs.getState().setTabTitle(tabId, item.title)
      useTabs.getState().setTabIcon(tabId, item.tabIcon)
    },
    [tabId],
  )

  return (
    <motion.div
      className="flex items-center justify-center gap-10 pb-8 pt-2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.3 }}
    >
      {QUICK_LAUNCH_ITEMS.map((item, index) => {
        const Icon = item.icon
        return (
          <motion.button
            key={item.baseId}
            type="button"
            className="group flex flex-col items-center gap-1.5"
            onClick={() => handleQuickLaunch(item)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.06, duration: 0.25 }}
          >
            <div className={cn(
              "flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-150 group-hover:scale-105",
              item.bgColor,
            )}>
              <Icon className={cn("size-6 transition-colors duration-150", item.iconColor)} />
            </div>
            <span className="text-[11px] text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
              {item.label}
            </span>
          </motion.button>
        )
      })}
    </motion.div>
  )
}

/** Full-page layout: centered input when empty, standard layout when messages exist. */
function ChatFullPageLayout({
  onNewSession,
  onCloseSession,
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
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
}: {
  onNewSession?: () => void
  onCloseSession?: () => void
  attachments: ChatAttachment[]
  onAddAttachments: (files: FileList | ChatAttachmentInput[]) => void
  onRemoveAttachment: (id: string) => void
  onClearAttachments: () => void
  onReplaceMaskedAttachment: (id: string, input: MaskedAttachmentInput) => void
  canAttachAll: boolean
  canAttachImage: boolean
  model: any
  isAutoModel: boolean
  canImageGeneration: boolean
  canImageEdit: boolean
  isCodexProvider: boolean
  onDropHandled: () => void
  handleDragEnter: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
}) {
  const { messages, isHistoryLoading, pendingCloudMessage } = useChatState()
  const isEmpty = !isHistoryLoading && messages.length === 0 && !pendingCloudMessage

  return (
    <motion.div
      layout
      className="relative flex flex-1 w-full flex-col min-h-0 min-w-0"
      transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        onNewSession={onNewSession}
        onCloseSession={onCloseSession}
        iconPalette="email"
      />
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key="empty"
            className="flex flex-1 flex-col min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex flex-1 flex-col items-center justify-center min-h-0">
              <div className="flex w-full max-w-2xl flex-col items-center gap-4 px-4">
                <motion.p
                  className="mb-4 text-base text-muted-foreground"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.2 }}
                >
                  有什么我能帮你的？
                </motion.p>
                <ChatInput
                  className="w-full !max-h-none !mt-0"
                  attachments={attachments}
                  onAddAttachments={onAddAttachments}
                  onRemoveAttachment={onRemoveAttachment}
                  onClearAttachments={onClearAttachments}
                  onReplaceMaskedAttachment={onReplaceMaskedAttachment}
                  canAttachAll={canAttachAll}
                  canAttachImage={canAttachImage}
                  model={model}
                  isAutoModel={isAutoModel}
                  canImageGeneration={canImageGeneration}
                  canImageEdit={canImageEdit}
                  isCodexProvider={isCodexProvider}
                  onDropHandled={onDropHandled}
                />
                <MessageHelper compact />
              </div>
            </div>
            <QuickLaunchBar />
          </motion.div>
        ) : (
          <motion.div
            key="filled"
            className="flex flex-1 flex-col min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            <MessageList className="flex-1 min-h-0" />
            <RecentSessionsBar />
            <ChatInput
              className="mx-2 mb-2"
              attachments={attachments}
              onAddAttachments={onAddAttachments}
              onRemoveAttachment={onRemoveAttachment}
              onClearAttachments={onClearAttachments}
              onReplaceMaskedAttachment={onReplaceMaskedAttachment}
              canAttachAll={canAttachAll}
              canAttachImage={canAttachImage}
              model={model}
              isAutoModel={isAutoModel}
              canImageGeneration={canImageGeneration}
              canImageEdit={canImageEdit}
              isCodexProvider={isCodexProvider}
              onDropHandled={onDropHandled}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Image filename matcher. */
const IMAGE_FILE_NAME_REGEX = /\.(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i;

/** Check whether a file ref or name targets an image. */
function isImageFileRef(fileRef: string) {
  const normalized = fileRef.trim().startsWith("@")
    ? fileRef.trim().slice(1)
    : fileRef.trim();
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const parsed = parseScopedProjectPath(baseValue);
  const name = (parsed?.relativePath ?? baseValue).split("/").pop() ?? "";
  return IMAGE_FILE_NAME_REGEX.test(name);
}

/** Check whether a value is a relative path. */
function isRelativePath(value: string) {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Check whether a drag payload includes image files. */
function hasImageFileUpload(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) {
    return files.some(
      (file) =>
        file.type.startsWith("image/") || IMAGE_FILE_NAME_REGEX.test(file.name)
    );
  }
  const items = Array.from(dataTransfer.items ?? []);
  return items.some(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
}

/** Read the file reference from an internal drag payload. */
function resolveDragRef(dataTransfer: DataTransfer) {
  const hasUri = dataTransfer.types.includes(FILE_DRAG_URI_MIME);
  const hasRef = dataTransfer.types.includes(FILE_DRAG_REF_MIME);
  if (!hasUri && !hasRef) return "";
  return dataTransfer.getData(FILE_DRAG_REF_MIME) || "";
}

/** Read the file name from an internal drag payload. */
function resolveDragName(dataTransfer: DataTransfer) {
  const hasUri = dataTransfer.types.includes(FILE_DRAG_URI_MIME);
  if (!hasUri) return "";
  return dataTransfer.getData(FILE_DRAG_NAME_MIME) || "";
}

export function Chat({
  className,
  panelKey: _panelKey,
  tabId,
  sessionId,
  loadHistory,
  active = true,
  fullPage,
  onNewSession,
  onCloseSession,
  onSessionChange,
  ...params
}: ChatProps) {
  const rawParams = React.useMemo(() => ({ ...params }), [params]);
  const tab = useTabView(tabId);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragCounterRef = React.useRef(0);
  const attachmentsRef = React.useRef<ChatAttachment[]>([]);
  const sessionIdRef = React.useRef<string>(sessionId ?? createChatSessionId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);
  const workspaceId =
    tab?.workspaceId ??
    (typeof rawParams.workspaceId === "string" ? rawParams.workspaceId.trim() : "");
  const projectId =
    typeof rawParams.projectId === "string" ? rawParams.projectId.trim() : "";
  const requestParams = React.useMemo(() => {
    const nextParams: Record<string, unknown> = { ...rawParams };
    // workspaceId/projectId 放入 SSE 请求体，避免后端缺失绑定信息。
    if (workspaceId) nextParams.workspaceId = workspaceId;
    else delete (nextParams as any).workspaceId;
    if (projectId) nextParams.projectId = projectId;
    else delete (nextParams as any).projectId;
    return nextParams;
  }, [rawParams, workspaceId, projectId]);
  const {
    chatModelSource,
    selectedModelId,
    selectedModel,
    isAutoModel,
    canAttachAll,
    canAttachImage,
    canImageGeneration,
    canImageEdit,
    isCodexProvider,
    imageModelId,
    videoModelId,
  } = useChatModelSelection(tabId, projectId);

  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [dragMode, setDragMode] = React.useState<"allow" | "deny">("allow");
  const [dragHint, setDragHint] = React.useState<"image" | "file">("file");

  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  React.useEffect(() => {
    if (sessionId) return;
    onSessionChange?.(effectiveSessionId, { loadHistory: false });
  }, [sessionId, effectiveSessionId, onSessionChange]);

  React.useEffect(() => {
    /**
     * 组件卸载时回收 objectUrl，避免内存泄漏。
     */
    return () => {
      for (const attachment of attachmentsRef.current) {
        URL.revokeObjectURL(attachment.objectUrl);
        if (attachment.mask?.objectUrl) {
          URL.revokeObjectURL(attachment.mask.objectUrl);
        }
      }
    };
  }, []);

  const removeAttachment = React.useCallback((attachmentId: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === attachmentId);
      if (target) {
        URL.revokeObjectURL(target.objectUrl);
        if (target.mask?.objectUrl) {
          URL.revokeObjectURL(target.mask.objectUrl);
        }
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  }, []);

  const clearAttachments = React.useCallback(() => {
    setAttachments((prev) => {
      for (const item of prev) {
        URL.revokeObjectURL(item.objectUrl);
        if (item.mask?.objectUrl) {
          URL.revokeObjectURL(item.mask.objectUrl);
        }
      }
      return [];
    });
  }, []);

  const updateAttachment = React.useCallback(
    (attachmentId: string, updates: Partial<ChatAttachment>) => {
      setAttachments((prev) =>
        prev.map((item) => (item.id === attachmentId ? { ...item, ...updates } : item))
      );
    },
    []
  );

  /** Update mask metadata for an attachment. */
  const updateMaskAttachment = React.useCallback(
    (attachmentId: string, updates: Partial<NonNullable<ChatAttachment["mask"]>>) => {
      setAttachments((prev) =>
        prev.map((item) =>
          item.id === attachmentId && item.mask ? { ...item, mask: { ...item.mask, ...updates } } : item
        )
      );
    },
    []
  );

  /** Upload a file and return the remote url payload. */
  const uploadFile = React.useCallback(
    async (input: ChatAttachmentSource) => {
      if (!workspaceId) {
        return { ok: false as const, errorMessage: "当前标签页未绑定工作区，无法上传图片" };
      }
      // 上传后端生成相对路径，后续仅存该引用。
      const formData = new FormData();
      const sourceUrl = input.sourceUrl?.trim();
      // 中文注释：内部拖拽若携带相对路径，则直接按引用上传。
      if (sourceUrl && isRelativePath(sourceUrl)) {
        formData.append("file", sourceUrl);
      } else {
        formData.append("file", input.file);
      }
      formData.append("workspaceId", workspaceId);
      // 无项目时退回到 workspace 根目录。
      if (projectId) formData.append("projectId", projectId);
      formData.append("sessionId", effectiveSessionId);

      try {
        const apiBase = resolveServerUrl();
        const endpoint = apiBase ? `${apiBase}/chat/attachments` : "/chat/attachments";
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errorText = await res.text();
          return {
            ok: false as const,
            errorMessage: errorText || "图片上传失败，请重试",
          };
        }
        const data = (await res.json()) as {
          url?: string;
          mediaType?: string;
        };
        if (!data?.url) {
          return {
            ok: false as const,
            errorMessage: "图片上传失败：服务端未返回地址",
          };
        }
        return {
          ok: true as const,
          url: data.url,
          mediaType: data.mediaType ?? input.file.type,
        };
      } catch {
        return { ok: false as const, errorMessage: "图片上传失败，请检查网络连接" };
      }
    },
    [effectiveSessionId, projectId, workspaceId]
  );

  /** Upload the main attachment file. */
  const uploadAttachment = React.useCallback(
    async (attachment: ChatAttachment) => {
      const result = await uploadFile({
        file: attachment.file,
        sourceUrl: attachment.sourceUrl,
      });
      if (!result.ok) {
        updateAttachment(attachment.id, {
          status: "error",
          errorMessage: result.errorMessage,
        });
        return result;
      }
      updateAttachment(attachment.id, {
        status: "ready",
        remoteUrl: result.url,
        mediaType: result.mediaType,
      });
      return result;
    },
    [updateAttachment, uploadFile]
  );

  /** Upload the mask file for an attachment. */
  const uploadMaskAttachment = React.useCallback(
    async (attachmentId: string, maskFile: File) => {
      const result = await uploadFile({ file: maskFile });
      if (!result.ok) {
        updateMaskAttachment(attachmentId, {
          status: "error",
          errorMessage: result.errorMessage,
        });
        updateAttachment(attachmentId, {
          status: "error",
          errorMessage: result.errorMessage,
        });
        return;
      }
      updateMaskAttachment(attachmentId, {
        status: "ready",
        remoteUrl: result.url,
        mediaType: result.mediaType,
      });
    },
    [updateAttachment, updateMaskAttachment, uploadFile]
  );

  /** Normalize attachment inputs into source entries. */
  const normalizeAttachmentInputs = React.useCallback(
    (input: FileList | ChatAttachmentInput[]): ChatAttachmentSource[] => {
      if (input instanceof FileList) {
        return Array.from(input).map((file) => ({ file }));
      }
      return input.map((item) =>
        item instanceof File ? { file: item } : item
      );
    },
    []
  );

  /** Add normal attachments from files. */
  const addAttachments = React.useCallback((files: FileList | ChatAttachmentInput[]) => {
    const sourceItems = normalizeAttachmentInputs(files);
    if (sourceItems.length === 0) return;

    const next: ChatAttachment[] = [];
    for (const source of sourceItems) {
      const file = source.file;
      if (!isSupportedImageFile(file)) {
        continue;
      }
      if (file.size > CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
        const objectUrl = URL.createObjectURL(file);
        next.push({
          id: generateId(),
          file,
          sourceUrl: source.sourceUrl,
          objectUrl,
          status: "error",
          errorMessage: `文件过大（${formatFileSize(file.size)}），请小于 ${formatFileSize(
            CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES
          )}`,
        });
        continue;
      }

      const objectUrl = URL.createObjectURL(file);
      next.push({
        id: generateId(),
        file,
        sourceUrl: source.sourceUrl,
        objectUrl,
        status: "loading",
      });
    }

    if (next.length === 0) return;

    setAttachments((prev) => [...prev, ...next]);
    for (const item of next) {
      if (item.status !== "loading") continue;
      void uploadAttachment(item);
    }
  }, [normalizeAttachmentInputs, uploadAttachment]);

  /** Add a masked attachment and trigger uploads. */
  const addMaskedAttachment = React.useCallback(
    (input: MaskedAttachmentInput) => {
      const previewUrl = input.previewUrl || URL.createObjectURL(input.file);
      const maskPreviewUrl = URL.createObjectURL(input.maskFile);
      const nextAttachment: ChatAttachment = {
        id: generateId(),
        file: input.file,
        objectUrl: previewUrl,
        status: "loading",
        mask: {
          file: input.maskFile,
          objectUrl: maskPreviewUrl,
          status: "loading",
        },
        hasMask: true,
      };

      setAttachments((prev) => {
        // 仅允许存在一张带 mask 的附件，新建时替换旧的。
        const next: ChatAttachment[] = [];
        for (const item of prev) {
          if (item.hasMask) {
            URL.revokeObjectURL(item.objectUrl);
            if (item.mask?.objectUrl) {
              URL.revokeObjectURL(item.mask.objectUrl);
            }
            continue;
          }
          next.push(item);
        }
        next.push(nextAttachment);
        return next;
      });

      void (async () => {
        const imageResult = await uploadAttachment(nextAttachment);
        if (!imageResult?.ok) return;
        const maskFileName = resolveMaskFileName(resolveFileName(imageResult.url));
        const renamedMaskFile = new File([input.maskFile], maskFileName, {
          type: input.maskFile.type || "image/png",
        });
        updateMaskAttachment(nextAttachment.id, {
          file: renamedMaskFile,
        });
        await uploadMaskAttachment(nextAttachment.id, renamedMaskFile);
      })();
    },
    [resolveMaskFileName, updateMaskAttachment, uploadAttachment, uploadMaskAttachment]
  );

  /** Replace an existing attachment with a new masked version. */
  const replaceMaskedAttachment = React.useCallback(
    (attachmentId: string, input: MaskedAttachmentInput) => {
      const previewUrl = input.previewUrl || URL.createObjectURL(input.file);
      const maskPreviewUrl = URL.createObjectURL(input.maskFile);
      let targetAttachment: ChatAttachment | null = null;
      setAttachments((prev) =>
        prev.map((item) => {
          if (item.id !== attachmentId) return item;
          URL.revokeObjectURL(item.objectUrl);
          if (item.mask?.objectUrl) {
            URL.revokeObjectURL(item.mask.objectUrl);
          }
          targetAttachment = {
            ...item,
            file: input.file,
            objectUrl: previewUrl,
            status: "loading",
            errorMessage: undefined,
            remoteUrl: undefined,
            mediaType: undefined,
            mask: {
              file: input.maskFile,
              objectUrl: maskPreviewUrl,
              status: "loading",
              errorMessage: undefined,
              remoteUrl: undefined,
              mediaType: undefined,
            },
            hasMask: true,
          };
          return targetAttachment;
        })
      );

      if (!targetAttachment) {
        addMaskedAttachment(input);
        return;
      }

      void (async () => {
        const imageResult = await uploadAttachment(targetAttachment);
        if (!imageResult?.ok) return;
        const maskFileName = resolveMaskFileName(resolveFileName(imageResult.url));
        const renamedMaskFile = new File([input.maskFile], maskFileName, {
          type: input.maskFile.type || "image/png",
        });
        updateMaskAttachment(attachmentId, {
          file: renamedMaskFile,
          status: "loading",
          errorMessage: undefined,
          remoteUrl: undefined,
          mediaType: undefined,
        });
        await uploadMaskAttachment(attachmentId, renamedMaskFile);
      })();
    },
    [
      addMaskedAttachment,
      resolveMaskFileName,
      updateMaskAttachment,
      uploadAttachment,
      uploadMaskAttachment,
    ]
  );

  const resetDragState = React.useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragActive(false);
    setDragMode("allow");
  }, [setIsDragActive, setDragMode]);

  const handleDragEnter = React.useCallback((event: React.DragEvent) => {
    const hasFiles = event.dataTransfer?.types?.includes("Files") ?? false;
    const hasOpenLoafRef =
      event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
    const hasOpenLoafUri =
      event.dataTransfer?.types?.includes(FILE_DRAG_URI_MIME) ?? false;
    const hasOpenLoafImage =
      event.dataTransfer?.types?.includes(FILE_DRAG_IMAGE_MIME) ?? false;
    if (!hasFiles && !hasOpenLoafRef && !hasOpenLoafUri) return;
    const fileRef = resolveDragRef(event.dataTransfer);
    const fileName = resolveDragName(event.dataTransfer);
    const hasImageUpload = hasFiles && hasImageFileUpload(event.dataTransfer);
    const isFileRefImage =
      hasOpenLoafImage ||
      (Boolean(fileRef || fileName) && isImageFileRef(fileRef || fileName));
    const wantsImage = hasImageUpload || hasOpenLoafImage || isFileRefImage;
    const shouldDeny =
      (wantsImage && !canAttachImage) ||
      ((hasOpenLoafRef || hasOpenLoafUri) && !canAttachAll) ||
      (hasFiles && !hasImageUpload);
    if (shouldDeny) {
      event.preventDefault();
      setIsDragActive(true);
      setDragMode("deny");
      setDragHint(wantsImage ? "image" : "file");
      return;
    }
    dragCounterRef.current += 1;
    setIsDragActive(true);
    setDragMode("allow");
    setDragHint(wantsImage ? "image" : "file");
  }, [canAttachAll, canAttachImage]);

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    const hasFiles = event.dataTransfer?.types?.includes("Files") ?? false;
    const hasOpenLoafRef =
      event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
    const hasOpenLoafUri =
      event.dataTransfer?.types?.includes(FILE_DRAG_URI_MIME) ?? false;
    const hasOpenLoafImage =
      event.dataTransfer?.types?.includes(FILE_DRAG_IMAGE_MIME) ?? false;
    if (!hasFiles && !hasOpenLoafRef && !hasOpenLoafUri) return;
    const fileRef = resolveDragRef(event.dataTransfer);
    const fileName = resolveDragName(event.dataTransfer);
    const hasImageUpload = hasFiles && hasImageFileUpload(event.dataTransfer);
    const isFileRefImage =
      hasOpenLoafImage ||
      (Boolean(fileRef || fileName) && isImageFileRef(fileRef || fileName));
    const wantsImage = hasImageUpload || hasOpenLoafImage || isFileRefImage;
    const shouldDeny =
      (wantsImage && !canAttachImage) ||
      ((hasOpenLoafRef || hasOpenLoafUri) && !canAttachAll) ||
      (hasFiles && !hasImageUpload);
    event.preventDefault();
    if (shouldDeny) {
      setIsDragActive(true);
      setDragMode("deny");
      setDragHint(wantsImage ? "image" : "file");
      return;
    }
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
    setDragMode("allow");
    setDragHint(wantsImage ? "image" : "file");
  }, [canAttachAll, canAttachImage]);

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    const hasFiles = event.dataTransfer?.types?.includes("Files") ?? false;
    const hasOpenLoafRef =
      event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
    const hasOpenLoafUri =
      event.dataTransfer?.types?.includes(FILE_DRAG_URI_MIME) ?? false;
    if (!hasFiles && !hasOpenLoafRef && !hasOpenLoafUri) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
      setDragMode("allow");
    }
  }, []);

  const handleDrop = React.useCallback(
    async (event: React.DragEvent) => {
      console.debug("[Chat] drop payload", JSON.stringify({
        types: Array.from(event.dataTransfer?.types ?? []),
        items: Array.from(event.dataTransfer?.items ?? []).map((item) => ({
          kind: item.kind,
          type: item.type,
        })),
        files: Array.from(event.dataTransfer?.files ?? []).map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
        data: {
          fileRef: event.dataTransfer?.getData(FILE_DRAG_REF_MIME),
          fileUri: event.dataTransfer?.getData(FILE_DRAG_URI_MIME),
          fileName: event.dataTransfer?.getData(FILE_DRAG_NAME_MIME),
          fileMaskUri: event.dataTransfer?.getData(FILE_DRAG_MASK_URI_MIME),
          text: event.dataTransfer?.getData("text/plain"),
          uriList: event.dataTransfer?.getData("text/uri-list"),
        },
      }));
      const hasFiles = event.dataTransfer?.types?.includes("Files") ?? false;
      const hasImageDrag = Boolean(readImageDragPayload(event.dataTransfer));
      const hasFileRef = event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
      if (!hasFiles && !hasImageDrag && !hasFileRef) return;
      if (event.defaultPrevented) {
        dragCounterRef.current = 0;
        setIsDragActive(false);
        setDragMode("allow");
        return;
      }
      const fileRef = event.dataTransfer?.getData(FILE_DRAG_REF_MIME) ?? "";
      const imagePayload = readImageDragPayload(event.dataTransfer);
      if (imagePayload) {
        event.preventDefault();
        dragCounterRef.current = 0;
        setIsDragActive(false);
        const payloadFileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
        const isPayloadImage =
          Boolean(imagePayload.maskUri) || IMAGE_FILE_NAME_REGEX.test(payloadFileName);
        if (!isPayloadImage) {
          if (!canAttachAll) {
            setDragMode("allow");
            return;
          }
          const resolvedFileRef =
            fileRef || (isRelativePath(imagePayload.baseUri) ? imagePayload.baseUri : "");
          const normalizedRef = resolvedFileRef.startsWith("@")
            ? resolvedFileRef.slice(1)
            : resolvedFileRef;
          if (normalizedRef && isRelativePath(normalizedRef)) {
            window.dispatchEvent(
              new CustomEvent("openloaf:chat-insert-mention", {
                detail: { value: normalizedRef },
              })
            );
          }
          setDragMode("allow");
          return;
        }
        if (!canAttachImage) {
          setDragMode("allow");
          return;
        }
        try {
          if (imagePayload.maskUri) {
            const fileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
            const baseBlob = await fetchBlobFromUri(imagePayload.baseUri, { projectId });
            const maskBlob = await fetchBlobFromUri(imagePayload.maskUri, { projectId });
            const baseFile = new File([baseBlob], fileName, {
              type: baseBlob.type || "application/octet-stream",
            });
            const maskFile = new File([maskBlob], resolveMaskFileName(fileName), {
              type: "image/png",
            });
            const previewUrl = await buildMaskedPreviewUrl(baseBlob, maskBlob);
            addMaskedAttachment({ file: baseFile, maskFile, previewUrl });
            return;
          }
          const fileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
          const blob = await fetchBlobFromUri(imagePayload.baseUri, { projectId });
          const file = new File([blob], fileName, {
            type: blob.type || "application/octet-stream",
          });
          const sourceUrl = isRelativePath(imagePayload.baseUri)
            ? imagePayload.baseUri
            : undefined;
          // 中文注释：应用内拖拽在聊天根节点落下时，也按统一附件流程处理。
          addAttachments([{ file, sourceUrl }]);
          return;
        } catch {
          return;
        }
      }
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length > 0) {
        event.preventDefault();
        dragCounterRef.current = 0;
        setIsDragActive(false);
        setDragMode("allow");
        if (!canAttachImage) return;
        addAttachments(droppedFiles);
        return;
      }
      if (!fileRef) return;
      if (isImageFileRef(fileRef) && !canAttachImage) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      setDragMode("allow");
      if (!canAttachAll) return;
      window.dispatchEvent(
        new CustomEvent("openloaf:chat-insert-mention", {
          detail: { value: fileRef },
        })
      );
    },
    [addAttachments, addMaskedAttachment, canAttachAll, canAttachImage, projectId]
  );

  // 共享的 ChatInput / drag 相关 props，避免重复。
  const sharedInputProps = {
    attachments,
    onAddAttachments: addAttachments,
    onRemoveAttachment: removeAttachment,
    onClearAttachments: clearAttachments,
    onReplaceMaskedAttachment: replaceMaskedAttachment,
    canAttachAll,
    canAttachImage,
    model: selectedModel,
    isAutoModel,
    canImageGeneration,
    canImageEdit,
    isCodexProvider,
    onDropHandled: resetDragState,
  };

  // 渲染单个会话内容（活跃状态）
  const renderActiveSession = () => (
    <ChatCoreProvider
      tabId={tabId}
      sessionId={effectiveSessionId}
      loadHistory={effectiveLoadHistory}
      params={requestParams}
      onSessionChange={onSessionChange}
      addAttachments={addAttachments}
      addMaskedAttachment={addMaskedAttachment}
    >
      {fullPage ? (
        <ChatFullPageLayout
          onNewSession={onNewSession}
          onCloseSession={onCloseSession}
          {...sharedInputProps}
          handleDragEnter={handleDragEnter}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
        />
      ) : (
        <motion.div
          layout
          layoutId={`session-content-${effectiveSessionId}`}
          className="relative flex flex-1 w-full flex-col min-h-0 min-w-0"
          transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <ChatHeader
            onNewSession={onNewSession}
            onCloseSession={onCloseSession}
            iconPalette="email"
          />
          <MessageList className="flex-1 min-h-0" />
          <RecentSessionsBar />
          <ChatInput
            className="mx-2 mb-2"
            {...sharedInputProps}
          />
        </motion.div>
      )}
    </ChatCoreProvider>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex h-full w-full flex-col min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden",
        className
      )}
      data-openloaf-chat-root
      data-tab-id={tabId}
      data-chat-active={active ? "true" : "false"}
    >
      {renderActiveSession()}

      <div
        data-openloaf-chat-mask
        className="absolute inset-0 z-30 hidden bg-transparent"
        aria-hidden="true"
      />

      <DragDropOverlay
        open={isDragActive}
        title={
          dragMode === "deny"
            ? dragHint === "image"
              ? "当前模型不支持图片"
              : "当前模型不支持文件"
            : dragHint === "image"
              ? "松开鼠标即可添加图片"
              : "松开鼠标即可添加文件"
        }
        variant={dragMode === "deny" ? "warning" : "default"}
        radiusClassName="rounded-2xl"
        description={
          dragMode === "deny" ? (
            dragHint === "image"
              ? "请切换到支持图片输入的模型"
              : "仅支持拖入项目文件引用"
          ) : dragHint === "image" ? (
            <>
              支持 PNG / JPEG / WebP，单文件不超过{" "}
              {formatFileSize(CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES)}，可多选
            </>
          ) : (
            "支持拖入项目文件引用"
          )
        }
      />
    </div>
  );
}
