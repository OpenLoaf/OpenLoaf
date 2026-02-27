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
import { Sparkles, Terminal, Search, LayoutDashboard } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import {
  ensureBoardFolderName,
  BOARD_INDEX_FILE_NAME,
  BOARD_ASSETS_DIR_NAME,
  getBoardDisplayName,
} from "@/lib/file-name";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import {
  buildChildUri,
  resolveFileUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
} from "@openloaf/api/common";
import type { DesktopScope } from "../types";

export interface QuickActionsWidgetProps {
  /** Desktop scope (workspace or project). */
  scope: DesktopScope;
}

/** Render a quick actions widget (MVP placeholder). */
export default function QuickActionsWidget({ scope }: QuickActionsWidgetProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const activeTabId = useTabs((state) => state.activeTabId);
  const tabs = useTabs((state) => state.tabs);
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const [creating, setCreating] = React.useState(false);
  const terminalStatus = useTerminalStatus();

  /** Create a new board and open it in the current tab stack. */
  const handleCreateCanvas = React.useCallback(async () => {
    if (scope !== "project") {
      toast.error("当前工作台不支持创建画布");
      return;
    }
    if (!workspaceId) {
      toast.error("未找到工作区");
      return;
    }
    // 逻辑：从当前激活 tab 获取项目上下文。
    const activeTab = tabs.find(
      (tab) => tab.id === activeTabId && tab.workspaceId === workspaceId,
    );
    if (!activeTab) {
      toast.error("未找到当前标签页");
      return;
    }
    const runtime = useTabRuntime.getState().runtimeByTabId[activeTab.id];
    if (!runtime?.base?.id?.startsWith("project:")) {
      toast.error("请先打开一个项目标签页");
      return;
    }
    const baseParams = (runtime.base.params ?? {}) as Record<string, unknown>;
    const projectId = baseParams.projectId as string | undefined;
    const rootUri = baseParams.rootUri as string | undefined;
    if (!projectId) {
      toast.error("当前标签页缺少项目信息");
      return;
    }

    setCreating(true);
    try {
      // 逻辑：使用 yyyyMMdd-hhmmss 格式命名，兼顾可读性与唯一性。
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const folderName = ensureBoardFolderName(`${ts}-画布`);
      const boardFolderUri = buildChildUri("", folderName);
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      const assetsUri = buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME);

      await mkdirMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: boardFolderUri,
        recursive: true,
      });
      await mkdirMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: assetsUri,
        recursive: true,
      });
      await writeBinaryMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: boardFileUri,
        contentBase64: "",
      });

      const displayName = getBoardDisplayName(folderName);
      // 逻辑：将画布推入当前 tab 的 stack，而非新建 tab。
      useTabRuntime.getState().pushStackItem(activeTab.id, {
        id: boardFolderUri,
        component: "board-viewer",
        title: displayName,
        params: {
          uri: boardFolderUri,
          boardFolderUri,
          boardFileUri,
          name: folderName,
          projectId,
          rootUri,
          __opaque: true,
          __pendingRename: true,
        },
      });
    } catch {
      toast.error("创建画布失败");
    } finally {
      setCreating(false);
    }
  }, [scope, workspaceId, activeTabId, tabs, mkdirMutation, writeBinaryMutation]);

  /** Open the global search overlay. */
  const handleOpenSearch = React.useCallback(() => {
    useGlobalOverlay.getState().setSearchOpen(true);
  }, []);

  /** Open a terminal inside the current tab stack. */
  const handleOpenTerminal = React.useCallback(() => {
    if (!activeTabId) {
      toast.error("未找到当前标签页");
      return;
    }
    if (terminalStatus.isLoading) {
      toast.message("正在获取终端状态");
      return;
    }
    if (!terminalStatus.enabled) {
      toast.error("终端功能未开启");
      return;
    }

    // 逻辑：优先使用当前项目标签页的 rootUri，否则回退到工作区根目录。
    const activeTab = tabs.find(
      (tab) => tab.id === activeTabId && tab.workspaceId === workspaceId,
    );
    const runtime = activeTab ? useTabRuntime.getState().runtimeByTabId[activeTab.id] : null;
    const baseParams = (runtime?.base?.params ?? {}) as Record<string, unknown>;
    const rootUri =
      (typeof baseParams.rootUri === "string" ? baseParams.rootUri : undefined) ??
      workspace?.rootUri ??
      "";
    const pwdUri = rootUri ? resolveFileUriFromRoot(rootUri, rootUri) : "";
    if (!pwdUri) {
      toast.error("未找到工作区目录");
      return;
    }

    useTabRuntime.getState().pushStackItem(activeTabId, {
      id: TERMINAL_WINDOW_PANEL_ID,
      sourceKey: TERMINAL_WINDOW_PANEL_ID,
      component: TERMINAL_WINDOW_COMPONENT,
      title: "终端",
      params: {
        __customHeader: true,
        __open: { pwdUri },
      },
    });
  }, [activeTabId, terminalStatus, tabs, workspace?.rootUri, workspaceId]);

  /** Open/ensure right AI chat panel visible and focus the input. */
  const handleOpenAiChat = React.useCallback(() => {
    if (!activeTabId) {
      toast.error("未找到当前标签页");
      return;
    }
    const runtime = useTabRuntime.getState().runtimeByTabId[activeTabId];
    if (!runtime) {
      toast.error("当前标签页无运行时上下文");
      return;
    }
    // 逻辑：仅在 collapsed 时展开右侧 chat panel（已展开则保持）；Mod+B toggle 逻辑同源。
    if (runtime.rightChatCollapsed) {
      useTabRuntime.getState().setTabRightChatCollapsed(activeTabId, false);
    }
    // 逻辑：延迟发出 focus 请求，等待 panel 展开动画与输入框挂载完成。
    const requestFocus = () => {
      window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input"));
    };
    if (runtime.rightChatCollapsed) {
      setTimeout(requestFocus, 180);
      setTimeout(requestFocus, 360);
      return;
    }
    requestFocus();
  }, [activeTabId]);

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-2 rounded-xl bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] hover:text-[#1a73e8] dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70 transition-colors duration-150"
          onClick={handleOpenSearch}
        >
          <Search className="size-4" />
          搜索
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-2 rounded-xl bg-[#f3e8fd] text-[#9334e6] hover:bg-[#e9d5fb] hover:text-[#9334e6] dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60 transition-colors duration-150"
          onClick={handleOpenTerminal}
        >
          <Terminal className="size-4" />
          终端
        </Button>
        {scope === "project" ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 justify-start gap-2 rounded-xl bg-[#fef7e0] text-[#e37400] hover:bg-[#fcefc8] hover:text-[#e37400] dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors duration-150"
            onClick={handleCreateCanvas}
            disabled={creating}
          >
            <LayoutDashboard className="size-4" />
            {creating ? "创建中…" : "画布"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-2 rounded-xl bg-[#e6f4ea] text-[#188038] hover:bg-[#ceead6] hover:text-[#188038] dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition-colors duration-150"
          onClick={handleOpenAiChat}
        >
          <Sparkles className="size-4" />
          AI 对话
        </Button>
      </div>
    </div>
  );
}
