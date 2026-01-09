"use client";

import { memo } from "react";
import { BoardCanvas } from "./core/BoardCanvas";
import { PlaceholderNodeDefinition } from "./nodes/PlaceholderNode";
import { ImageNodeDefinition } from "./nodes/ImageNode";
import { CalendarNodeDefinition } from "./nodes/CalendarNode";
import { LinkNodeDefinition } from "./nodes/LinkNode";
import { GroupNodeDefinition, ImageGroupNodeDefinition } from "./nodes/GroupNode";
import { StrokeNodeDefinition } from "./nodes/StrokeNode";
import { TextNodeDefinition } from "./nodes/TextNode";
import { useWorkspace } from "@/components/workspace/workspaceContext";

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
}

/** Render a board canvas backed by a board folder. */
const BoardFileViewer = memo(function BoardFileViewer({
  boardFolderUri,
  boardFileUri,
  projectId,
  rootUri,
  panelKey,
}: BoardFileViewerProps) {
  const { workspace } = useWorkspace();

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
        nodes={[
          PlaceholderNodeDefinition,
          ImageNodeDefinition,
          CalendarNodeDefinition,
          LinkNodeDefinition,
          StrokeNodeDefinition,
          TextNodeDefinition,
          GroupNodeDefinition,
          ImageGroupNodeDefinition,
        ]}
      />
    </div>
  );
});

export default BoardFileViewer;
