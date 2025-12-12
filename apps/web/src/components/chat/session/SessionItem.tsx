"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, PencilLine, Pin, Trash2, Layers } from "lucide-react";

export interface Session {
  id: string;
  name: string;
  createdAt: string | Date;
  pinned?: boolean;
  hasLayers?: boolean;
}

interface SessionItemProps {
  session: Session;
  onSelect?: (session: Session) => void;
  onMenuOpenChange?: (open: boolean) => void;
  className?: string;
}

export default function SessionItem({
  session,
  onSelect,
  onMenuOpenChange,
  className,
}: SessionItemProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);
  const openTimer = React.useRef<number | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const clearOpenTimer = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  const openMenu = () => {
    clearCloseTimer();
    if (menuOpen) return;
    clearOpenTimer();
    openTimer.current = window.setTimeout(() => {
      setMenuOpen(true);
      onMenuOpenChange?.(true);
    }, 500);
  };

  const scheduleClose = () => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setMenuOpen(false);
      onMenuOpenChange?.(false);
    }, 300);
  };

  React.useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return;
    const updatePos = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [menuOpen]);

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1 rounded-sm pr-1 hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSelect?.(session)}
        className="flex-1 truncate px-2 py-1.5 text-left text-sm"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="truncate">{session.name}</span>
          {session.hasLayers && (
            <Layers size={14} className="text-muted-foreground" />
          )}
        </span>
      </button>
      <div
        className="relative"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label="Session actions"
        >
          <MoreHorizontal size={16} />
        </Button>
        {menuOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed z-[60] w-36 -translate-x-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ top: pos.top, left: pos.left }}
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <PencilLine size={16} className="text-muted-foreground" />
                重命名
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Pin size={16} className="text-muted-foreground" />
                置顶
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 size={16} className="text-destructive" />
                删除
              </button>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
