"use client";

import { memo } from "react";
import { BoardCanvas } from "./core/BoardCanvas";
import { BOARD_NODE_DEFINITIONS } from "./core/board-nodes";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

export interface BoardFileViewerProps {
  /** Target board folder uri. */
  boardFolderUri?: string;
  /** Target board file uri. */
  boardFileUri?: string;
  /** Optional display name. */
  name?: string;
  /** Current project id. */
  projectId?: string;
  /** Project root uri for resolving attachments. */
  rootUri?: string;
  /** Panel key used for header actions. */
  panelKey?: string;
  /** Current tab id for stack visibility. */
  tabId?: string;
}

/** Render a board canvas backed by a board folder. */
const BoardFileViewer = memo(function BoardFileViewer({
  boardFolderUri,
  boardFileUri,
  projectId,
  rootUri,
  panelKey,
  tabId,
}: BoardFileViewerProps) {
  const { workspace } = useWorkspace();
  const runtimeStack = useTabRuntime((state) =>
    tabId ? state.runtimeByTabId[tabId]?.stack : undefined,
  );
  const runtimeActiveStackId = useTabRuntime((state) =>
    tabId ? state.runtimeByTabId[tabId]?.activeStackItemId : undefined,
  );
  const stackHidden = useTabRuntime((state) =>
    tabId ? Boolean(state.runtimeByTabId[tabId]?.stackHidden) : false,
  );
  const stack = Array.isArray(runtimeStack) ? runtimeStack : [];
  const isStackItem = Boolean(panelKey && stack.some((item) => item.id === panelKey));
  const activeStackId =
    typeof runtimeActiveStackId === "string"
      ? runtimeActiveStackId || stack.at(-1)?.id || ""
      : stack.at(-1)?.id || "";
  const uiHidden = stackHidden && isStackItem && activeStackId === panelKey;

  if (!workspace?.id) {
    return <div className="h-full w-full p-4 text-muted-foreground">工作区加载中</div>;
  }

  if (!boardFolderUri || !boardFileUri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择画布</div>;
  }

  return (
    <div className="h-full w-full bg-background">
      <BoardCanvas
        className="h-full w-full"
        workspaceId={workspace.id}
        boardId={boardFolderUri}
        boardFolderUri={boardFolderUri}
        boardFileUri={boardFileUri}
        projectId={projectId}
        rootUri={rootUri}
        panelKey={panelKey}
        uiHidden={uiHidden}
        nodes={BOARD_NODE_DEFINITIONS}
      />
    </div>
  );
});

export default BoardFileViewer;
