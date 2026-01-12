"use client";

import { memo } from "react";
import { BoardCanvas } from "./core/BoardCanvas";
import { ImageNodeDefinition } from "./nodes/ImageNode";
import { CalendarNodeDefinition } from "./nodes/CalendarNode";
import { LinkNodeDefinition } from "./nodes/LinkNode";
import { GroupNodeDefinition, ImageGroupNodeDefinition } from "./nodes/GroupNode";
import { StrokeNodeDefinition } from "./nodes/StrokeNode";
import { TextNodeDefinition } from "./nodes/TextNode";
import { ImagePromptGenerateNodeDefinition } from "./nodes/ImagePromptGenerateNode";
import { ImageGenerateNodeDefinition } from "./nodes/ImageGenerateNode";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";

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
  const stackHidden = useTabs((state) =>
    tabId ? Boolean(state.stackHiddenByTabId[tabId]) : false
  );
  const isStackItem = useTabs((state) => {
    if (!tabId || !panelKey) return false;
    const tab = state.tabs.find((item) => item.id === tabId);
    return Boolean(tab?.stack?.some((item) => item.id === panelKey));
  });
  const activeStackId = useTabs((state) => {
    if (!tabId) return "";
    const tab = state.tabs.find((item) => item.id === tabId);
    const stack = tab?.stack ?? [];
    return state.activeStackItemIdByTabId[tabId] || stack.at(-1)?.id || "";
  });
  const uiHidden = stackHidden && isStackItem && activeStackId === panelKey;

  if (!boardFolderUri || !boardFileUri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择画布</div>;
  }

  return (
    <div className="h-full w-full bg-background">
      <BoardCanvas
        className="h-full w-full"
        workspaceId={workspace?.id}
        boardId={boardFolderUri}
        boardFolderUri={boardFolderUri}
        boardFileUri={boardFileUri}
        projectId={projectId}
        rootUri={rootUri}
        panelKey={panelKey}
        uiHidden={uiHidden}
        nodes={[
          ImageNodeDefinition,
          CalendarNodeDefinition,
          LinkNodeDefinition,
          StrokeNodeDefinition,
          TextNodeDefinition,
          ImagePromptGenerateNodeDefinition,
          ImageGenerateNodeDefinition,
          GroupNodeDefinition,
          ImageGroupNodeDefinition,
        ]}
      />
    </div>
  );
});

export default BoardFileViewer;
