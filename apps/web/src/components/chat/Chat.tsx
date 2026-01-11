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
import type {
  ChatAttachment,
  ChatAttachmentInput,
  ChatAttachmentSource,
  MaskedAttachmentInput,
} from "./chat-attachments";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import { buildMaskedPreviewUrl, resolveMaskFileName } from "@/lib/image/mask";
import { readImageDragPayload } from "@/lib/image/drag";
import {
  FILE_DRAG_NAME_MIME,
  FILE_DRAG_IMAGE_MIME,
  FILE_DRAG_REF_MIME,
  FILE_DRAG_URI_MIME,
} from "@/components/ui/tenas/drag-drop-types";
import { parseTenasFileUrl } from "@/components/project/filesystem/utils/file-system-utils";
import { DragDropOverlay } from "@/components/ui/tenas/drag-drop-overlay";
import { useTabs } from "@/hooks/use-tabs";
import { resolveServerUrl } from "@/utils/server-url";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import {
  supportsCode,
  supportsImageEdit,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

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

/** Image filename matcher. */
const IMAGE_FILE_NAME_REGEX = /\.(png|jpe?g|gif|bmp|webp|svg|avif|tiff|heic)$/i;

/** Check whether a file ref or name targets an image. */
function isImageFileRef(fileRef: string) {
  const match = fileRef.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? fileRef;
  const name = baseValue.split("/").pop() ?? "";
  return IMAGE_FILE_NAME_REGEX.test(name);
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
function resolveTenasDragRef(dataTransfer: DataTransfer) {
  const hasUri = dataTransfer.types.includes(FILE_DRAG_URI_MIME);
  const hasRef = dataTransfer.types.includes(FILE_DRAG_REF_MIME);
  if (!hasUri && !hasRef) return "";
  return dataTransfer.getData(FILE_DRAG_REF_MIME) || "";
}

/** Read the file name from an internal drag payload. */
function resolveTenasDragName(dataTransfer: DataTransfer) {
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
  const isCodeModel = supportsCode(selectedModel);
  const canAttachAll =
    isAutoModel || supportsToolCall(selectedModel) || isCodeModel;
  // 自动模式或支持图片输入/编辑时允许图片附件；工具调用仅在非代码模型时放开图片。
  const canAttachImage =
    isAutoModel ||
    supportsImageInput(selectedModel) ||
    supportsImageEdit(selectedModel) ||
    (supportsToolCall(selectedModel) && !isCodeModel);

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
      // 上传后端生成 tenas-file 地址，后续仅存该引用。
      const formData = new FormData();
      const sourceUrl = input.sourceUrl?.trim();
      // 中文注释：内部拖拽若携带 tenas-file，则直接按引用上传。
      if (sourceUrl && sourceUrl.startsWith("tenas-file://")) {
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
    const hasTenasRef =
      event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
    const hasTenasUri =
      event.dataTransfer?.types?.includes(FILE_DRAG_URI_MIME) ?? false;
    const hasTenasImage =
      event.dataTransfer?.types?.includes(FILE_DRAG_IMAGE_MIME) ?? false;
    if (!hasFiles && !hasTenasRef && !hasTenasUri) return;
    const fileRef = resolveTenasDragRef(event.dataTransfer);
    const fileName = resolveTenasDragName(event.dataTransfer);
    const hasImageUpload = hasFiles && hasImageFileUpload(event.dataTransfer);
    const isFileRefImage =
      hasTenasImage ||
      (Boolean(fileRef || fileName) && isImageFileRef(fileRef || fileName));
    const wantsImage = hasImageUpload || hasTenasImage || isFileRefImage;
    const shouldDeny =
      (wantsImage && !canAttachImage) ||
      ((hasTenasRef || hasTenasUri) && !canAttachAll) ||
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
    const hasTenasRef =
      event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
    const hasTenasUri =
      event.dataTransfer?.types?.includes(FILE_DRAG_URI_MIME) ?? false;
    const hasTenasImage =
      event.dataTransfer?.types?.includes(FILE_DRAG_IMAGE_MIME) ?? false;
    if (!hasFiles && !hasTenasRef && !hasTenasUri) return;
    const fileRef = resolveTenasDragRef(event.dataTransfer);
    const fileName = resolveTenasDragName(event.dataTransfer);
    const hasImageUpload = hasFiles && hasImageFileUpload(event.dataTransfer);
    const isFileRefImage =
      hasTenasImage ||
      (Boolean(fileRef || fileName) && isImageFileRef(fileRef || fileName));
    const wantsImage = hasImageUpload || hasTenasImage || isFileRefImage;
    const shouldDeny =
      (wantsImage && !canAttachImage) ||
      ((hasTenasRef || hasTenasUri) && !canAttachAll) ||
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
    const hasTenasRef =
      event.dataTransfer?.types?.includes(FILE_DRAG_REF_MIME) ?? false;
    const hasTenasUri =
      event.dataTransfer?.types?.includes(FILE_DRAG_URI_MIME) ?? false;
    if (!hasFiles && !hasTenasRef && !hasTenasUri) return;
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
          fileUri: event.dataTransfer?.getData("application/x-tenas-file-uri"),
          fileName: event.dataTransfer?.getData("application/x-tenas-file-name"),
          fileMaskUri: event.dataTransfer?.getData("application/x-tenas-file-mask-uri"),
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
            fileRef ||
            (() => {
              if (!imagePayload.baseUri.startsWith("tenas-file://")) return "";
              const parsed = parseTenasFileUrl(imagePayload.baseUri);
              return parsed ? `${parsed.projectId}/${parsed.relativePath}` : "";
            })();
          if (resolvedFileRef) {
            window.dispatchEvent(
              new CustomEvent("tenas:chat-insert-mention", {
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
            const baseBlob = await fetchBlobFromUri(imagePayload.baseUri);
            const maskBlob = await fetchBlobFromUri(imagePayload.maskUri);
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
          const blob = await fetchBlobFromUri(imagePayload.baseUri);
          const file = new File([blob], fileName, {
            type: blob.type || "application/octet-stream",
          });
          const sourceUrl = imagePayload.baseUri.startsWith("tenas-file://")
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
        new CustomEvent("tenas:chat-insert-mention", {
          detail: { value: fileRef },
        })
      );
    },
    [addAttachments, addMaskedAttachment, canAttachAll, canAttachImage]
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
        data-tenas-chat-root
        data-tab-id={tabId}
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
          onReplaceMaskedAttachment={replaceMaskedAttachment}
          canAttachAll={canAttachAll}
          canAttachImage={canAttachImage}
          onDropHandled={resetDragState}
        />

        <div
          data-tenas-chat-mask
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
    </ChatProvider>
  );
}
