"use client";

import * as React from "react";
import { ExternalLink, Minus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  openUri,
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
  openUri?: string;
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
    console.warn("[StackHeader] open external", { openUri });
    const api = window.tenasElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    const res = await api.openPath({ uri: openUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  }, [openUri]);

  return (
    <div className={cn("shrink-0 bg-background/70 backdrop-blur-sm", className)}>
      <div className="flex items-center justify-between gap-2 px-1 pt-0 py-2">
        <div className="min-w-0 flex-1 text-sm font-medium pl-2">
          {children ? children : <span className="truncate">{title}</span>}
        </div>
        <div className="flex items-center gap-1">
          {rightSlot}
          {openUri ? (
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
