"use client";

import { useMemo, useState } from "react";
import { StackHeader } from "@/components/layout/StackHeader";
import { useTabs } from "@/hooks/use-tabs";
import { resolveServerUrl } from "@/utils/server-url";
import {
  getRelativePathFromUri,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import VideoPlayer from "@/components/file/VideoPlayer";

interface VideoViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  projectId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

/** Build an HLS manifest URL for the backend endpoint. */
function buildManifestUrl(input: { path: string; projectId?: string }) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path: input.path });
  if (input.projectId) query.set("projectId", input.projectId);
  const prefix = baseUrl ? `${baseUrl}/media/hls/manifest` : "/media/hls/manifest";
  return `${prefix}?${query.toString()}`;
}

/** Render a video preview panel backed by HLS. */
export default function VideoViewer({
  uri,
  openUri,
  name,
  projectId: projectIdProp,
  rootUri,
  panelKey,
  tabId,
}: VideoViewerProps) {
  const [error, setError] = useState<string | null>(null);
  const removeStackItem = useTabs((state) => state.removeStackItem);
  const displayTitle = name ?? uri ?? "Video";
  const shouldRenderStackHeader = Boolean(tabId && panelKey);

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
        resolvedProjectId = resolvedProjectId ?? parsed.projectId;
      } else {
        relativePath = normalizeProjectRelativePath(trimmed);
      }
    }

    if (!relativePath) return null;

    return {
      url: buildManifestUrl({ path: relativePath, projectId: resolvedProjectId }),
      projectId: resolvedProjectId,
      relativePath,
    };
  }, [projectIdProp, rootUri, uri]);

  const canClose = Boolean(tabId && panelKey);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择视频</div>;
  }

  if (!manifest?.url) {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">
        无法解析视频路径
      </div>
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
                  removeStackItem(tabId!, panelKey!);
                }
              : undefined
          }
          canClose={canClose}
        />
      ) : null}
      <div className="flex-1 p-4">
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted/40">
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <VideoPlayer
              src={manifest.url}
              className="h-full w-full rounded-lg bg-black"
              controls
              onError={() => setError("视频加载失败")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
