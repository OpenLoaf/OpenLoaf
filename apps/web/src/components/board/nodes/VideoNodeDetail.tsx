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
  const sizeLabel =
    naturalWidth && naturalHeight ? `${naturalWidth} x ${naturalHeight}` : "";
  const durationLabel = typeof duration === "number" ? `${duration.toFixed(1)}s` : "";
  const hasMeta = Boolean(sizeLabel || durationLabel);

  return (
    <div
      className={cn(
        "relative h-[96px] w-[360px] rounded-xl border border-border bg-card shadow-lg",
        className
      )}
    >
      <div className="flex h-full flex-col gap-1 px-2 pt-2 pb-2">
        <div className="text-[11px] font-medium text-muted-foreground/80">视频文件</div>
        <div className="text-[13px] text-foreground truncate" title={name ?? path ?? ""}>
          {name ?? path ?? "未命名"}
        </div>
        <div className="text-[11px] text-muted-foreground truncate" title={path ?? ""}>
          {path ? `路径: ${path}` : "路径: -"}
        </div>
        {hasMeta ? (
          <div className="text-[11px] text-muted-foreground">
            {durationLabel ? `时长: ${durationLabel}` : null}
            {durationLabel && sizeLabel ? " · " : null}
            {sizeLabel ? `尺寸: ${sizeLabel}` : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
