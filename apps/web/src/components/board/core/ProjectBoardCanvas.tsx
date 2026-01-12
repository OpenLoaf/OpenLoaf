"use client";

import { memo } from "react";

import { BoardCanvas } from "./BoardCanvas";
import { ImageNodeDefinition } from "../nodes/ImageNode";
import { CalendarNodeDefinition } from "../nodes/CalendarNode";
import { LinkNodeDefinition } from "../nodes/LinkNode";
import { GroupNodeDefinition, ImageGroupNodeDefinition } from "../nodes/GroupNode";
import { StrokeNodeDefinition } from "../nodes/StrokeNode";
import { TextNodeDefinition } from "../nodes/TextNode";
import { ImagePromptGenerateNodeDefinition } from "../nodes/ImagePromptGenerateNode";
import { ImageGenerateNodeDefinition } from "../nodes/ImageGenerateNode";

export interface ProjectBoardCanvasProps {
  /** Loading state for the project page. */
  isLoading: boolean;
  /** Active state for the project tab. */
  isActive: boolean;
  /** Workspace id used for storage isolation. */
  workspaceId?: string;
  /** Current project id. */
  projectId?: string;
  /** Project root URI for storage scoping. */
  rootUri?: string;
  /** Current project page title. */
  pageTitle: string;
}

/** Render the new board canvas inside the project page. */
const ProjectBoardCanvas = memo(function ProjectBoardCanvas({
  isLoading,
  isActive,
  workspaceId,
  projectId,
  rootUri,
  pageTitle,
}: ProjectBoardCanvasProps) {
  if (isLoading) return null;

  return (
    <div data-board-active={isActive ? "true" : "false"} className="h-full w-full">
      <BoardCanvas
        key={rootUri ?? projectId ?? "board"}
        className="h-full w-full"
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
        workspaceId={workspaceId}
        projectId={projectId}
        rootUri={rootUri}
        boardId={rootUri ?? projectId}
      />
    </div>
  );
});

export default ProjectBoardCanvas;
