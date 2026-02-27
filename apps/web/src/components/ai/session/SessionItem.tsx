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

import * as React from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal, PencilLine, Pin, Trash2, Layers } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { toast } from "sonner";
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
} from "@/components/ai-elements/prompt-input";
import { ModelSelector, ModelSelectorContent } from "@/components/ai-elements/model-selector";

export interface Session {
  /** Session id. */
  id: string;
  /** Raw session title. */
  name: string;
  /** Display name with optional project prefix. */
  displayName?: string;
  /** Project label for session list. */
  projectLabel?: string;
  /** Session created time. */
  createdAt: string | Date;
  /** Whether the session is pinned. */
  pinned?: boolean;
  /** Whether the session has layer history. */
  hasLayers?: boolean;
}

interface SessionItemProps {
  /** Session data. */
  session: Session;
  /** Active state. */
  isActive?: boolean;
  /** Select handler. */
  onSelect?: (session: Session) => void;
  /** Menu open state callback. */
  onMenuOpenChange?: (open: boolean) => void;
  /** Custom className. */
  className?: string;
}

export default function SessionItem({
  session,
  isActive,
  onSelect,
  onMenuOpenChange,
  className,
}: SessionItemProps) {
  const renameInputId = React.useId();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);

  // Dialog states
  const [isRenameOpen, setIsRenameOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(session.name);

  // 更新会话（重命名/置顶/删除采用软删除）
  const updateSession = useMutation({
    ...(trpc.chatsession.updateOneChatSession.mutationOptions() as any),
    onSuccess: () => {
      // 中文注释：仅刷新会话列表，避免触发无关请求。
      invalidateChatSessions(queryClient);
    },
  });

  const handleMenuOpenChange = React.useCallback((open: boolean) => {
    setMenuOpen(open);
    onMenuOpenChange?.(open);
  }, [onMenuOpenChange]);

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

  React.useEffect(() => {
    if (!isRenameOpen) return;
    // 中文注释：等弹层挂载后聚焦输入框，避免首次打开丢失焦点。
    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isRenameOpen]);

  return (
    <>
      <div
        className={cn(
          "group flex w-full min-w-0 items-center gap-1 rounded-sm pr-1 hover:bg-accent hover:text-accent-foreground",
          className
        )}
      >
        <button
          type="button"
          disabled={isActive}
          onClick={() => onSelect?.(session)}
          className={cn(
            "min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {session.projectLabel ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {session.projectLabel}
              </span>
            ) : null}
            <span className="truncate">{session.displayName ?? session.name}</span>
            {session.hasLayers && (
              <Layers size={14} className="text-muted-foreground" />
            )}
          </span>
        </button>
        <PromptInputActionMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
          <PromptInputActionMenuTrigger
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            aria-label="Session actions"
          >
            <MoreHorizontal size={16} />
          </PromptInputActionMenuTrigger>
          <PromptInputActionMenuContent className="w-36">
            <PromptInputActionMenuItem
              disabled={isBusy}
              onSelect={() => {
                setRenameValue(session.name);
                setIsRenameOpen(true);
              }}
            >
              <PencilLine size={16} className="text-muted-foreground" />
              重命名
            </PromptInputActionMenuItem>
            <PromptInputActionMenuItem
              disabled={isBusy}
              onSelect={async () => {
                // 置顶/取消置顶：更新 isPin 字段
                const nextIsPin = !session.pinned;
                try {
                  setIsBusy(true);
                  await updateSession.mutateAsync({
                    where: { id: session.id },
                    data: { isPin: nextIsPin },
                  } as any);
                  toast.success(nextIsPin ? "已置顶" : "已取消置顶");
                } catch (err: any) {
                  toast.error(err?.message ?? "置顶操作失败");
                } finally {
                  setIsBusy(false);
                }
              }}
            >
              <Pin size={16} className="text-muted-foreground" />
              {session.pinned ? "取消置顶" : "置顶"}
            </PromptInputActionMenuItem>
            <PromptInputActionMenuItem
              disabled={isBusy}
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                setIsDeleteOpen(true);
              }}
            >
              <Trash2 size={16} className="text-destructive" />
              删除
            </PromptInputActionMenuItem>
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>
      </div>

      <ModelSelector open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <ModelSelectorContent title="重命名会话" className="max-w-md">
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">重命名会话</h3>
              <p className="text-sm text-muted-foreground">请输入新的会话名称。</p>
            </div>
            <div className="space-y-2">
              <label htmlFor={renameInputId} className="text-xs font-medium text-muted-foreground">
                名称
              </label>
              <input
                id={renameInputId}
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className={cn(
                  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground",
                  "outline-none ring-offset-background placeholder:text-muted-foreground",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleRename();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <PromptInputButton
                variant="outline"
                type="button"
                onClick={() => setIsRenameOpen(false)}
                disabled={isBusy}
              >
                取消
              </PromptInputButton>
              <PromptInputButton onClick={handleRename} disabled={isBusy}>
                保存
              </PromptInputButton>
            </div>
          </div>
        </ModelSelectorContent>
      </ModelSelector>

      <ModelSelector open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <ModelSelectorContent title="确认删除会话" className="max-w-md">
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">确认删除</h3>
              <p className="text-sm text-muted-foreground">
                确定要删除这个会话吗？此操作无法撤销。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <PromptInputButton
                variant="outline"
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isBusy}
              >
                取消
              </PromptInputButton>
            <PromptInputButton
              variant="destructive"
              onClick={handleDelete}
              disabled={isBusy}
            >
              删除
            </PromptInputButton>
            </div>
          </div>
        </ModelSelectorContent>
      </ModelSelector>
    </>
  );
}
