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

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type {
  BoardFileContext,
  ImagePreviewPayload,
} from "../board-contracts";
import type { CanvasEngine } from "../engine/CanvasEngine";
export type { BoardFileContext, ImagePreviewPayload } from "../board-contracts";

export type BoardActions = {
  /** Open the fullscreen image preview. */
  openImagePreview: (payload: ImagePreviewPayload) => void;
  /** Close the fullscreen image preview. */
  closeImagePreview: () => void;
};

export type BoardContextValue = {
  /** Engine instance shared by board components. */
  engine: CanvasEngine;
  /** Action handlers exposed to node components. */
  actions: BoardActions;
  /** File scope metadata for board nodes. */
  fileContext?: BoardFileContext;
};

// 逻辑：节点事件由节点自身处理，跨层 UI 通过 actions 统一触发，避免画布层特判。
/** React context storing the current board metadata. */
const BoardContext = createContext<BoardContextValue | null>(null);

export type BoardProviderProps = {
  /** Engine instance to share across board components. */
  engine: CanvasEngine;
  /** Action handlers exposed to node components. */
  actions: BoardActions;
  /** File scope metadata for board nodes. */
  fileContext?: BoardFileContext;
  /** Children rendered within the provider. */
  children: ReactNode;
};

/** Provide the canvas engine to descendant components. */
export function BoardProvider({
  engine,
  actions,
  fileContext,
  children,
}: BoardProviderProps) {
  return (
    <BoardContext.Provider value={{ engine, actions, fileContext }}>
      {children}
    </BoardContext.Provider>
  );
}

/** Access the board context metadata. */
export function useBoardContext(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error("useBoardContext must be used within BoardProvider.");
  }
  return context;
}

/** Access the current canvas engine instance. */
export function useBoardEngine(): CanvasEngine {
  return useBoardContext().engine;
}
