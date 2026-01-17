"use client";

import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalTab } from "@tenas-ai/api/common";

/** Render a tabs bar for terminal sub-tabs. */
export function TerminalTabsBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
  getTitle,
  disableNew = false,
}: {
  tabs: TerminalTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  getTitle?: (tab: TerminalTab) => string;
  disableNew?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide">
        {tabs.length === 0 ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">暂无终端</div>
        ) : (
          tabs.map((t) => {
            const isActive = t.id === activeId;
            const title = getTitle?.(t) ?? t.title ?? "Terminal";

            return (
              <div
                key={t.id}
                className={cn(
                  "group relative flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-lg px-3 text-sm",
                  isActive
                    ? "min-w-[180px] max-w-[260px] text-foreground"
                    : "max-w-[180px] bg-sidebar/30 text-muted-foreground hover:bg-sidebar/60 hover:text-foreground",
                )}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(t.id);
                  }
                }}
                title={title}
              >
                <AnimatePresence>
                  {isActive ? (
                    <motion.div
                      layoutId="terminal-tab-active"
                      layout="position"
                      transition={{ type: "spring", stiffness: 500, damping: 42 }}
                      className="absolute inset-0 bg-sidebar-accent"
                    />
                  ) : null}
                </AnimatePresence>

                <div className="relative z-10 min-w-0 flex-1 truncate text-xs">
                  {title}
                </div>

                <button
                  type="button"
                  className="relative z-10 grid h-6 w-6 place-items-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose(t.id);
                  }}
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        <button
          type="button"
          className="ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-transparent text-muted-foreground hover:bg-sidebar/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disableNew) onNew();
          }}
          aria-label="New tab"
          title={disableNew ? "终端不可用" : "新建标签 (Alt+N)"}
          disabled={disableNew}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
