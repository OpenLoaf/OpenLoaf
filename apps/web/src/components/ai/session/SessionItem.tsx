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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MessageSquare, MoreHorizontal, PencilLine, Pin, Trash2, Layers } from "lucide-react";
import { AutoTestBadge, AutoTestScorePill } from "@/components/ai/autoTest/AutoTestBadge";
import type { AutoTestVerdict } from "@openloaf/api";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";

export interface Session {
  /** Session id. */
  id: string;
  /** Raw session title. */
  name: string;
  /** Display name with optional project prefix. */
  displayName?: string;
  /** Project label for session list. */
  projectLabel?: string;
  /** Project icon (emoji). */
  projectIcon?: string;
  /** Session created time. */
  createdAt: string | Date;
  /** Whether the session is pinned. */
  pinned?: boolean;
  /** Whether the session has layer history. */
  hasLayers?: boolean;
  /** chat-probe 自动测试会话标记。 */
  autoTest?: boolean;
  /** 自动测试评审聚合分数。 */
  autoTestScore?: number | null;
  /** 自动测试评审聚合裁决。 */
  autoTestVerdict?: AutoTestVerdict | null;
}

interface SessionItemProps {
  /** Session data. */
  session: Session;
  /** Active state. */
  isActive?: boolean;
  /** Whether this session is already open in some tab. */
  isOpenInTab?: boolean;
  /** Select handler. */
  onSelect?: (session: Session) => void;
  /** Menu open state callback. */
  onMenuOpenChange?: (open: boolean) => void;
  /** Custom className. */
  className?: string;
}

function SessionItem({
  session,
  isActive,
  isOpenInTab,
  onSelect,
  onMenuOpenChange,
  className,
}: SessionItemProps) {
  const { t } = useTranslation(["ai", "common"]);
  const renameInputId = React.useId();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
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

  const handleContextMenuOpenChange = React.useCallback((open: boolean) => {
    setContextMenuOpen(open);
    onMenuOpenChange?.(open);
  }, [onMenuOpenChange]);

  const handleRenameSelect = React.useCallback(() => {
    setRenameValue(session.name);
    setIsRenameOpen(true);
  }, [session.name]);

  const handleTogglePin = React.useCallback(async () => {
    const nextIsPin = !session.pinned;
    try {
      setIsBusy(true);
      await updateSession.mutateAsync({
        where: { id: session.id },
        data: { isPin: nextIsPin },
      } as any);
      toast.success(nextIsPin ? t("ai:session.pinSuccess") : t("ai:session.unpinSuccess"));
    } catch (err: any) {
      toast.error(err?.message ?? t("ai:session.pinFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [session.pinned, session.id, updateSession, t]);

  const handleDeleteSelect = React.useCallback(() => {
    setIsDeleteOpen(true);
  }, []);

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
      toast.success(t("common:renameSuccess"));
      setIsRenameOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? t("common:renameFailed"));
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
      toast.success(t("common:deleted"));
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? t("common:deleteFailed"));
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
      <ContextMenu onOpenChange={handleContextMenuOpenChange}>
        <ContextMenuTrigger asChild>
          <div
            data-menu-open={menuOpen || contextMenuOpen ? "true" : undefined}
            className={cn(
              "group flex w-full min-w-0 items-center gap-1 rounded-3xl pr-1 hover:bg-accent hover:text-accent-foreground",
              "data-[menu-open=true]:bg-accent data-[menu-open=true]:text-accent-foreground",
              className
            )}
          >
            <button
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onSelect?.(session)}
              className={cn(
                "min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm",
                isActive && "font-medium text-foreground"
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {isOpenInTab && (
                  <span className="inline-block size-1.5 shrink-0 rounded-full bg-foreground" />
                )}
                <span className="shrink-0 text-sm leading-none">
                  {session.projectIcon ? (
                    session.projectIcon
                  ) : (
                    <MessageSquare size={14} className="text-muted-foreground" />
                  )}
                </span>
                <span className="truncate">{session.displayName ?? session.name}</span>
                {session.autoTest ? <AutoTestBadge /> : null}
                {session.autoTest && session.autoTestScore != null ? (
                  <AutoTestScorePill
                    score={session.autoTestScore}
                    verdict={session.autoTestVerdict ?? "PASS"}
                  />
                ) : null}
                {session.hasLayers && (
                  <Layers size={14} className="text-muted-foreground" />
                )}
              </span>
            </button>
            <PromptInputActionMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
              <PromptInputActionMenuTrigger
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 group-data-[menu-open=true]:opacity-100"
                onClick={(event) => event.stopPropagation()}
                aria-label="Session actions"
              >
                <MoreHorizontal size={16} />
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent className="w-36">
                <PromptInputActionMenuItem disabled={isBusy} onSelect={handleRenameSelect}>
                  <PencilLine size={16} className="text-muted-foreground" />
                  {t("common:rename")}
                </PromptInputActionMenuItem>
                <PromptInputActionMenuItem disabled={isBusy} onSelect={handleTogglePin}>
                  <Pin size={16} className="text-muted-foreground" />
                  {t(session.pinned ? "ai:session.unpin" : "ai:session.pin")}
                </PromptInputActionMenuItem>
                <PromptInputActionMenuItem
                  disabled={isBusy}
                  className="text-destructive focus:text-destructive"
                  onSelect={handleDeleteSelect}
                >
                  <Trash2 size={16} className="text-destructive" />
                  {t("common:delete")}
                </PromptInputActionMenuItem>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-36">
          <ContextMenuItem disabled={isBusy} icon={PencilLine} onSelect={handleRenameSelect}>
            {t("common:rename")}
          </ContextMenuItem>
          <ContextMenuItem disabled={isBusy} icon={Pin} onSelect={handleTogglePin}>
            {t(session.pinned ? "ai:session.unpin" : "ai:session.pin")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isBusy}
            variant="destructive"
            icon={Trash2}
            onSelect={handleDeleteSelect}
          >
            {t("common:delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ModelSelector open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <ModelSelectorContent title={t("ai:session.renameTitle")} className="max-w-md">
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{t("ai:session.renameTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("ai:session.renameDesc")}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor={renameInputId} className="text-xs font-medium text-muted-foreground">
                {t("ai:session.nameLabel")}
              </label>
              <input
                id={renameInputId}
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className={cn(
                  "h-9 w-full rounded-3xl border border-border bg-background px-3 text-sm text-foreground",
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
                {t("common:cancel")}
              </PromptInputButton>
              <PromptInputButton onClick={handleRename} disabled={isBusy}>
                {t("common:save")}
              </PromptInputButton>
            </div>
          </div>
        </ModelSelectorContent>
      </ModelSelector>

      <ModelSelector open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <ModelSelectorContent title={t("ai:session.deleteTitle")} className="max-w-md">
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{t("ai:session.deleteConfirmTitle")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("ai:session.deleteDesc")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <PromptInputButton
                variant="outline"
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isBusy}
              >
                {t("common:cancel")}
              </PromptInputButton>
            <PromptInputButton
              variant="destructive"
              onClick={handleDelete}
              disabled={isBusy}
            >
              {t("common:delete")}
            </PromptInputButton>
            </div>
          </div>
        </ModelSelectorContent>
      </ModelSelector>
    </>
  );
}

export default React.memo(SessionItem);
