"use client";

import * as React from "react";
import { Sparkles, Terminal, Search, LayoutDashboard } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import {
  ensureBoardFolderName,
  BOARD_INDEX_FILE_NAME,
  BOARD_ASSETS_DIR_NAME,
  getBoardDisplayName,
} from "@/lib/file-name";
import { buildChildUri } from "@/components/project/filesystem/utils/file-system-utils";

/** Render a quick actions widget (MVP placeholder). */
export default function QuickActionsWidget() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const activeTabId = useTabs((state) => state.activeTabId);
  const tabs = useTabs((state) => state.tabs);
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const [creating, setCreating] = React.useState(false);

  /** Create a new board and open it in the current tab stack. */
  const handleCreateCanvas = React.useCallback(async () => {
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
  }, [workspaceId, activeTabId, tabs, mkdirMutation, writeBinaryMutation]);

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-11 justify-start gap-2"
        >
          <Search className="size-4" />
          Search
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 justify-start gap-2"
        >
          <Terminal className="size-4" />
          Terminal
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 justify-start gap-2"
          onClick={handleCreateCanvas}
          disabled={creating}
        >
          <LayoutDashboard className="size-4" />
          {creating ? "创建中…" : "Canvas"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 justify-start gap-2"
        >
          <Sparkles className="size-4" />
          Ask AI
        </Button>
      </div>
    </div>
  );
}
