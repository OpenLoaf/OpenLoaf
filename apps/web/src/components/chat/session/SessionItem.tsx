"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { MoreHorizontal, PencilLine, Pin, Trash2, Layers } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { toast } from "sonner";

export interface Session {
  id: string;
  name: string;
  createdAt: string | Date;
  pinned?: boolean;
  hasLayers?: boolean;
}

interface SessionItemProps {
  session: Session;
  isActive?: boolean;
  onSelect?: (session: Session) => void;
  onMenuOpenChange?: (open: boolean) => void;
  className?: string;
}

export default function SessionItem({
  session,
  isActive,
  onSelect,
  onMenuOpenChange,
  className,
}: SessionItemProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  
  // Dialog states
  const [isRenameOpen, setIsRenameOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(session.name);

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

  const closeMenuNow = () => {
    clearOpenTimer();
    clearCloseTimer();
    setMenuOpen(false);
    onMenuOpenChange?.(false);
  };

  // 更新会话（重命名/置顶/删除采用软删除）
  const updateSession = useMutation({
    ...(trpc.chatsession.updateOneChatSession.mutationOptions() as any),
    onSuccess: () => {
      // MVP：简单粗暴刷新所有查询即可
      queryClient.invalidateQueries();
    },
  });

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

  const handleRename = async () => {
    const title = renameValue.trim();
    if (!title) return;

    try {
      setIsBusy(true);
      await updateSession.mutateAsync({
        where: { id: session.id },
        // 用户手动重命名后：标记 isUserRename=true，避免后台 AI 覆盖
        data: { title, isUserRename: true },
      } as any);
      toast.success("重命名成功");
      setIsRenameOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "重命名失败");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsBusy(true);
      // MVP：软删除（仅设置 deletedAt），避免误删历史
      await updateSession.mutateAsync({
        where: { id: session.id },
        data: { deletedAt: new Date() },
      } as any);
      toast.success("已删除");
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "删除失败");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex w-full items-center gap-1 rounded-sm pr-1 hover:bg-accent hover:text-accent-foreground",
          className
        )}
      >
        <button
          type="button"
          disabled={isActive}
          onClick={() => onSelect?.(session)}
          className={cn(
            "flex-1 truncate px-2 py-1.5 text-left text-sm",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
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
                  disabled={isBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenuNow();
                    setRenameValue(session.name);
                    setIsRenameOpen(true);
                  }}
                >
                  <PencilLine size={16} className="text-muted-foreground" />
                  重命名
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  disabled={isBusy}
                  onClick={async (e) => {
                    e.stopPropagation();
                    // 置顶/取消置顶：更新 isPin 字段
                    const nextIsPin = !Boolean(session.pinned);
                    try {
                      setIsBusy(true);
                      await updateSession.mutateAsync({
                        where: { id: session.id },
                        data: { isPin: nextIsPin },
                      } as any);
                      toast.success(nextIsPin ? "已置顶" : "已取消置顶");
                      closeMenuNow();
                    } catch (err: any) {
                      toast.error(err?.message ?? "置顶操作失败");
                    } finally {
                      setIsBusy(false);
                    }
                  }}
                >
                  <Pin size={16} className="text-muted-foreground" />
                  {session.pinned ? "取消置顶" : "置顶"}
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  disabled={isBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenuNow();
                    setIsDeleteOpen(true);
                  }}
                >
                  <Trash2 size={16} className="text-destructive" />
                  删除
                </button>
              </div>,
              document.body
            )}
        </div>
      </div>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>
              请输入新的会话名称。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                名称
              </Label>
              <Input
                id="name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">取消</Button>
            </DialogClose>
            <Button onClick={handleRename} disabled={isBusy}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这个会话吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
             <DialogClose asChild>
              <Button variant="outline" type="button">取消</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
