"use client";

import * as React from "react";
import { Minus, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * StackHeader：左侧 stack 面板的统一顶部栏（MVP）
 * - children 用于自定义标题区（例如 browser tabs）；未提供时回退到 title
 * - onRefresh/onClose 由调用方注入（不同面板可能有不同刷新/关闭语义）
 */
export function StackHeader({
  title,
  children,
  onRefresh,
  onClose,
  showMinimize = false,
  canClose = true,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  onRefresh?: () => void;
  onClose?: () => void;
  showMinimize?: boolean;
  canClose?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 bg-background/70 backdrop-blur-sm", className)}>
      <div className="flex items-center justify-between gap-2 px-1 pt-0 py-2">
        <div className="min-w-0 flex-1 text-sm font-medium">
          {children ? children : <span className="truncate">{title}</span>}
        </div>
        <div className="flex items-center gap-1">
          {onRefresh ? (
            <Button size="sm" variant="ghost" onClick={onRefresh} aria-label="Refresh">
              <RotateCw className="h-4 w-4" />
            </Button>
          ) : null}
          {showMinimize ? (
            <Button size="sm" variant="ghost" aria-label="Minimize">
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
