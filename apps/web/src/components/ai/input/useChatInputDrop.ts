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

import { useCallback, useMemo } from "react";
import type { RefObject } from "react";
import {
  formatAttachmentTag,
  hasAttachmentTag,
} from "@openloaf/api/common";
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
  getProjectFileDragSession,
  matchProjectFileDragSession,
} from "@/lib/project-file-drag-session";
import {
  formatScopedProjectPath,
  parseScopedProjectPath,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { resolveProjectRootUri } from "@/lib/chat/mention-pointer";
import { createFileEntryFromUri, openFile } from "@/components/file/lib/open-file";
import { useProjects } from "@/hooks/use-projects";
import type { ChatAttachmentInput, MaskedAttachmentInput } from "./chat-attachments";
import type { ChatInputEditorHandle } from "./ChatInputEditor";

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

const isRelativePath = (value: string) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

interface UseChatInputDropOptions {
  editorHandleRef: RefObject<ChatInputEditorHandle | null>;
  onChange: (value: string) => void;
  valueRef: RefObject<string>;
  defaultProjectId?: string;
  tabId?: string;
  canAttachAll: boolean;
  canAttachImage: boolean;
  onAddAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  onAddMaskedAttachment?: (input: MaskedAttachmentInput) => void;
  uploadFileToSession?: (file: File) => Promise<string | null>;
}

export function useChatInputDrop({
  editorHandleRef,
  onChange,
  valueRef,
  defaultProjectId,
  tabId,
  canAttachAll,
  canAttachImage,
  onAddAttachments,
  onAddMaskedAttachment,
  uploadFileToSession,
}: UseChatInputDropOptions) {
  const { data: projects = [] } = useProjects();

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
      if (/^<system-tag\s+type="attachment"\s+path="[^"]*"\s*\/>$/.test(rawText.trim())) {
        handle.insertMention(rawText.trim(), insertOpts);
        return;
      }
      // Plain text (no mention tokens) → insert as text
      if (!hasAttachmentTag(rawText)) {
        handle.insertText(rawText, insertOpts);
        return;
      }
      // Mixed content (rare): append to value and let sync re-render
      const current = valueRef.current;
      const leading = insertOpts.ensureLeadingSpace && current && !/\s$/.test(current) ? " " : "";
      const trailing = insertOpts.ensureTrailingSpace ? " " : "";
      const newValue = `${current}${leading}${rawText}${trailing}`;
      onChange(newValue);
      requestAnimationFrame(() => handle.focus("end"));
    },
    [editorHandleRef, onChange, valueRef],
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

  /** Normalize a file reference string to a scoped path. */
  const normalizeFileRef = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const tagMatch = trimmed.match(
      /^<system-tag\s+type="attachment"\s+path="([^"]*)"\s*\/>$/,
    );
    const normalized = tagMatch ? tagMatch[1] ?? "" : trimmed;
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
      insertTextAtSelection(formatAttachmentTag(normalizedRef), {
        skipFocus: options?.skipFocus,
        ensureLeadingSpace: true,
        ensureTrailingSpace: true,
      });
    },
    [insertTextAtSelection, normalizeFileRef],
  );

  /** Handle click on a mention chip — open file preview. */
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

  /** Insert file references using the same logic as drag-and-drop. */
  const handleProjectFileRefsInsert = useCallback(
    async (fileRefs: string[]) => {
      const mentionRefs: string[] = [];
      const normalizedRefs = Array.from(
        new Set(
          fileRefs
            .map((v) => normalizeFileRef(v))
            .filter(Boolean)
        )
      );
      for (const fileRef of normalizedRefs) {
        const match = fileRef.match(/^(.*?)(?::(\d+)-(\d+))?$/);
        const baseValue = match?.[1] ?? fileRef;
        const parsed = parseScopedProjectPath(baseValue);
        const pId = parsed?.projectId ?? defaultProjectId ?? "";
        const relativePath = parsed?.relativePath ?? "";
        if (!pId || !relativePath) continue;
        // 所有文件统一以 @[path] mention 插入（包括图片）。
        mentionRefs.push(fileRef);
      }
      if (mentionRefs.length > 0) {
        const mentionText = mentionRefs.map((item) => formatAttachmentTag(item)).join(" ");
        insertTextAtSelection(mentionText, {
          ensureLeadingSpace: true,
          ensureTrailingSpace: true,
        });
      }
    },
    [
      defaultProjectId,
      insertTextAtSelection,
      normalizeFileRef,
    ]
  );

  /** Handle file refs selected from the picker. */
  const handleSelectFileRefs = useCallback(
    (fileRefs: string[]) => {
      void handleProjectFileRefsInsert(fileRefs);
    },
    [handleProjectFileRefsInsert]
  );

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    console.debug("[ChatInput] drop payload", formatDragData(event.dataTransfer));
    // 优先级 1：projectFileDragSession — HTML5 拖拽不带真实文件，matchProjectFileDragSession
    // 匹配不到路径，因此也尝试 getProjectFileDragSession 作为回退。
    const session =
      matchProjectFileDragSession(event.dataTransfer) || getProjectFileDragSession();
    if (
      session &&
      session.fileRefs.length > 0
    ) {
      await handleProjectFileRefsInsert(session.fileRefs);
      clearProjectFileDragSession("chat-drop");
      return;
    }
    const imagePayload = readImageDragPayload(event.dataTransfer);
    if (imagePayload) {
      const payloadFileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
      const isPayloadImage = Boolean(imagePayload.maskUri) || isImageFileName(payloadFileName);
      // 非图片文件统一以 mention 插入，不受 canAttachAll 限制。
      if (!isPayloadImage) {
        const fileRef =
          normalizeFileRef(event.dataTransfer.getData(FILE_DRAG_REF_MIME)) ||
          (isRelativePath(imagePayload.baseUri) ? imagePayload.baseUri : "");
        if (fileRef) {
          await handleProjectFileRefsInsert([fileRef]);
        }
        return;
      }
      if (!canAttachImage) return;
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
      if (!uploadFileToSession) return;
      try {
        // 处理从消息中拖拽的图片，上传到 session 目录后以 @[path] mention 插入。
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
        const storedPath = await uploadFileToSession(file);
        if (storedPath) {
          insertTextAtSelection(formatAttachmentTag(storedPath), { ensureLeadingSpace: true, ensureTrailingSpace: true });
        }
      } catch {
        return;
      }
      return;
    }
    // 优先级 3：系统文件拖拽 — 上传到 session files 目录，插入 @[relative/path] mention
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      if (uploadFileToSession) {
        for (const file of files) {
          const storedPath = await uploadFileToSession(file);
          if (storedPath) {
            insertTextAtSelection(formatAttachmentTag(storedPath), { ensureLeadingSpace: true, ensureTrailingSpace: true });
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
    canAttachImage,
    defaultProjectId,
    handleProjectFileRefsInsert,
    insertTextAtSelection,
    normalizeFileRef,
    onAddAttachments,
    onAddMaskedAttachment,
    uploadFileToSession,
  ]);

  return {
    projects,
    insertTextAtSelection,
    defaultRootUri,
    handleChipClick,
    handleSelectFileRefs,
    handleDrop,
    normalizeFileRef,
    insertFileMention,
  };
}
