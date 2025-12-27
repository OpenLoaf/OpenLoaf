"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { CanvasEngine } from "../engine/CanvasEngine";

export type ImagePreviewPayload = {
  /** Original image data url. */
  originalSrc: string;
  /** Preview image data url. */
  previewSrc: string;
  /** File name for alt text. */
  fileName: string;
};

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
};

// 逻辑：节点事件由节点自身处理，跨层 UI 通过 actions 统一触发，避免画布层特判。
/** React context storing the current board metadata. */
const BoardContext = createContext<BoardContextValue | null>(null);

export type BoardProviderProps = {
  /** Engine instance to share across board components. */
  engine: CanvasEngine;
  /** Action handlers exposed to node components. */
  actions: BoardActions;
  /** Children rendered within the provider. */
  children: ReactNode;
};

/** Provide the canvas engine to descendant components. */
export function BoardProvider({ engine, actions, children }: BoardProviderProps) {
  return (
    <BoardContext.Provider value={{ engine, actions }}>
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
