"use client";

import { useRef } from "react";
import { cn } from "@udecode/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const toolbarSurfaceClassName =
  "bg-card/90 ring-1 ring-border/70 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-md cursor-default [&_*]:!cursor-default";

/** 仅图标的按钮组件（玻璃风格工具条中的按钮） */
function IconBtn(props: {
  title: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
  /** Tooltip placement side. */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Whether to show tooltip content. */
  showTooltip?: boolean;
}) {
  const {
    title,
    active,
    children,
    onClick,
    onPointerDown,
    className,
    disabled,
    tooltipSide = "top",
    showTooltip = true,
  } = props;
  const pointerHandledRef = useRef(false);
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!onPointerDown) return;
    pointerHandledRef.current = true;
    event.stopPropagation();
    onPointerDown(event);
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      event.stopPropagation();
      return;
    }
    onClick?.();
  };
  const button = (
    <button
      type="button"
      aria-label={title}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "transition-colors",
        active
          ? "bg-foreground/12 text-foreground dark:bg-foreground/18 dark:text-background"
          : "hover:bg-accent/60",
        disabled ? "cursor-not-allowed opacity-40" : "",
        className
      )}
    >
      {children}
    </button>
  );

  if (!showTooltip) {
    return button;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide} sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

/** 悬停展开的小面板（用于同类操作），hover 显示、离开隐藏 */
function HoverPanel(props: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { open, children, className, onMouseEnter, onMouseLeave } = props;
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "pointer-events-auto absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-3",
        // 使用接近 AFFiNE 的上弹菜单风格
        "rounded-xl p-2",
        toolbarSurfaceClassName,
        "transition-all duration-150 ease-out",
        open ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95",
        className
      )}
    >
      <div className="w-full">{children}</div>
    </div>
  );
}

/** Render a panel item with icon + label. */
function PanelItem(props: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  onPointerCancel?: () => void;
  active?: boolean;
  size?: "md" | "sm";
  showLabel?: boolean;
  className?: string;
}) {
  const {
    title,
    children,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    active,
    size = "md",
    showLabel = true,
    className,
  } = props;
  const sizeClassName =
    size === "sm"
      ? "gap-1 rounded-md px-2 py-1 text-[10px]"
      : "gap-1 rounded-md px-2.5 py-1.5 text-[11px]";
  /** Handle tool activation on pointer down to avoid click loss. */
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // 逻辑：优先响应按下，避免 click 被画布层吞掉
    event.stopPropagation();
    if (onPointerDown) {
      onPointerDown();
      return;
    }
    onClick?.();
  };
  /** Stop pointer-driven actions when released. */
  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onPointerUp?.();
  };
  /** Stop pointer-driven actions when leaving. */
  const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onPointerLeave?.();
  };
  /** Stop pointer-driven actions when canceled. */
  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onPointerCancel?.();
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // 逻辑：按钮的指针点击已经在 pointerdown 处理，这里只响应键盘触发的 click。
    if (event.detail > 0 && (onPointerDown || onClick)) {
      event.stopPropagation();
      return;
    }
    onClick?.();
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      title={title}
      aria-label={title}
      className={cn(
        // 面板条目：上下排列（图标在上、文字在下）
        "inline-flex flex-col items-center",
        sizeClassName,
        active
          ? "bg-foreground/12 text-foreground dark:bg-foreground/18 dark:text-background"
          : "hover:bg-accent",
        className
      )}
    >
      {children}
      {showLabel ? <span className="whitespace-nowrap leading-none">{title}</span> : null}
    </button>
  );
}

export { HoverPanel, IconBtn, PanelItem, toolbarSurfaceClassName };
