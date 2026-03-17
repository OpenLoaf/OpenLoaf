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

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ChatCoreProvider from "./ChatCoreProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./input/ChatInput";
import ChatHeader from "./ChatHeader";
import { useChatActions, useChatSession, useChatState } from "./context";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import i18next from "i18next";
import { generateId } from "ai";
import * as React from "react";
import { motion } from "motion/react";
import { LayoutDashboard, CalendarDays, Mail, Clock, Folder, Settings } from "lucide-react";
import { QUICK_LAUNCH_ITEMS, PROJECT_QUICK_LAUNCH_ITEMS } from "./quick-launch-items";
import { openProjectShellTab } from "@/lib/project-shell";
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
import {
  matchProjectFileDragSession,
  clearProjectFileDragSession,
} from "@/lib/project-file-drag-session";
import { useAppState } from "@/hooks/use-app-state";
import { resolveServerUrl } from "@/utils/server-url";
import { createChatSessionId } from "@/lib/chat-session-id";
import { useChatModelSelection } from "./hooks/use-chat-model-selection";
import { useProject } from "@/hooks/use-project";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openloaf/ui/alert-dialog";
import MessageHelper from "./message/MessageHelper";
import { openPrimaryPage } from "@/lib/primary-page-navigation";

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
  /** Control whether the header keeps session history / switching UI enabled. */
  enableMultiSession?: boolean;
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

// QUICK_LAUNCH_ITEMS and PROJECT_QUICK_LAUNCH_ITEMS imported from ./quick-launch-items

/** Feature-specific icon + color mapping for intro dialog. */
const FEATURE_INTRO_STYLE = {
  index: {
    icon: LayoutDashboard,
    iconColor: "text-ol-blue",
    iconBg: "bg-ol-blue/10",
  },
  tasks: {
    icon: CalendarDays,
    iconColor: "text-ol-amber",
    iconBg: "bg-ol-amber/10",
  },
} as const

/** Feature intro dialog for gated project features. */
function FeatureIntroDialog({
  feature,
  open,
  onOpenChange,
  onConfirm,
}: {
  feature: "index" | "tasks"
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('ai')
  const style = FEATURE_INTRO_STYLE[feature]
  const Icon = style.icon
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="shadow-none border-border/60">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              style.iconBg,
            )}>
              <Icon className={cn("size-5", style.iconColor)} />
            </div>
            <AlertDialogTitle className="text-base">{t(`featureIntro.${feature}.title`)}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-1">
            {t(`featureIntro.${feature}.description`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('featureIntro.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-ol-blue/10 text-ol-blue hover:bg-ol-blue/20"
          >
            {t('featureIntro.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Quick launch bar shown at bottom of full-page empty state. */
function QuickLaunchBar({ projectId }: { projectId?: string }) {
  const { t } = useTranslation('ai')
  const { t: tProject } = useTranslation('project')
  const { tabId } = useChatSession()
  const { data: projectData, invalidateProject } = useProject(projectId || undefined)
  const [introFeature, setIntroFeature] = React.useState<"index" | "tasks" | null>(null)
  const initFeatureMutation = useMutation(trpc.project.initFeature.mutationOptions())

  // initializedFeatures 为 undefined → 旧项目，全部激活
  const initFeatures = projectData?.project?.initializedFeatures
  const isAllActive = !initFeatures

  const sortedProjectItems = React.useMemo(() => {
    if (!projectId || isAllActive) return [...PROJECT_QUICK_LAUNCH_ITEMS]
    const active = PROJECT_QUICK_LAUNCH_ITEMS.filter(
      item => !item.featureGated || initFeatures.includes(item.value)
    )
    const inactive = PROJECT_QUICK_LAUNCH_ITEMS.filter(
      item => item.featureGated && !initFeatures.includes(item.value)
    )
    return [...active, ...inactive]
  }, [projectId, initFeatures, isAllActive])

  const handleGlobalQuickLaunch = React.useCallback(
    (item: (typeof QUICK_LAUNCH_ITEMS)[number]) => {
      openPrimaryPage({
        baseId: item.baseId,
        component: item.component,
        title: i18next.t(item.titleKey),
        icon: item.tabIcon,
      })
    },
    [],
  )

  const handleProjectQuickLaunch = React.useCallback(
    (item: (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]) => {
      if (!projectId) return
      const rootUri = projectData?.project?.rootUri
      // 中文注释：项目内快捷入口统一走 project-shell，避免只改 base 导致返回路径和上下文漂移。
      openProjectShellTab({
        projectId,
        rootUri: rootUri ?? "",
        title: projectData?.project?.title ?? projectId,
        icon: projectData?.project?.icon ?? null,
        tab: item.value,
      })
    },
    [projectId, projectData],
  )

  const handleProjectItemClick = React.useCallback(
    (item: (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]) => {
      const isInactive = !isAllActive && item.featureGated
        && !initFeatures?.includes(item.value)
      if (isInactive && (item.value === "index" || item.value === "tasks")) {
        setIntroFeature(item.value)
      } else {
        handleProjectQuickLaunch(item)
      }
    },
    [isAllActive, initFeatures, handleProjectQuickLaunch],
  )

  const handleIntroConfirm = React.useCallback(async () => {
    if (!introFeature || !projectId) return
    const feature = introFeature
    setIntroFeature(null)
    await initFeatureMutation.mutateAsync({ projectId, feature })
    await invalidateProject()
    // 初始化完成后导航到对应页面
    const item = PROJECT_QUICK_LAUNCH_ITEMS.find(i => i.value === feature)
    if (item) handleProjectQuickLaunch(item)
  }, [introFeature, projectId, initFeatureMutation, invalidateProject, handleProjectQuickLaunch])

  const items = projectId ? sortedProjectItems : QUICK_LAUNCH_ITEMS

  return (
    <>
      <motion.div
        className="flex items-center justify-center gap-10 pb-8 pt-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        {items.map((item, index) => {
          const Icon = item.icon
          const label = projectId
            ? tProject((item as (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]).labelKey)
            : t((item as (typeof QUICK_LAUNCH_ITEMS)[number]).labelKey)
          const isInactive = projectId && !isAllActive
            && (item as (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]).featureGated
            && !initFeatures?.includes((item as (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]).value)
          return (
            <motion.button
              key={"value" in item ? item.value : item.baseId}
              type="button"
              className={cn("group flex flex-col items-center gap-1.5", isInactive && "opacity-50")}
              onClick={() =>
                projectId
                  ? handleProjectItemClick(item as (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number])
                  : handleGlobalQuickLaunch(item as (typeof QUICK_LAUNCH_ITEMS)[number])
              }
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: isInactive ? 0.5 : 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.06, duration: 0.25 }}
            >
              <div className={cn(
                "flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-150 group-hover:scale-105",
                isInactive ? "bg-ol-text-auxiliary/8" : item.bgColor,
              )}>
                <Icon className={cn(
                  "size-6 transition-colors duration-150",
                  isInactive ? "text-ol-text-auxiliary" : item.iconColor,
                )} />
              </div>
              <span className="text-[11px] text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
                {label}
              </span>
            </motion.button>
          )
        })}
      </motion.div>
      {introFeature && (
        <FeatureIntroDialog
          feature={introFeature}
          open={Boolean(introFeature)}
          onOpenChange={(open) => { if (!open) setIntroFeature(null) }}
          onConfirm={handleIntroConfirm}
        />
      )}
    </>
  )
}

/** Full-page layout: centered input when empty, standard layout when messages exist. */
function ChatFullPageLayout({
  onNewSession,
  onCloseSession,
  projectId,
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
  enableMultiSession,
}: {
  onNewSession?: () => void
  onCloseSession?: () => void
  projectId?: string
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
  enableMultiSession?: boolean
}) {
  const { t } = useTranslation('ai')
  const { messages, pendingCloudMessage, isHistoryLoading } = useChatState()
  const isEmpty = messages.length === 0 && !pendingCloudMessage

  return (
    <div
      className="relative flex flex-1 w-full flex-col min-h-0 min-w-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        onNewSession={onNewSession}
        onCloseSession={onCloseSession}
        iconPalette="email"
        enableMultiSession={enableMultiSession}
      />
      {isHistoryLoading ? (
        <div className="flex-1" />
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex flex-1 flex-col items-center justify-center min-h-0">
            <div className="flex w-full max-w-3xl flex-col items-center gap-4 px-6 -mt-20">
              <motion.img
                src="/logo_nobody.png"
                alt="OpenLoaf"
                className="mb-2 h-24 w-24"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
              />
              <motion.p
                className="mb-4 text-base text-muted-foreground"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                {t('chat.welcomeMessage')}
              </motion.p>
              <ChatInput
                className="w-full !max-h-none !mt-0"
                large
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
                blockedCompact
              />
              <div className="mt-4">
                <MessageHelper compact projectId={projectId} />
              </div>
            </div>
          </div>
          <QuickLaunchBar projectId={projectId} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0">
          <MessageList className="flex-1 min-h-0" projectId={projectId} />
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
        </div>
      )}
    </div>
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
  enableMultiSession,
  ...params
}: ChatProps) {
  const { t } = useTranslation('ai');
  const rawParams = React.useMemo(() => ({ ...params }), [params]);
  const tab = useAppState();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragCounterRef = React.useRef(0);
  const attachmentsRef = React.useRef<ChatAttachment[]>([]);
  const sessionIdRef = React.useRef<string>(sessionId ?? createChatSessionId());
  const effectiveSessionId = sessionId ?? sessionIdRef.current;
  const effectiveLoadHistory = loadHistory ?? Boolean(sessionId);
  const projectId =
    typeof rawParams.projectId === "string" ? rawParams.projectId.trim() : "";
  const requestParams = React.useMemo(() => {
    const nextParams: Record<string, unknown> = { ...rawParams };
    if (projectId) {
      nextParams.projectId = projectId;
      // Project chats use PM agent directly (streaming) instead of Master agent
      nextParams.agentType = 'pm';
    } else {
      delete (nextParams as any).projectId;
      delete (nextParams as any).agentType;
    }
    return nextParams;
  }, [rawParams, projectId]);
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
      // 上传后端生成相对路径，后续仅存该引用。
      const formData = new FormData();
      const sourceUrl = input.sourceUrl?.trim();
      // 中文注释：内部拖拽若携带相对路径，则直接按引用上传。
      if (sourceUrl && isRelativePath(sourceUrl)) {
        formData.append("file", sourceUrl);
      } else {
        formData.append("file", input.file);
      }
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
            errorMessage: errorText || t('image.uploadFailed'),
          };
        }
        const data = (await res.json()) as {
          url?: string;
          mediaType?: string;
        };
        if (!data?.url) {
          return {
            ok: false as const,
            errorMessage: t('image.noServerUrl'),
          };
        }
        return {
          ok: true as const,
          url: data.url,
          mediaType: data.mediaType ?? input.file.type,
        };
      } catch {
        return { ok: false as const, errorMessage: t('image.networkError') };
      }
    },
    [effectiveSessionId, projectId, t]
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
          errorMessage: t('image.fileTooLarge', {
            size: formatFileSize(file.size),
            max: formatFileSize(CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES),
          }),
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
    // 系统文件（hasFiles）现在通过 /chat/files 端点统一处理，无需 deny。
    // 非图片文件引用统一以 @{path} mention 插入，不依赖 canAttachAll。
    const shouldDeny = wantsImage && !canAttachImage && !hasFiles;
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
  }, [canAttachImage]);

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
    // 非图片文件引用统一以 @{path} mention 插入，不依赖 canAttachAll。
    const shouldDeny = wantsImage && !canAttachImage && !hasFiles;
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
  }, [canAttachImage]);

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
          // 非图片文件统一以 @{path} mention 插入，不依赖 canAttachAll。
          const resolvedFileRef =
            fileRef || (isRelativePath(imagePayload.baseUri) ? imagePayload.baseUri : "");
          if (resolvedFileRef && isRelativePath(resolvedFileRef)) {
            window.dispatchEvent(
              new CustomEvent("openloaf:chat-insert-mention", {
                detail: { value: resolvedFileRef },
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
      // Electron 原生拖拽回落：检查 projectFileDragSession，将文件作为 mention 插入。
      const session = matchProjectFileDragSession(event.dataTransfer);
      if (session && session.fileRefs.length > 0) {
        event.preventDefault();
        dragCounterRef.current = 0;
        setIsDragActive(false);
        setDragMode("allow");
        for (const ref of session.fileRefs) {
          window.dispatchEvent(
            new CustomEvent("openloaf:chat-insert-mention", {
              detail: { value: ref },
            })
          );
        }
        clearProjectFileDragSession("chat-root-drop");
        return;
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
      window.dispatchEvent(
        new CustomEvent("openloaf:chat-insert-mention", {
          detail: { value: fileRef },
        })
      );
    },
    [addAttachments, addMaskedAttachment, canAttachImage, projectId]
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
          projectId={projectId}
          {...sharedInputProps}
          handleDragEnter={handleDragEnter}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          enableMultiSession={enableMultiSession}
        />
      ) : (
        <div
          className="relative flex flex-1 w-full flex-col min-h-0 min-w-0"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <ChatHeader
            onNewSession={onNewSession}
            onCloseSession={onCloseSession}
            iconPalette="email"
            enableMultiSession={enableMultiSession}
          />
          <MessageList className="flex-1 min-h-0" projectId={projectId} />
          <RecentSessionsBar />
          <ChatInput
            className="mx-2 mb-2"
            {...sharedInputProps}
          />
        </div>
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
              ? t('drag.denyImage')
              : t('drag.denyFile')
            : dragHint === "image"
              ? t('drag.allowImage')
              : t('drag.allowFile')
        }
        variant={dragMode === "deny" ? "warning" : "default"}
        radiusClassName="rounded-2xl"
        description={
          dragMode === "deny" ? (
            dragHint === "image"
              ? t('drag.denyImageDesc')
              : t('drag.denyFileDesc')
          ) : dragHint === "image" ? (
            t('drag.allowImageDesc', { max: formatFileSize(CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES) })
          ) : (
            t('drag.allowFileDesc')
          )
        }
      />
    </div>
  );
}
