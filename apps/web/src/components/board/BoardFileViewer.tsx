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
import { isBoardFileExt } from "@/lib/file-name";
import { useWorkspace } from "@/components/workspace/workspaceContext";

export interface BoardFileViewerProps {
  /** Target board file uri. */
  uri?: string;
  /** Optional display name. */
  name?: string;
  /** File extension. */
  ext?: string;
}

/** Render a board canvas backed by a .ttboard file. */
const BoardFileViewer = memo(function BoardFileViewer({ uri, ext }: BoardFileViewerProps) {
  const { workspace } = useWorkspace();

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择画布</div>;
  }

  if (!isBoardFileExt(ext)) {
    return <div className="h-full w-full p-4 text-muted-foreground">不支持的画布类型</div>;
  }

  return (
    <div className="h-full w-full bg-background">
      <BoardCanvas
        className="h-full w-full"
        workspaceId={workspace?.id}
        boardId={uri}
        boardFileUri={uri}
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
