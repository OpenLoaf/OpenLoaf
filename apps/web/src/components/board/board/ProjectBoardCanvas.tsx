"use client";

import { memo } from "react";

import { BoardCanvas } from "./BoardCanvas";
import type { BoardTrpcClient } from "./BoardProvider";
import { PlaceholderNodeDefinition } from "../nodes/PlaceholderNode";
import { ImageNodeDefinition } from "../nodes/ImageNode";
import { CalendarNodeDefinition } from "../nodes/CalendarNode";
import { LinkNodeDefinition } from "../nodes/LinkNode";
import { GroupNodeDefinition, ImageGroupNodeDefinition } from "../nodes/GroupNode";
import { StrokeNodeDefinition } from "../nodes/StrokeNode";

export interface ProjectBoardCanvasProps {
  /** Loading state for the project page. */
  isLoading: boolean;
  /** Active state for the project tab. */
  isActive: boolean;
  /** Optional injected tRPC instance. */
  trpc?: BoardTrpcClient;
  /** Workspace id used for storage isolation. */
  workspaceId?: string;
  /** Current project page id. */
  pageId?: string;
  /** Current project page title. */
  pageTitle: string;
}

/** Render the new board canvas inside the project page. */
const ProjectBoardCanvas = memo(function ProjectBoardCanvas({
  isLoading,
  isActive,
  trpc,
  workspaceId,
  pageId,
  pageTitle,
}: ProjectBoardCanvasProps) {
  if (isLoading) return null;

  return (
    <div data-board-active={isActive ? "true" : "false"} className="h-full w-full">
      <BoardCanvas
        key={pageId ?? "board"}
        className="h-full w-full"
        nodes={[
          PlaceholderNodeDefinition,
          ImageNodeDefinition,
          CalendarNodeDefinition,
          LinkNodeDefinition,
          StrokeNodeDefinition,
          GroupNodeDefinition,
          ImageGroupNodeDefinition,
        ]}
        trpc={trpc}
        workspaceId={workspaceId}
        boardId={pageId}
      />
    </div>
  );
});

export default ProjectBoardCanvas;
