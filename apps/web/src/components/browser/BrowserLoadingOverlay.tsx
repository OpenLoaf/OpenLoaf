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

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type BrowserLoadingOverlayDetails = {
  title?: string;
  url?: string;
  faviconUrl?: string;
  requestCount?: number;
  finishedCount?: number;
  failedCount?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
};

// 中文注释：从 URL 提取 hostname，用于兜底展示。
const getHostname = (url?: string) => {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

// 中文注释：格式化字节数为可读单位。
const formatBytes = (bytes?: number) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

// 中文注释：格式化下载速度。
const formatSpeed = (bytesPerSecond?: number) => {
  if (typeof bytesPerSecond !== "number" || !Number.isFinite(bytesPerSecond)) {
    return "—";
  }
  return `${formatBytes(bytesPerSecond)}/s`;
};

export function BrowserLoadingOverlay({
  visible,
  text = "Loading…",
  details,
}: {
  visible: boolean;
  text?: string;
  details?: BrowserLoadingOverlayDetails;
}) {
  const host = getHostname(details?.url);
  const title = details?.title?.trim() || host;
  const requestCount =
    typeof details?.requestCount === "number" ? details.requestCount : 0;
  const finishedCount =
    typeof details?.finishedCount === "number" ? details.finishedCount : 0;
  const failedCount =
    typeof details?.failedCount === "number" ? details.failedCount : 0;
  // 中文注释：用已完成 + 失败的请求估算进度，避免永远卡在 0%。
  const rawPercent =
    requestCount > 0
      ? Math.round(((finishedCount + failedCount) / requestCount) * 100)
      : 0;
  // 中文注释：加载时从 10% 起步，避免一直停在 0% 的观感。
  const targetPercent = Math.min(100, Math.max(10, rawPercent));
  // 中文注释：用平滑进度避免瞬间跳变。
  const [displayPercent, setDisplayPercent] = useState(10);
  const targetPercentRef = useRef(targetPercent);
  targetPercentRef.current = targetPercent;
  useEffect(() => {
    if (!visible) return;
    setDisplayPercent(10);
  }, [visible, details?.url]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      setDisplayPercent((prev) => {
        const target = targetPercentRef.current;
        if (prev >= target) return prev;
        const delta = target - prev;
        const step = delta > 30 ? 6 : delta > 10 ? 3 : 1;
        return Math.min(target, prev + step);
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [visible]);
  const speedText = formatSpeed(details?.bytesPerSecond);
  const ringSize = 64;
  const ringStroke = 4;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (displayPercent / 100) * ringCircumference;
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-10 grid place-items-center bg-background/70"
        >
          <div className="flex flex-col items-center gap-2 px-6 py-5 text-center">
            <div className="relative h-16 w-16">
              <svg
                className="h-full w-full -rotate-90"
                viewBox={`0 0 ${ringSize} ${ringSize}`}
              >
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke="currentColor"
                  strokeWidth={ringStroke}
                  className="text-foreground/10"
                  fill="none"
                />
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke="currentColor"
                  strokeWidth={ringStroke}
                  strokeLinecap="round"
                  className="text-foreground"
                  fill="none"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  style={{ transition: "stroke-dashoffset 0.2s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <div className="text-sm font-semibold text-foreground">
                  {displayPercent}%
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {speedText}
                </div>
              </div>
            </div>
            {title ? (
              <motion.div
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: [0.4, 0, 0.6, 1],
                }}
                className="flex items-center justify-center gap-2 text-sm font-medium text-foreground"
              >
                <span className="max-w-[320px] truncate whitespace-nowrap">{title}</span>
              </motion.div>
            ) : null}
            <div aria-label={text} className="sr-only" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
