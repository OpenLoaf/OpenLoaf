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

import { memo } from "react";

import { BoardCanvas } from "./BoardCanvas";
import { BOARD_NODE_DEFINITIONS } from "./board-nodes";

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
        nodes={BOARD_NODE_DEFINITIONS}
        workspaceId={workspaceId}
        projectId={projectId}
        rootUri={rootUri}
        boardId={rootUri ?? projectId}
      />
    </div>
  );
});

export default ProjectBoardCanvas;
