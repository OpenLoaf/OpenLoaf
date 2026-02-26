/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import * as React from "react";
import { normalizeUrl } from "@/components/browser/browser-utils";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { cn } from "@/lib/utils";
import type { DesktopWidgetItem } from "../types";

type WebStackWidgetProps = {
  item: DesktopWidgetItem;
  projectId?: string;
  workspaceId?: string;
  onOpen?: () => void;
};

/** Render a web stack widget with size-based variants. */
export default function WebStackWidget({
  item,
  projectId,
  workspaceId,
  onOpen,
}: WebStackWidgetProps) {
  const normalizedUrl = normalizeUrl(item.webUrl ?? "");
  const displayTitle = item.title || item.webTitle || "";
  const description = item.webDescription || "";
  const logoSrc = item.webLogo
    ? getPreviewEndpoint(item.webLogo, { projectId, workspaceId })
    : "";
  const previewSrc = item.webPreview
    ? getPreviewEndpoint(item.webPreview, { projectId, workspaceId })
    : "";
  const isLoading = item.webMetaStatus === "loading";
  const [previewBuster, setPreviewBuster] = React.useState(0);
  const previousLoadingRef = React.useRef(isLoading);

  const handleLogoLoad = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      console.info("[WebStackWidget] favicon loaded", {
        id: item.id,
        url: normalizedUrl,
        webLogo: item.webLogo,
        logoSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    },
    [item.id, item.webLogo, logoSrc, normalizedUrl]
  );

  const handleLogoError = React.useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      console.warn("[WebStackWidget] favicon load failed", {
        id: item.id,
        url: normalizedUrl,
        webLogo: item.webLogo,
        logoSrc,
        currentSrc: img.currentSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    },
    [item.id, item.webLogo, logoSrc, normalizedUrl]
  );

  const layout = item.layout;
  const isMini = layout.w === 1 && layout.h === 1;
  const isTitleMode = layout.h === 1 && layout.w <= 4;
  const isPreviewMode = layout.h > 1;

  React.useEffect(() => {
    const wasLoading = previousLoadingRef.current;
    if (wasLoading && !isLoading && previewSrc) {
      // 更新完成后强制刷新预览图，避免缓存命中旧图
      setPreviewBuster(Date.now());
    }
    previousLoadingRef.current = isLoading;
  }, [isLoading, previewSrc]);

  React.useEffect(() => {
    if (!normalizedUrl) return;
    console.info("[WebStackWidget] favicon state", {
      id: item.id,
      url: normalizedUrl,
      webLogo: item.webLogo,
      logoSrc,
      webMetaStatus: item.webMetaStatus,
    });
    if (item.webMetaStatus === "ready" && !logoSrc) {
      console.warn("[WebStackWidget] favicon missing after ready", {
        id: item.id,
        url: normalizedUrl,
        webLogo: item.webLogo,
        webMetaStatus: item.webMetaStatus,
      });
    }
  }, [item.id, item.webLogo, item.webMetaStatus, logoSrc, normalizedUrl]);

  const previewSrcWithBust =
    previewSrc && previewBuster
      ? `${previewSrc}${previewSrc.includes("?") ? "&" : "?"}t=${previewBuster}`
      : previewSrc;

  const hostname = React.useMemo(() => {
    if (!normalizedUrl) return "";
    try {
      return new URL(normalizedUrl).hostname;
    } catch {
      return normalizedUrl;
    }
  }, [normalizedUrl]);

  const handleOpen = React.useCallback(() => {
    onOpen?.();
  }, [onOpen]);

  if (isMini) {
    return (
      <button
        type="button"
        className="relative flex h-full w-full flex-col items-center justify-center gap-1 p-2"
        onClick={handleOpen}
        disabled={!normalizedUrl}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={displayTitle}
            className="h-10 w-10 rounded-2xl object-cover"
            onLoad={handleLogoLoad}
            onError={handleLogoError}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-xs font-medium text-muted-foreground">
            {displayTitle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="line-clamp-1 text-xs font-medium text-foreground">{displayTitle}</div>
        {isLoading ? (
          <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            更新中
          </div>
        ) : null}
      </button>
    );
  }

  if (isTitleMode) {
    return (
      <button
        type="button"
        className="relative flex h-full w-full items-center gap-3 px-3 py-2 text-left"
        onClick={handleOpen}
        disabled={!normalizedUrl}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={displayTitle}
            className="h-9 w-9 rounded-xl object-cover"
            onLoad={handleLogoLoad}
            onError={handleLogoError}
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-xs font-medium text-muted-foreground">
            {displayTitle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
          <div className="truncate text-xs text-muted-foreground">
            {description || hostname}
          </div>
        </div>
        {isLoading ? (
          <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            更新中
          </div>
        ) : null}
      </button>
    );
  }

  if (isPreviewMode) {
    return (
      <button
        type="button"
        className="relative flex h-full w-full items-end overflow-hidden rounded-2xl"
        onClick={handleOpen}
        disabled={!normalizedUrl}
      >
        {previewSrc ? (
          <img
            src={previewSrcWithBust}
            alt={displayTitle}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted" />
        )}
        {isLoading ? (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            更新中
          </div>
        ) : null}
        <div className="relative z-10 w-full overflow-hidden rounded-b-2xl bg-background/80">
          <div className="absolute inset-px bg-background/60 backdrop-blur rounded-b-2xl" />
        <div className="relative flex w-full items-center gap-3 p-3 ">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={displayTitle}
              className="h-9 w-9 rounded-xl object-cover"
              onLoad={handleLogoLoad}
              onError={handleLogoError}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-xs font-medium text-muted-foreground">
              {displayTitle.slice(0, 1).toUpperCase()}
            </div>
          )}
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
              <div className="truncate text-xs text-muted-foreground">
                {description || hostname}
              </div>
            </div>
            <div
              className={cn(
                "rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-foreground",
                "shadow-sm"
              )}
            >
              打开网页
            </div>
          </div>
        </div>
      </button>
    );
  }

  return null;
}
