"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabView } from "@/hooks/use-tab-view";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import type { DockItem } from "@tenas-ai/api/common";
import { StackHeader } from "./StackHeader";
import { Skeleton } from "@tenas-ai/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Button } from "@tenas-ai/ui/button";
import { toast } from "sonner";
import { BoardPanelHeaderActions } from "@/components/board/BoardPanelHeaderActions";
import {
  ensureBoardFolderName,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import { isBoardEmpty } from "@/components/board/core/boardContentTracker";
import {
  getParentRelativePath,
  isProjectAbsolutePath,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";

/** Returns true when the event target is an editable element. */
function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

/**
 * Fallback UI while lazy-loaded panels are initializing.
 */
function PanelFallback() {
  return (
    <div className="h-full w-full p-3">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-[40%]" />
        <Skeleton className="h-4 w-[72%]" />
        <Skeleton className="h-4 w-[56%]" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

function renderDockItem(tabId: string, item: DockItem, refreshKey = 0) {
  const Component = ComponentMap[item.component];
  if (!Component) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Component not found: {item.component}
      </div>
    );
  }

  // __refreshKey：用于外部触发“强制刷新面板”（改变 key -> remount）
  const derivedRefreshKey =
    refreshKey > 0
      ? refreshKey
      : Number((item.params as any)?.__refreshKey ?? 0);

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="h-full w-full min-w-0"
    >
      {/* 懒加载的面板通过 Suspense 隔离，避免阻塞其他区域渲染。 */}
      <React.Suspense fallback={<PanelFallback />}>
        <Component
          key={derivedRefreshKey > 0 ? `${item.id}-${derivedRefreshKey}` : undefined}
          panelKey={item.id}
          tabId={tabId}
          {...(item.params ?? {})}
        />
      </React.Suspense>
    </motion.div>
  );
}

function PanelFrame({
  tabId,
  item,
  title,
  onClose,
  onMinimize,
  fillHeight,
  floating,
  header,
}: {
  tabId: string;
  item: DockItem;
  title: string;
  onClose: () => void;
  onMinimize?: () => void;
  fillHeight: boolean;
  floating: boolean;
  header?: React.ReactNode;
}) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const canClose = item.denyClose !== true;
  const customHeader = Boolean((item.params as any)?.__customHeader);
  const opaquePanel = Boolean((item.params as any)?.__opaque);
  const openUri = (item.params as any)?.openUri as string | undefined;
  const openRootUri = (item.params as any)?.rootUri as string | undefined;

  return (
    <div
      className={cn(
        "overflow-hidden",
        floating
          ? "rounded-xl border border-border shadow-2xl"
          : "rounded-none border-0 shadow-none",
        fillHeight && "h-full w-full"
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col pt-2 rounded-xl",
          opaquePanel ? "bg-background" : "bg-background/95 backdrop-blur-sm",
          fillHeight && "h-full"
        )}
      >
        {!customHeader ? (
          <StackHeader
            title={title}
            openUri={openUri}
            openRootUri={openRootUri}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            rightSlot={
              <BoardPanelHeaderActions item={item} title={title} tabId={tabId} />
            }
            onClose={canClose ? onClose : undefined}
            showMinimize
            onMinimize={onMinimize}
          >
            {header}
          </StackHeader>
        ) : null}

        <div
          className={cn(
            customHeader ? "p-0" : "p-2",
            fillHeight && "min-h-0 flex-1",
            "min-w-0"
          )}
        >
          {renderDockItem(tabId, item, refreshKey)}
        </div>
      </div>
    </div>
  );
}

/** Build a sibling uri with the new filename. */
function buildRenamedUri(uri: string, nextName: string): string {
  const parsed = parseRenamePath(uri);
  if (!parsed) return uri;
  const parts = parsed.relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return parsed.prefix || uri;
  parts[parts.length - 1] = nextName;
  const nextRelativePath = parts.join("/");
  return parsed.prefix ? `${parsed.prefix}${nextRelativePath}` : nextRelativePath;
}

/** Resolve the parent uri for a file path. */
function getParentUri(uri: string): string {
  const parsed = parseRenamePath(uri);
  if (!parsed) return "";
  const parentPath = getParentRelativePath(parsed.relativePath);
  if (parentPath === null) return parsed.prefix;
  return parsed.prefix ? `${parsed.prefix}${parentPath}` : parentPath;
}

/** Parse a UI path into a prefix and relative path for safe renaming. */
function parseRenamePath(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const parsed = parseScopedProjectPath(trimmed);
  if (!parsed) return null;
  if (isProjectAbsolutePath(trimmed)) {
    if (!parsed.projectId) return null;
    return { prefix: `@[${parsed.projectId}]/`, relativePath: parsed.relativePath };
  }
  // 中文注释：非 @[] 形式一律视为项目相对路径，避免拼出完整 file:// 路径。
  return { prefix: "", relativePath: normalizeProjectRelativePath(trimmed) };
}

// Render the left dock contents for a tab.
export function LeftDock({ tabId }: { tabId: string }) {
  const tab = useTabView(tabId);
  const workspaceId = tab?.workspaceId ?? "";
  const stackHidden = Boolean(tab?.stackHidden);
  const activeStackItemId = tab?.activeStackItemId;
  const removeStackItem = useTabRuntime((s) => s.removeStackItem);
  const queryClient = useQueryClient();
  const renameMutation = useMutation(trpc.fs.rename.mutationOptions());
  const deleteMutation = useMutation(trpc.fs.delete.mutationOptions());
  const [renameDialog, setRenameDialog] = React.useState<{
    tabId: string;
    itemId: string;
    uri: string;
    name: string;
    ext?: string;
    /** Project id for resolving project-relative paths. */
    projectId?: string;
  } | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  // 只订阅面板渲染必需字段，避免切换 tab 时触发无关渲染。
  const base = tab?.base;
  const stack = tab?.stack ?? [];
  // stack 的选中态不再依赖“最后一个=顶部”，而是由 activeStackItemId 决定。
  const activeStackId = activeStackItemId || stack.at(-1)?.id || "";
  const hasOverlay = Boolean(base) && stack.length > 0 && !stackHidden;
  const floating = Boolean(base);

  const requestCloseStackItem = React.useCallback(
    async (item: DockItem | undefined) => {
      if (!item) return;
      const params = item.params as any;
      const uri = typeof params?.uri === "string" ? params.uri : "";
      const name = typeof params?.name === "string" ? params.name : "";
      const ext = typeof params?.ext === "string" ? params.ext : undefined;
      const projectId = typeof params?.projectId === "string" ? params.projectId : undefined;
      const shouldPromptRename =
        item.component === "board-viewer" &&
        Boolean(params?.__pendingRename) &&
        uri &&
        isBoardFolderName(name);
      if (!shouldPromptRename) {
        removeStackItem(tabId, item.id);
        return;
      }
      // 逻辑：空画布直接删除，不弹重命名对话框。
      if (isBoardEmpty(uri)) {
        try {
          await deleteMutation.mutateAsync({
            workspaceId,
            projectId,
            uri,
            recursive: true,
          });
          await queryClient.invalidateQueries({
            queryKey: trpc.fs.list.queryOptions({
              workspaceId,
              projectId,
              uri: getParentUri(uri),
            }).queryKey,
          });
        } catch (error) {
          console.warn("[LeftDock] delete empty board failed", error);
        }
        removeStackItem(tabId, item.id);
        return;
      }
      setRenameValue(getBoardDisplayName(name));
      setRenameDialog({ tabId, itemId: item.id, uri, name, ext, projectId });
    },
    [removeStackItem, tabId, deleteMutation, workspaceId, queryClient]
  );

  const handleRenameConfirm = React.useCallback(async () => {
    if (!renameDialog) return;
    if (!workspaceId) return;
    const rawName = renameValue.trim();
    if (!rawName) return;
    const nextName = ensureBoardFolderName(rawName);
    const nextUri = buildRenamedUri(renameDialog.uri, nextName);
    try {
      await renameMutation.mutateAsync({
        workspaceId,
        projectId: renameDialog.projectId,
        from: renameDialog.uri,
        to: nextUri,
      });
      await queryClient.invalidateQueries({
        queryKey: trpc.fs.list.queryOptions({
          workspaceId,
          projectId: renameDialog.projectId,
          uri: getParentUri(renameDialog.uri),
        }).queryKey,
      });
      setRenameDialog(null);
      removeStackItem(renameDialog.tabId, renameDialog.itemId);
    } catch (error) {
      console.warn("[LeftDock] rename board failed", error);
      toast.error("重命名失败");
    }
  }, [removeStackItem, renameDialog, renameMutation, renameValue, workspaceId, queryClient]);

  /** Delete the board folder and close the stack item. */
  const handleDeleteBoard = React.useCallback(async () => {
    if (!renameDialog) return;
    if (!workspaceId) return;
    try {
      await deleteMutation.mutateAsync({
        workspaceId,
        projectId: renameDialog.projectId,
        uri: renameDialog.uri,
        recursive: true,
      });
      await queryClient.invalidateQueries({
        queryKey: trpc.fs.list.queryOptions({
          workspaceId,
          projectId: renameDialog.projectId,
          uri: getParentUri(renameDialog.uri),
        }).queryKey,
      });
      setConfirmingDelete(false);
      setRenameDialog(null);
      removeStackItem(renameDialog.tabId, renameDialog.itemId);
    } catch (error) {
      console.warn("[LeftDock] delete board failed", error);
      toast.error("删除画布失败");
    }
  }, [removeStackItem, renameDialog, deleteMutation, workspaceId, queryClient]);

  React.useEffect(() => {
    if (stack.length === 0) return;
    if (stackHidden) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      if (isEditableTarget(event.target)) return;
      // 按下 ESC 时最小化当前 stack 面板。
      event.preventDefault();
      requestStackMinimize(tabId);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [stack.length, stackHidden, tabId]);

  if (!tab) return null;

  return (
    <div
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
      data-allow-context-menu
    >
      <div
        className={cn(
          "h-full w-full p-2 transition-all duration-200",
          "min-w-0",
          hasOverlay && "pointer-events-none select-none blur-sm opacity-80"
        )}
      >
        {base ? renderDockItem(tabId, base) : null}
      </div>

      {stack.length > 0 ? (
        <div
          className={cn(
            "absolute inset-0",
            // stack 最小化后仍保持挂载（便于恢复状态），但不能挡住 base 的点击/交互。
            stackHidden && "pointer-events-none",
          )}
          style={{ zIndex: 20 }}
          aria-hidden={stackHidden}
        >
          {stack.map((item) => {
            const isActive = item.id === activeStackId;
            const visible = !stackHidden && isActive;
            // 最小化时保留当前面板节点，便于测量还原动画的目标位置。
            const keepAlive = stackHidden && isActive;
            return (
              <div
                key={item.id}
                // stack 不再堆叠，只显示一个；其它 stack 保持挂载但隐藏，便于通过 Header 右上角按钮切换。
                className={cn(
                  "absolute inset-0",
                  base ? "px-5 pt-6 pb-4" : "px-2",
                  visible ? "block" : keepAlive ? "opacity-0" : "hidden"
                )}
                data-stack-panel={isActive ? tabId : undefined}
                data-stack-item={isActive ? item.id : undefined}
              >
                <PanelFrame
                  tabId={tabId}
                  item={item}
                  title={item.title ?? getPanelTitle(item.component)}
                  onClose={() => requestCloseStackItem(item)}
                  onMinimize={() => requestStackMinimize(tabId)}
                  fillHeight
                  floating={floating}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <Dialog
        open={Boolean(renameDialog)}
        onOpenChange={(open) => {
          if (open) return;
          setConfirmingDelete(false);
          setRenameDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名画布</DialogTitle>
            <DialogDescription>请输入新的画布名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleRenameConfirm();
                }
              }}
            />
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {confirmingDelete ? (
              <>
                <span className="text-sm text-destructive">确定要删除此画布吗？</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteBoard}
                    disabled={deleteMutation.isPending}
                  >
                    确定删除
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  type="button"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  删除画布
                </Button>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" type="button">
                      取消
                    </Button>
                  </DialogClose>
                  <Button onClick={handleRenameConfirm} disabled={renameMutation.isPending}>
                    确定
                  </Button>
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
