"use client";

import { useRef } from "react";
import { cn } from "@udecode/cn";

/** 仅图标的按钮组件（玻璃风格工具条中的按钮） */
function IconBtn(props: {
  title: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const { title, active, children, onClick, className, disabled } = props;
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        disabled ? "cursor-not-allowed opacity-40" : "",
        className
      )}
    >
      {children}
    </button>
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
        "pointer-events-auto absolute -top-3 left-1/2 z-10 -translate-y-full -translate-x-1/2",
        // 悬浮面板不透明，去除毛玻璃
        "rounded-xl bg-background p-2.5 ring-1 ring-border",
        "transition-all duration-150 ease-out",
        open ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95",
        className
      )}
    >
      <div className="flex items-center gap-1.5">{children}</div>
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
    className,
  } = props;
  const hasPointerHandler = Boolean(onPointerDown || onPointerUp || onPointerLeave || onPointerCancel);
  const sizeClassName =
    size === "sm"
      ? "gap-1 rounded-md px-2 py-1 text-[10px]"
      : "gap-1 rounded-md px-2.5 py-1.5 text-[11px]";
  /** Handle tool activation on pointer down to avoid click loss. */
  const pointerHandledRef = useRef(false);
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // 逻辑：优先响应按下，避免 click 被画布层吞掉
    pointerHandledRef.current = true;
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
    if (hasPointerHandler) {
      pointerHandledRef.current = false;
    }
    onPointerUp?.();
  };
  /** Stop pointer-driven actions when leaving. */
  const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (hasPointerHandler) {
      pointerHandledRef.current = false;
    }
    onPointerLeave?.();
  };
  /** Stop pointer-driven actions when canceled. */
  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (hasPointerHandler) {
      pointerHandledRef.current = false;
    }
    onPointerCancel?.();
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
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
      className={cn(
        // 面板条目：上下排列（图标在上、文字在下）
        "inline-flex flex-col items-center",
        sizeClassName,
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent",
        className
      )}
    >
      {children}
      <span className="whitespace-nowrap leading-none">{title}</span>
    </button>
  );
}

export { HoverPanel, IconBtn, PanelItem };
