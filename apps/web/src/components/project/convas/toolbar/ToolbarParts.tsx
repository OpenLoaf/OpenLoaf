"use client";

import { cn } from "@udecode/cn";

/** 仅图标的按钮组件（玻璃风格工具条中的按钮） */
function IconBtn(props: {
  title: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const { title, active, children, onClick, className } = props;
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
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

/** 悬浮面板中的条目：图标 + 文案说明 */
function PanelItem(props: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const { title, children, onClick, active } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // 面板条目：上下排列（图标在上、文字在下）
        "inline-flex flex-col items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px]",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent"
      )}
    >
      {children}
      <span className="whitespace-nowrap leading-none">{title}</span>
    </button>
  );
}

export { HoverPanel, IconBtn, PanelItem };
