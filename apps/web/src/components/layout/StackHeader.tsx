"use client";

import * as React from "react";
import { Copy, ExternalLink, Minus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { isElectronEnv } from "@/utils/is-electron-env";

/**
 * StackHeader：左侧 stack 面板的统一顶部栏（MVP）
 * - children 用于自定义标题区（例如 browser tabs）；未提供时回退到 title
 * - onRefresh/onClose 由调用方注入（不同面板可能有不同刷新/关闭语义）
 */
export function StackHeader({
  title,
  children,
  rightSlot,
  rightSlotAfter,
  rightSlotBeforeClose,
  openUri,
  openRootUri,
  onRefresh,
  onClose,
  showMinimize = false,
  onMinimize,
  canClose = true,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** Optional slot rendered after the refresh button. */
  rightSlotAfter?: React.ReactNode;
  /** Optional slot rendered before the close button. */
  rightSlotBeforeClose?: React.ReactNode;
  openUri?: string;
  /** Optional root uri for resolving relative file paths. */
  openRootUri?: string;
  onRefresh?: () => void;
  onClose?: () => void;
  showMinimize?: boolean;
  onMinimize?: () => void;
  canClose?: boolean;
  className?: string;
}) {
  /** Open the current file in the system default program. */
  const handleOpenExternal = React.useCallback(async () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!openRootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[[^\]]+\]\/?(.*)$/);
      const relativePath = scopedMatch ? scopedMatch[1] ?? "" : trimmedUri;
      return resolveFileUriFromRoot(openRootUri, relativePath);
    })();
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    if (!resolvedUri) {
      toast.error("未找到文件路径");
      return;
    }
    const res = await api.openPath({ uri: resolvedUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  }, [openRootUri, openUri]);

  /** Copy the resolved file path to clipboard. */
  const handleCopyPath = React.useCallback(async () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!openRootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[[^\]]+\]\/?(.*)$/);
      const relativePath = scopedMatch ? scopedMatch[1] ?? "" : trimmedUri;
      return resolveFileUriFromRoot(openRootUri, relativePath);
    })();
    if (!resolvedUri) return;
    try {
      const url = new URL(resolvedUri);
      const filePath = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, "$1");
      await navigator.clipboard.writeText(filePath);
      toast.success("已复制路径");
    } catch {
      await navigator.clipboard.writeText(resolvedUri);
      toast.success("已复制路径");
    }
  }, [openRootUri, openUri]);

  return (
    <div className={cn("shrink-0 bg-background/70 backdrop-blur-sm", className)}>
      <div className="flex items-center justify-between gap-2 px-1 pt-0 py-2">
        <div className="min-w-0 flex-1 text-sm font-medium pl-2">
          {children ? children : <span className="truncate">{title}</span>}
        </div>
        <div className="flex items-center gap-1">
          {rightSlot}
          {openUri && isElectronEnv() ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="系统打开"
                  onClick={handleOpenExternal}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">系统打开</TooltipContent>
            </Tooltip>
          ) : null}
          {openUri ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="复制路径"
                  onClick={handleCopyPath}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">复制路径</TooltipContent>
            </Tooltip>
          ) : null}
          {onRefresh ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={onRefresh} aria-label="刷新">
                  <RotateCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">刷新</TooltipContent>
            </Tooltip>
          ) : null}
          {rightSlotAfter}
          {rightSlotBeforeClose}
          {showMinimize ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Minimize"
              onClick={onMinimize}
              disabled={!onMinimize}
            >
              <Minus className="h-4 w-4" />
            </Button>
          ) : null}
          {canClose && onClose ? (
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
