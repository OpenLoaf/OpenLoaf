"use client";

import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeUrl } from "@/components/browser/browser-utils";
import type { BrowserTab } from "@/components/browser/browser-types";

export function BrowserTabsBar({
  tabs,
  activeId,
  editingTabId,
  editingUrl,
  onSelect,
  onClose,
  onNew,
  onStartEditUrl,
  onChangeEditingUrl,
  onCommitUrl,
  onCancelEdit,
}: {
  tabs: BrowserTab[];
  activeId: string;
  editingTabId: string | null;
  editingUrl: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onStartEditUrl: () => void;
  onChangeEditingUrl: (value: string) => void;
  onCommitUrl: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide">
        {tabs.length === 0 ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">暂无页面</div>
        ) : (
          tabs.map((t) => {
            const isActive = t.id === activeId;
            const isEditing = isActive && editingTabId === t.id;
            const title = t.title ?? "Untitled";
            const url = normalizeUrl(t.url ?? "");

            return (
              <div
                key={t.id}
                className={cn(
                  "group relative flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-lg px-3 text-sm",
                  isActive
                    ? "min-w-[216px] text-foreground"
                    : "max-w-[180px] bg-transparent text-muted-foreground hover:bg-sidebar/60 hover:text-foreground",
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
                      // 中文注释：参考 Header Tabs 的交互，高亮背景用 layoutId 让切换更顺滑。
                      layoutId="browser-tab-active"
                      layout="position"
                      transition={{ type: "spring", stiffness: 500, damping: 42 }}
                      className="absolute inset-0 bg-sidebar-accent"
                    />
                  ) : null}
                </AnimatePresence>

                <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
                  {isActive ? (
                    isEditing ? (
                      <input
                        autoFocus
                        value={editingUrl}
                        onChange={(e) => onChangeEditingUrl(e.target.value)}
                        onFocus={(e) => {
                          // 中文注释：进入编辑态时默认全选，方便直接覆盖输入。
                          e.currentTarget.select();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onCommitUrl();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            onCancelEdit();
                          }
                        }}
                        onBlur={() => onCommitUrl()}
                        placeholder="输入网址，回车跳转"
                        className="min-w-0 flex-1 bg-transparent p-0 text-left text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 caret-foreground"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onStartEditUrl();
                        }}
                        title={url}
                      >
                        {url || "点击输入网址"}
                      </button>
                    )
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                  )}
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
          className="ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-transparent text-muted-foreground hover:bg-sidebar/60 hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNew();
          }}
          aria-label="New tab"
          title="新建标签"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

