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

export type VideoNodeDetailProps = {
  /** Display name for the video file. */
  name?: string;
  /** Project-relative path for the video file. */
  path?: string;
  /** Optional duration in seconds. */
  duration?: number;
  /** Optional original width in pixels. */
  naturalWidth?: number;
  /** Optional original height in pixels. */
  naturalHeight?: number;
  /** Optional wrapper class name. */
  className?: string;
};

/** Render a readonly detail panel for video nodes. */
export function VideoNodeDetail({
  name,
  path,
  duration,
  naturalWidth,
  naturalHeight,
  className,
}: VideoNodeDetailProps) {
  const { t } = useTranslation('board');
  const sizeLabel =
    naturalWidth && naturalHeight ? `${naturalWidth} x ${naturalHeight}` : "";
  const durationLabel = typeof duration === "number" ? `${duration.toFixed(1)}s` : "";
  const hasMeta = Boolean(sizeLabel || durationLabel);

  return (
    <div
      className={cn(
        "relative h-[96px] w-[360px] rounded-lg border border-border bg-card shadow-sm",
        className
      )}
    >
      <div className="flex h-full flex-col gap-1 px-2 pt-2 pb-2">
        <div className="text-[11px] font-medium text-muted-foreground/80">{t('videoDetail.fileLabel')}</div>
        <div className="text-[13px] text-foreground truncate" title={name ?? path ?? ""}>
          {name ?? path ?? t('videoDetail.unnamed')}
        </div>
        <div className="text-[11px] text-muted-foreground truncate" title={path ?? ""}>
          {path ? t('videoDetail.pathValue', { path }) : t('videoDetail.pathEmpty')}
        </div>
        {hasMeta ? (
          <div className="text-[11px] text-muted-foreground">
            {durationLabel ? t('videoDetail.durationValue', { duration: durationLabel }) : null}
            {durationLabel && sizeLabel ? " · " : null}
            {sizeLabel ? t('videoDetail.sizeValue', { size: sizeLabel }) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
