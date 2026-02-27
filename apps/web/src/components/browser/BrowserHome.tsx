/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ClipboardCopy, Globe, Link, PencilLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFavoriteSites,
  getRecentlyClosedSites,
  onBrowserStorageChange,
  removeFavoriteSiteById,
  setFavoriteSites,
  updateFavoriteSite,
  type FavoriteSite,
  type RecentlyClosedSite,
} from "@/components/browser/browser-storage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import { Button } from "@openloaf/ui/button";

// Get the initial letter for a site icon.
function getInitial(title: string) {
  const t = title.trim();
  if (!t) return "";
  return t.slice(0, 1).toUpperCase();
}

// Format closed time for display in the UI.
function formatClosedAt(ts: number) {
  const now = Date.now();
  const diffMs = Math.max(0, now - ts);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const date = new Date(ts);
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

// Render the icon block for a favorite site.
function SiteIcon({
  title,
  accent,
  iconUrl,
  className,
}: {
  title: string;
  accent: string;
  iconUrl?: string;
  className?: string;
}) {
  const initial = getInitial(title);
  const [imageFailed, setImageFailed] = useState(false);
  const showIcon = Boolean(iconUrl) && !imageFailed;
  return (
    <div
      className={cn(
        "relative grid place-items-center rounded-2xl ring-1 ring-border/60 shadow-sm",
        className,
      )}
      style={{ background: accent }}
      aria-hidden
    >
      {showIcon ? (
        <img
          src={iconUrl}
          alt=""
          className="h-8 w-8 rounded-md"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : initial ? (
        <span className="text-sm font-semibold text-white/95">{initial}</span>
      ) : (
        <Globe className="h-5 w-5 text-white/95" />
      )}
    </div>
  );
}

// Render the browser home dashboard.
export function BrowserHome({ onOpenUrl }: { onOpenUrl?: (url: string) => void }) {
  const [favorites, setFavorites] = useState<FavoriteSite[]>([]);
  const [recentlyClosed, setRecentlyClosed] = useState<RecentlyClosedSite[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogMode, setEditDialogMode] = useState<"rename" | "edit-url">("rename");
  const [editDialogSite, setEditDialogSite] = useState<FavoriteSite | null>(null);
  const [editDialogValue, setEditDialogValue] = useState("");

  useEffect(() => {
    // 初始化时从本地缓存读取，保证多次打开一致。
    setFavorites(getFavoriteSites());
    setRecentlyClosed(getRecentlyClosedSites());
    return onBrowserStorageChange(() => {
      setFavorites(getFavoriteSites());
      setRecentlyClosed(getRecentlyClosedSites());
    });
  }, []);

  // 页面首次展示时做轻量动效（淡入 + 上移 + 轻微缩放），更接近 Safari 的新标签页观感。
  const listVariants = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.22,
        ease: "easeOut",
        staggerChildren: 0.03,
        delayChildren: 0.04,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.18, ease: "easeOut" },
    },
  } as const;

  // Open the edit dialog for a favorite site.
  const openEditDialog = (site: FavoriteSite, mode: "rename" | "edit-url") => {
    setEditDialogSite(site);
    setEditDialogMode(mode);
    setEditDialogValue(mode === "rename" ? site.title : site.url);
    setEditDialogOpen(true);
  };

  // Copy the favorite URL to clipboard.
  const handleCopyFavoriteUrl = (site: FavoriteSite) => {
    const url = site.url;
    if (!url) return;
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(url);
      return;
    }
    // 剪贴板 API 不可用时使用降级方案。
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  // Remove a favorite site.
  const handleDeleteFavorite = (site: FavoriteSite) => {
    removeFavoriteSiteById(site.id);
  };

  // Submit changes from the edit dialog.
  const handleSubmitEditDialog = () => {
    if (!editDialogSite) return;
    const nextValue = editDialogValue.trim();
    if (!nextValue) return;
    if (editDialogMode === "rename") {
      updateFavoriteSite(editDialogSite.id, { title: nextValue });
    } else {
      updateFavoriteSite(editDialogSite.id, { url: nextValue });
    }
    setEditDialogOpen(false);
    setEditDialogSite(null);
    setEditDialogValue("");
  };

  // Reorder favorites after dragging.
  const handleReorderFavorites = (fromId: string, toId: string | null) => {
    if (!fromId || fromId === toId) return;
    const current = favorites;
    const fromIndex = current.findIndex((item) => item.id === fromId);
    if (fromIndex === -1) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    const toIndex = toId ? next.findIndex((item) => item.id === toId) : next.length;
    const insertIndex = toIndex < 0 ? next.length : toIndex;
    // 拖动排序只改变展示顺序，保持条目内容不变。
    next.splice(insertIndex, 0, moved);
    setFavoriteSites(next);
  };

  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="mx-auto flex w-full max-w-[920px] flex-col px-6 pb-10 pt-10">
        <div className="mb-6">
          <div className="text-sm font-medium text-foreground">收藏</div>
        </div>

        <div className="rounded-2xl">
          {favorites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
              暂无收藏，可在右上角点击星标添加
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
              variants={listVariants}
              initial="hidden"
              animate="show"
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                // 拖到空白区域时，默认移动到末尾。
                handleReorderFavorites(draggingId, null);
                setDraggingId(null);
                setDragOverId(null);
              }}
            >
              {favorites.map((s) => (
                <ContextMenu key={s.id}>
                  <ContextMenuTrigger asChild>
                    <motion.button
                      type="button"
                      className={cn(
                        "group flex w-full flex-col items-center rounded-xl p-2 transition-colors",
                        "hover:bg-sidebar/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        dragOverId === s.id && "ring-2 ring-ring/60",
                      )}
                      onClick={() => onOpenUrl?.(s.url)}
                      title={s.url}
                      variants={itemVariants}
                      draggable
                      onDragStart={(event) => {
                        // Framer Motion types on onDragStart are pointer/mouse/touch.
                        // Cast to native DragEvent to use dataTransfer for DnD.
                        const e = event as unknown as React.DragEvent<HTMLButtonElement>;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", s.id);
                        setDraggingId(s.id);
                      }}
                      onDragOver={(event) => {
                        if (!draggingId || draggingId === s.id) return;
                        event.preventDefault();
                        setDragOverId(s.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverId === s.id) setDragOverId(null);
                      }}
                      onDrop={(event) => {
                        if (!draggingId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        handleReorderFavorites(draggingId, s.id);
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                    >
                      <SiteIcon
                        title={s.title}
                        accent={s.accent}
                        iconUrl={s.iconUrl}
                        className="h-14 w-14"
                      />
                      <div className="mt-2 line-clamp-2 text-center text-[11px] leading-4 text-muted-foreground group-hover:text-foreground">
                        {s.title}
                      </div>
                    </motion.button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem
                      icon={PencilLine}
                      onSelect={() => openEditDialog(s, "rename")}
                    >
                      重命名
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={Link}
                      onSelect={() => openEditDialog(s, "edit-url")}
                    >
                      编辑地址
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={ClipboardCopy}
                      onSelect={() => handleCopyFavoriteUrl(s)}
                    >
                      复制地址
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      icon={Trash2}
                      onSelect={() => handleDeleteFavorite(s)}
                    >
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </motion.div>
          )}
        </div>

        {recentlyClosed.length > 0 ? (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <div className="text-sm font-medium text-foreground">最近关闭</div>
            </div>

            <motion.div
              className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-2"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {recentlyClosed.map((s) => (
                <motion.button
                  key={s.id}
                  type="button"
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2 text-left transition-colors",
                    "hover:bg-sidebar/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  )}
                  onClick={() => onOpenUrl?.(s.url)}
                  title={s.url}
                  variants={itemVariants}
                >
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar/40 ring-1 ring-border/60">
                    <Globe className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">{s.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.url}</div>
                  </div>

                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatClosedAt(s.closedAt)}
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            // 关闭弹窗时清空编辑状态，避免下次复用旧数据。
            setEditDialogSite(null);
            setEditDialogValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDialogMode === "rename" ? "重命名收藏" : "编辑地址"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input
              value={editDialogValue}
              onChange={(event) => setEditDialogValue(event.target.value)}
              placeholder={editDialogMode === "rename" ? "输入收藏名称" : "输入网址"}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmitEditDialog();
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmitEditDialog}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
