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

import { useEffect, useMemo, useState } from "react";
import { VideoPlayer } from "@openloaf/ui/video-player";
import { StackHeader } from "@/components/layout/StackHeader";
import { useLayoutState } from "@/hooks/use-layout-state";
import { resolveServerUrl } from "@/utils/server-url";
import {
  getRelativePathFromUri,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";

interface VideoViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  projectId?: string;
  rootUri?: string;
  /** Board id for resolving board-relative assets on the server. */
  boardId?: string;
  thumbnailSrc?: string;
  /** Force the large layout to keep controls stable. */
  forceLargeLayout?: boolean;
  /** Clip start time in seconds. */
  clipStart?: number;
  /** Clip end time in seconds. */
  clipEnd?: number;
  panelKey?: string;
  tabId?: string;
}

type StreamUrlInput = { path: string; projectId?: string; boardId?: string };

/** Build a direct stream URL for video playback. */
function buildStreamUrl(input: StreamUrlInput) {
  const baseUrl = resolveServerUrl();
  const prefix = baseUrl ? `${baseUrl}/media/stream` : "/media/stream";
  if (input.boardId) {
    const query = new URLSearchParams({ boardId: input.boardId, file: input.path });
    if (input.projectId) query.set("projectId", input.projectId);
    return `${prefix}?${query.toString()}`;
  }
  const query = new URLSearchParams({ path: input.path });
  if (input.projectId) query.set("projectId", input.projectId);
  return `${prefix}?${query.toString()}`;
}

/** Build a VTT thumbnails URL for the backend endpoint. */
function buildThumbnailsUrl(input: StreamUrlInput) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path: input.path });
  if (input.projectId) query.set("projectId", input.projectId);
  if (input.boardId) query.set("boardId", input.boardId);
  const prefix = baseUrl ? `${baseUrl}/media/thumbnails` : "/media/thumbnails";
  return `${prefix}?${query.toString()}`;
}

/** Render a video preview panel backed by HLS. */
export default function VideoViewer({
  uri,
  openUri,
  name,
  projectId: projectIdProp,
  rootUri,
  boardId: boardIdProp,
  thumbnailSrc,
  forceLargeLayout,
  clipStart: clipStartProp,
  clipEnd: clipEndProp,
  panelKey,
  tabId,
}: VideoViewerProps) {
  const removeStackItem = useLayoutState((state) => state.removeStackItem);
  const displayTitle = name ?? "";
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  const shouldRenderInlineHeader = Boolean(!shouldRenderStackHeader && displayTitle);
  const [previewBackground, setPreviewBackground] = useState<string | null>(null);

  const manifest = useMemo(() => {
    if (!uri) return null;
    const trimmed = uri.trim();
    if (!trimmed) return null;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    let resolvedProjectId = projectIdProp;
    let relativePath = "";

    if (hasScheme) {
      // 逻辑：URI 带 scheme 时尝试从 rootUri 解析相对路径。
      relativePath = rootUri ? getRelativePathFromUri(rootUri, trimmed) : "";
    } else {
      const parsed = parseScopedProjectPath(trimmed);
      if (parsed) {
        relativePath = parsed.relativePath;
        // 逻辑：路径包含项目范围时优先使用路径中的 projectId。
        resolvedProjectId = parsed.projectId ?? resolvedProjectId;
      } else {
        relativePath = normalizeProjectRelativePath(trimmed);
      }
    }

    if (!relativePath) return null;

    const ids = {
      projectId: resolvedProjectId,
      boardId: boardIdProp || undefined,
    };
    return {
      url: buildStreamUrl({ path: relativePath, ...ids }),
      thumbnails: buildThumbnailsUrl({ path: relativePath, ...ids }),
      projectId: resolvedProjectId,
      relativePath,
    };
  }, [boardIdProp, projectIdProp, rootUri, uri]);

  useEffect(() => {
    if (thumbnailSrc) {
      // 逻辑：已有列表缩略图时直接用作背景，避免重复解析 VTT。
      setPreviewBackground(thumbnailSrc);
      return;
    }
    if (!manifest?.thumbnails) {
      setPreviewBackground(null);
      return;
    }
    let cancelled = false;
    const resolveFirstThumbnail = async () => {
      try {
        const response = await fetch(manifest.thumbnails, { cache: "no-store" });
        if (!response.ok) return;
        const text = await response.text();
        if (cancelled) return;
        const first = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(
            (line) => line && line !== "WEBVTT" && !line.startsWith("#") && !line.includes("-->")
          );
        if (first) {
          // 逻辑：优先使用首张缩略图作为转码中的背景。
          const resolved = new URL(first, manifest.thumbnails).toString();
          setPreviewBackground(resolved);
        }
      } catch {
        // 逻辑：缩略图获取失败时不阻塞主流程。
      }
    };
    resolveFirstThumbnail();
    return () => {
      cancelled = true;
    };
  }, [manifest?.thumbnails, thumbnailSrc]);

  const canClose = Boolean(tabId && panelKey);

  const videoError = !uri ? false : Boolean(uri) && !manifest?.url;

  if (!uri || videoError) {
    return (
      <ViewerGuard
        uri={uri}
        name={name}
        projectId={projectIdProp}
        rootUri={rootUri}
        error={videoError}
        errorMessage="无法解析视频路径"
        errorDescription="请检查文件路径或格式后重试。"
      >
        {null}
      </ViewerGuard>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={displayTitle}
          openUri={openUri}
          openRootUri={rootUri}
          onClose={
            canClose
              ? () => {
                  removeStackItem(panelKey!);
                }
              : undefined
          }
          canClose={canClose}
        />
      ) : null}
      {shouldRenderInlineHeader ? (
        <div className="flex h-12 items-center border-b border-border/60 bg-background px-4">
          <div className="truncate text-sm font-medium text-foreground">
            {displayTitle}
          </div>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <VideoPlayer
          src={manifest?.url ?? null}
          poster={thumbnailSrc ?? previewBackground ?? undefined}
          thumbnails={manifest?.thumbnails}
          title={displayTitle}
          clipStartTime={clipStartProp}
          clipEndTime={clipEndProp && clipEndProp > 0 ? clipEndProp : undefined}
          smallLayoutWhen={forceLargeLayout ? false : undefined}
          className="h-full w-full rounded-3xl bg-black"
          controls
        />
      </div>
    </div>
  );
}
