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
import i18next from "i18next";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { trpc } from "@/utils/trpc";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { useProjectStorageRootUri } from "@/hooks/use-project-storage-root-uri";
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
  /** Desktop scope (global or project). */
  scope: DesktopScope;
}

/** Render a quick actions widget (MVP placeholder). */
export default function QuickActionsWidget({ scope }: QuickActionsWidgetProps) {
  const { t } = useTranslation('desktop');
  const projectStorageRootUri = useProjectStorageRootUri();
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const [creating, setCreating] = React.useState(false);
  const terminalStatus = useTerminalStatus();

  /** Create a new board and open it in the current tab stack. */
  const handleCreateCanvas = React.useCallback(async () => {
    if (scope !== "project") {
      toast.error(t('quickActions.cannotCreateCanvas'));
      return;
    }
    // 逻辑：从当前布局获取项目上下文。
    const layoutState = useLayoutState.getState();
    if (!layoutState.base?.id?.startsWith("project:")) {
      toast.error(t('quickActions.openProjectTab'));
      return;
    }
    const baseParams = (layoutState.base.params ?? {}) as Record<string, unknown>;
    const projectId = baseParams.projectId as string | undefined;
    const rootUri = baseParams.rootUri as string | undefined;
    if (!projectId) {
      toast.error(t('quickActions.noProjectInfo'));
      return;
    }

    setCreating(true);
    try {
      const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const canvasLabel = i18next.t("nav:canvasList.defaultName");
      const folderName = ensureBoardFolderName(`${canvasLabel}_${randomSuffix}`);
      const boardFolderUri = buildChildUri("", folderName);
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      const assetsUri = buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME);

      await mkdirMutation.mutateAsync({
        projectId,
        uri: boardFolderUri,
        recursive: true,
      });
      await mkdirMutation.mutateAsync({
        projectId,
        uri: assetsUri,
        recursive: true,
      });
      await writeBinaryMutation.mutateAsync({
        projectId,
        uri: boardFileUri,
        contentBase64: "",
      });

      const displayName = getBoardDisplayName(folderName);
      // 逻辑：将画布推入 stack，而非新建 tab。
      useLayoutState.getState().pushStackItem({
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
      toast.error(t('quickActions.createCanvasFailed'));
    } finally {
      setCreating(false);
    }
  }, [scope, mkdirMutation, t, writeBinaryMutation]);

  /** Open the global search overlay. */
  const handleOpenSearch = React.useCallback(() => {
    useGlobalOverlay.getState().setSearchOpen(true);
  }, []);

  /** Open a terminal inside the current tab stack. */
  const handleOpenTerminal = React.useCallback(() => {
    if (terminalStatus.isLoading) {
      toast.message(t('quickActions.fetchingTerminalStatus'));
      return;
    }
    if (!terminalStatus.enabled) {
      toast.error(t('quickActions.terminalDisabled'));
      return;
    }

    // 逻辑：优先使用当前项目标签页的 rootUri，否则回退到默认项目存储根目录。
    const layoutState = useLayoutState.getState();
    const baseParams = (layoutState.base?.params ?? {}) as Record<string, unknown>;
    const rootUri =
      (typeof baseParams.rootUri === "string" ? baseParams.rootUri : undefined) ??
      projectStorageRootUri ??
      "";
    const pwdUri = rootUri ? resolveFileUriFromRoot(rootUri, rootUri) : "";
    if (!pwdUri) {
      toast.error(t('quickActions.noProjectSpaceDir'));
      return;
    }

    useLayoutState.getState().pushStackItem({
      id: TERMINAL_WINDOW_PANEL_ID,
      sourceKey: TERMINAL_WINDOW_PANEL_ID,
      component: TERMINAL_WINDOW_COMPONENT,
      title: t('quickActions.terminal'),
      params: {
        __customHeader: true,
        __open: { pwdUri },
      },
    });
  }, [terminalStatus, t, projectStorageRootUri]);

  /** Open/ensure right AI chat panel visible and focus the input. */
  const handleOpenAiChat = React.useCallback(() => {
    const layoutState = useLayoutState.getState();
    // 逻辑：仅在 collapsed 时展开右侧 chat panel（已展开则保持）；Mod+B toggle 逻辑同源。
    if (layoutState.rightChatCollapsed) {
      useLayoutState.getState().setRightChatCollapsed(false);
    }
    // 逻辑：延迟发出 focus 请求，等待 panel 展开动画与输入框挂载完成。
    const requestFocus = () => {
      window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input"));
    };
    if (layoutState.rightChatCollapsed) {
      setTimeout(requestFocus, 180);
      setTimeout(requestFocus, 360);
      return;
    }
    requestFocus();
  }, []);

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-2 rounded-xl bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover hover:text-ol-blue transition-colors duration-150"
          onClick={handleOpenSearch}
        >
          <Search className="size-4" />
          {t('quickActions.search')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-2 rounded-xl bg-ol-purple-bg text-ol-purple hover:bg-ol-purple-bg-hover hover:text-ol-purple transition-colors duration-150"
          onClick={handleOpenTerminal}
        >
          <Terminal className="size-4" />
          {t('quickActions.terminal')}
        </Button>
        {scope === "project" ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 justify-start gap-2 rounded-xl bg-ol-amber-bg text-ol-amber hover:bg-ol-amber-bg-hover hover:text-ol-amber transition-colors duration-150"
            onClick={handleCreateCanvas}
            disabled={creating}
          >
            <LayoutDashboard className="size-4" />
            {creating ? t('quickActions.creating') : t('quickActions.canvas')}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="h-11 justify-start gap-2 rounded-xl bg-ol-green-bg text-ol-green hover:bg-ol-green-bg-hover hover:text-ol-green transition-colors duration-150"
          onClick={handleOpenAiChat}
        >
          <Sparkles className="size-4" />
          {t('quickActions.aiChat')}
        </Button>
      </div>
    </div>
  );
}
