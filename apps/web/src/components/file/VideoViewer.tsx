"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VideoPlayer } from "@tenas-ai/ui/video-player";
import { StackHeader } from "@/components/layout/StackHeader";
import { useTabs } from "@/hooks/use-tabs";
import { resolveServerUrl } from "@/utils/server-url";
import { cn } from "@/lib/utils";
import {
  getRelativePathFromUri,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";

interface VideoViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  projectId?: string;
  rootUri?: string;
  thumbnailSrc?: string;
  width?: number;
  height?: number;
  /** Force the large layout to keep controls stable. */
  forceLargeLayout?: boolean;
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

/** Build a quality-specific HLS manifest URL for the backend endpoint. */
function buildQualityManifestUrl(input: { path: string; projectId?: string; quality: string }) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path: input.path, quality: input.quality });
  if (input.projectId) query.set("projectId", input.projectId);
  const prefix = baseUrl ? `${baseUrl}/media/hls/manifest` : "/media/hls/manifest";
  return `${prefix}?${query.toString()}`;
}

/** Build an HLS progress URL for the backend endpoint. */
function buildProgressUrl(input: { path: string; projectId?: string; quality: string }) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path: input.path, quality: input.quality });
  if (input.projectId) query.set("projectId", input.projectId);
  const prefix = baseUrl ? `${baseUrl}/media/hls/progress` : "/media/hls/progress";
  return `${prefix}?${query.toString()}`;
}

/** Build a VTT thumbnails URL for the backend endpoint. */
function buildThumbnailsUrl(input: { path: string; projectId?: string }) {
  const baseUrl = resolveServerUrl();
  const query = new URLSearchParams({ path: input.path });
  if (input.projectId) query.set("projectId", input.projectId);
  const prefix = baseUrl ? `${baseUrl}/media/hls/thumbnails` : "/media/hls/thumbnails";
  return `${prefix}?${query.toString()}`;
}

/** Render a video preview panel backed by HLS. */
export default function VideoViewer({
  uri,
  openUri,
  name,
  projectId: projectIdProp,
  rootUri,
  thumbnailSrc,
  width,
  height,
  forceLargeLayout,
  panelKey,
  tabId,
}: VideoViewerProps) {
  const removeStackItem = useTabs((state) => state.removeStackItem);
  const displayTitle = name ?? uri ?? "Video";
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [previewBackground, setPreviewBackground] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);

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

    const quality = "720p";
    const masterUrl = buildManifestUrl({
      path: relativePath,
      projectId: resolvedProjectId,
    });
    const qualityUrl = buildQualityManifestUrl({
      path: relativePath,
      projectId: resolvedProjectId,
      quality,
    });
    const prewarmUrls = [
      buildQualityManifestUrl({
        path: relativePath,
        projectId: resolvedProjectId,
        quality: "1080p",
      }),
      buildQualityManifestUrl({
        path: relativePath,
        projectId: resolvedProjectId,
        quality: "source",
      }),
    ];
    return {
      // 逻辑：播放器使用 master 清单以支持分辨率切换。
      url: masterUrl,
      // 逻辑：仍用默认分辨率轮询转码完成，避免 HLS 读取到 202。
      buildUrl: qualityUrl,
      // 逻辑：后台预热其他清晰度，避免切换时阻塞。
      prewarmUrls,
      progress: buildProgressUrl({
        path: relativePath,
        projectId: resolvedProjectId,
        quality,
      }),
      thumbnails: buildThumbnailsUrl({ path: relativePath, projectId: resolvedProjectId }),
      quality,
      projectId: resolvedProjectId,
      relativePath,
    };
  }, [projectIdProp, rootUri, uri]);

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

  useEffect(() => {
    if (width && height) {
      // 逻辑：优先使用视频元数据判断方向，避免缩略图比例误差。
      setIsPortrait(height >= width);
      return;
    }
    const posterSource = thumbnailSrc ?? previewBackground;
    if (!posterSource) {
      setIsPortrait(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = posterSource;
    const resolveOrientation = () => {
      if (cancelled) return;
      const naturalWidth = image.naturalWidth || 1;
      const naturalHeight = image.naturalHeight || 1;
      // 逻辑：根据缩略图比例推断横竖屏，决定播放器撑满方向。
      setIsPortrait(naturalHeight >= naturalWidth);
    };
    if (image.decode) {
      image
        .decode()
        .then(resolveOrientation)
        .catch(() => {
          if (cancelled) return;
          setIsPortrait(null);
        });
    } else {
      image.onload = resolveOrientation;
      image.onerror = () => {
        if (cancelled) return;
        setIsPortrait(null);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [height, previewBackground, thumbnailSrc, width]);

  useEffect(() => {
    const wrapper = playerWrapperRef.current;
    if (!wrapper) return;
    const applySizing = () => {
      const video = wrapper.querySelector("video");
      if (!video) return;
      if (isPortrait === null) {
        video.style.setProperty("width", "100%", "important");
        video.style.setProperty("height", "100%", "important");
        return;
      }
      if (isPortrait) {
        // 逻辑：竖屏视频高度撑满，宽度自适应。
        video.style.setProperty("height", "100%", "important");
        video.style.setProperty("width", "auto", "important");
        return;
      }
      // 逻辑：横屏视频宽度撑满，高度自适应。
      video.style.setProperty("width", "100%", "important");
      video.style.setProperty("height", "auto", "important");
    };
    applySizing();
    const raf = requestAnimationFrame(applySizing);
    const observer = new MutationObserver(() => {
      // 逻辑：播放器内部 DOM 变动时重新注入尺寸样式，覆盖全局 video 规则。
      applySizing();
    });
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [isPortrait, playbackUrl]);

  useEffect(() => {
    if (!isBuilding || !manifest?.progress) {
      return;
    }
    let cancelled = false;
    const pollProgress = async () => {
      try {
        const response = await fetch(manifest.progress, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { percent?: number; status?: string };
        if (cancelled) return;
        if (typeof payload.percent === "number") {
          setBuildProgress(Math.floor(payload.percent));
        }
      } catch {
        // 逻辑：进度请求失败时保持已有百分比。
      }
    };
    pollProgress();
    const timer = setInterval(pollProgress, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isBuilding, manifest?.progress]);

  useEffect(() => {
    if (!manifest?.url || !manifest?.buildUrl) {
      setPlaybackUrl(null);
      setIsBuilding(false);
      setBuildError(null);
      setBuildProgress(0);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setBuildProgress(0);
    const pollManifest = async () => {
      try {
        const response = await fetch(manifest.buildUrl, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 200) {
          setPlaybackUrl(manifest.url);
          setIsBuilding(false);
          setBuildError(null);
          setBuildProgress(100);
          // 逻辑：触发其他清晰度转码，提升后续切换成功率。
          manifest.prewarmUrls?.forEach((url) => {
            void fetch(url, { cache: "no-store" }).catch(() => {
              // 逻辑：预热失败不影响当前播放。
            });
          });
          return;
        }
        if (response.status === 202) {
          // 逻辑：转码中继续轮询，避免 hls.js 读取到 202。
          setPlaybackUrl(null);
          setIsBuilding(true);
          timer = setTimeout(pollManifest, 1500);
          return;
        }
        setPlaybackUrl(null);
        setIsBuilding(false);
        setBuildError(`Manifest error: ${response.status}`);
      } catch (error) {
        if (cancelled) return;
        setPlaybackUrl(null);
        setIsBuilding(false);
        setBuildError("Manifest request failed");
      }
    };
    pollManifest();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [manifest?.buildUrl, manifest?.url]);

  const canClose = Boolean(tabId && panelKey);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择视频</div>;
  }

  if (!manifest?.url || !manifest?.buildUrl) {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">
        无法解析视频路径
      </div>
    );
  }

  if (buildError) {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">
        无法加载视频：{buildError}
      </div>
    );
  }

  if (!playbackUrl) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg">
        {previewBackground ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${previewBackground})` }}
          />
        ) : null}
        <div className="absolute inset-0 bg-background/70" />
        <div className="relative z-10 flex h-full w-full items-center justify-center p-6">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-background/90 px-5 py-4 text-foreground shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isBuilding ? "视频转码中" : "正在准备视频"}
              </span>
              <span className="tabular-nums">{isBuilding ? buildProgress : 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-foreground/80 transition-[width] duration-700"
                style={{ width: `${isBuilding ? buildProgress : 0}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {isBuilding ? "首次打开会进行转码，请稍候..." : "正在准备播放器..."}
            </div>
          </div>
        </div>
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
        <div
          ref={playerWrapperRef}
          className="relative flex h-full w-full items-center justify-center rounded-lg bg-muted/40"
        >
          <VideoPlayer
            src={playbackUrl}
            poster={thumbnailSrc ?? previewBackground ?? undefined}
            thumbnails={manifest.thumbnails}
            title={displayTitle}
            smallLayoutWhen={forceLargeLayout ? false : undefined}
            className={cn(
              "max-h-full max-w-full rounded-lg bg-black",
              isPortrait === null
                ? "h-full w-full [&_video]:h-full [&_video]:w-full"
                : isPortrait
                  ? "h-full w-auto [&_video]:h-full [&_video]:w-auto"
                  : "w-full h-auto [&_video]:w-full [&_video]:h-auto"
            )}
            controls
          />
        </div>
      </div>
    </div>
  );
}
