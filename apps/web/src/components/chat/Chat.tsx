"use client";

import { cn } from "@/lib/utils";
import ChatProvider from "./ChatProvider";
import MessageList from "./message/MessageList";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";
import { generateId } from "ai";
import * as React from "react";
import {
  CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  formatFileSize,
  isSupportedImageFile,
} from "./chat-attachments";
import type { ChatAttachment, MaskedAttachmentInput } from "./chat-attachments";
import { DragDropOverlay } from "@/components/ui/teatime/drag-drop-overlay";
import { useTabs } from "@/hooks/use-tabs";
import { resolveServerUrl } from "@/utils/server-url";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { createChatSessionId } from "@/lib/chat-session-id";

type ChatProps = {
  className?: string;
  panelKey?: string;
  tabId?: string;
  sessionId?: string;
  loadHistory?: boolean;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean }
  ) => void;
} & Record<string, unknown>;

export function Chat({
  className,
  panelKey: _panelKey,
  tabId,
  sessionId,
  loadHistory,
  onSessionChange,
  ...params
}: ChatProps) {
  const rawParams = React.useMemo(() => ({ ...params }), [params]);
  const tab = useTabs((s) => (tabId ? s.getTabById(tabId) : undefined));
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
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels],
  );
  const rawSelectedModelId =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId.trim()
      : "";
  // 模型不存在时回退为 Auto，避免透传无效 modelId。
  const selectedModel = modelOptions.find((option) => option.id === rawSelectedModelId);
  const selectedModelId = selectedModel ? rawSelectedModelId : "";
  const isAutoModel = !selectedModelId;
  // 自动模式允许图片，非自动时必须显式支持图片编辑。
  const canAttachImage = isAutoModel
    ? true
    : Boolean(selectedModel?.tags?.includes("image_edit"));

  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [dragMode, setDragMode] = React.useState<"allow" | "deny">("allow");

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
    async (file: File) => {
      if (!workspaceId) {
        return { ok: false as const, errorMessage: "当前标签页未绑定工作区，无法上传图片" };
      }
      // 上传后端生成 teatime-file 地址，后续仅存该引用。
      const formData = new FormData();
      formData.append("file", file);
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
          mediaType: data.mediaType ?? file.type,
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
      const result = await uploadFile(attachment.file);
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
      const result = await uploadFile(maskFile);
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

  const resolveMaskFileName = React.useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/");
      const fileName = decodeURIComponent(segments[segments.length - 1] || "");
      const baseName = fileName.replace(/\.[a-zA-Z0-9]+$/, "");
      return baseName ? `${baseName}_mask.png` : "mask.png";
    } catch {
      return "mask.png";
    }
  }, []);

  /** Add normal attachments from files. */
  const addAttachments = React.useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const next: ChatAttachment[] = [];
    for (const file of fileArray) {
      if (!isSupportedImageFile(file)) {
        continue;
      }
      if (file.size > CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
        const objectUrl = URL.createObjectURL(file);
        next.push({
          id: generateId(),
          file,
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
  }, [uploadAttachment]);

  /** Add a masked attachment and trigger uploads. */
  const addMaskedAttachment = React.useCallback(
    (input: MaskedAttachmentInput) => {
      const previewUrl = input.previewUrl || URL.createObjectURL(input.file);
      const nextAttachment: ChatAttachment = {
        id: generateId(),
        file: input.file,
        objectUrl: previewUrl,
        status: "loading",
        mask: {
          file: input.maskFile,
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
        const maskFileName = resolveMaskFileName(imageResult.url);
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

  const handleDragEnter = React.useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    if (!canAttachImage) {
      event.preventDefault();
      setIsDragActive(true);
      setDragMode("deny");
      return;
    }
    dragCounterRef.current += 1;
    setIsDragActive(true);
    setDragMode("allow");
  }, [canAttachImage]);

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    if (!canAttachImage) {
      event.preventDefault();
      setIsDragActive(true);
      setDragMode("deny");
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
    setDragMode("allow");
  }, [canAttachImage]);

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    if (!canAttachImage) {
      setIsDragActive(false);
      setDragMode("allow");
      return;
    }
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
      setDragMode("allow");
    }
  }, [canAttachImage]);

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      if (!canAttachImage) {
        setDragMode("allow");
        return;
      }
      setDragMode("allow");
      addAttachments(event.dataTransfer.files);
    },
    [addAttachments, canAttachImage]
  );

  return (
    <ChatProvider
      tabId={tabId}
      sessionId={effectiveSessionId}
      loadHistory={effectiveLoadHistory}
      chatModelId={selectedModelId || null}
      chatModelSource={chatModelSource}
      params={requestParams}
      onSessionChange={onSessionChange}
      addAttachments={addAttachments}
      addMaskedAttachment={addMaskedAttachment}
    >
      <div
        ref={rootRef}
        className={cn(
          "relative flex h-full w-full flex-col min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden",
          className
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ChatHeader />
        <MessageList className="flex-1 min-h-0" />
        <ChatInput
          className="mx-2 mb-2"
          attachments={attachments}
          onAddAttachments={addAttachments}
          onRemoveAttachment={removeAttachment}
          onClearAttachments={clearAttachments}
        />

        <DragDropOverlay
          open={isDragActive}
          title={dragMode === "deny" ? "当前模型不支持图片" : "松开鼠标即可添加图片"}
          variant={dragMode === "deny" ? "warning" : "default"}
          radiusClassName="rounded-2xl"
          description={dragMode === "deny" ? "请切换到支持图片输入的模型" : (
            <>
              支持 PNG / JPEG / WebP，单文件不超过{" "}
              {formatFileSize(CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES)}，可多选
            </>
          )}
        />
      </div>
    </ChatProvider>
  );
}
