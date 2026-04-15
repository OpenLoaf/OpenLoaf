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

import { useMemo } from "react";
import { StackHeader } from "@/components/layout/StackHeader";
import { useLayoutState } from "@/hooks/use-layout-state";
import { resolveServerUrl } from "@/utils/server-url";
import {
  getRelativePathFromUri,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";

interface AudioViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  /** Chat session id — required when uri contains ${CURRENT_CHAT_DIR} template. */
  sessionId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

type StreamUrlInput = {
  path: string;
  projectId?: string;
  sessionId?: string;
};

/** Build a direct stream URL for audio playback. */
function buildStreamUrl(input: StreamUrlInput) {
  const baseUrl = resolveServerUrl();
  const prefix = baseUrl ? `${baseUrl}/media/stream` : "/media/stream";
  const query = new URLSearchParams({ path: input.path });
  if (input.projectId) query.set("projectId", input.projectId);
  if (input.sessionId) query.set("sessionId", input.sessionId);
  return `${prefix}?${query.toString()}`;
}

/** Render an audio preview panel with a minimalist player. */
export default function AudioViewer({
  uri,
  openUri,
  name,
  projectId: projectIdProp,
  sessionId,
  rootUri,
  panelKey,
  tabId,
}: AudioViewerProps) {
  const removeStackItem = useLayoutState((state) => state.removeStackItem);
  const displayTitle = name ?? "";
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  const shouldRenderInlineHeader = Boolean(!shouldRenderStackHeader && displayTitle);

  const manifest = useMemo(() => {
    if (!uri) return null;
    const trimmed = uri.trim();
    if (!trimmed) return null;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    let resolvedProjectId = projectIdProp;
    let relativePath = "";
    // ${CURRENT_CHAT_DIR}/... 原样传给服务端，由 sessionId 展开。
    const isSessionTemplate = trimmed.includes("${CURRENT_CHAT_DIR}");

    if (isSessionTemplate) {
      relativePath = trimmed;
    } else if (hasScheme) {
      relativePath = rootUri ? getRelativePathFromUri(rootUri, trimmed) : "";
    } else {
      const parsed = parseScopedProjectPath(trimmed);
      if (parsed) {
        relativePath = parsed.relativePath;
        resolvedProjectId = parsed.projectId ?? resolvedProjectId;
      } else {
        relativePath = normalizeProjectRelativePath(trimmed);
      }
    }

    if (!relativePath) return null;

    return {
      url: buildStreamUrl({
        path: relativePath,
        projectId: resolvedProjectId,
        sessionId: isSessionTemplate ? sessionId : undefined,
      }),
    };
  }, [projectIdProp, rootUri, sessionId, uri]);

  const canClose = Boolean(tabId && panelKey);
  const audioError = !uri ? false : Boolean(uri) && !manifest?.url;

  if (!uri || audioError) {
    return (
      <ViewerGuard
        uri={uri}
        name={name}
        projectId={projectIdProp}
        rootUri={rootUri}
        error={audioError}
        errorMessage="音频加载失败"
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
          <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/90 p-6">
        <div className="w-full max-w-xl rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur">
          {displayTitle ? (
            <div className="mb-4 truncate text-center text-sm font-medium text-white/90">
              {displayTitle}
            </div>
          ) : null}
          <audio
            controls
            preload="metadata"
            className="w-full"
            src={manifest?.url ?? undefined}
          >
            <track kind="captions" />
          </audio>
        </div>
      </div>
    </div>
  );
}
