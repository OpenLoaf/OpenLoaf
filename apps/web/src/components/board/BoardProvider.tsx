"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { CanvasEngine } from "./CanvasEngine";

/** React context storing the current canvas engine. */
const BoardContext = createContext<CanvasEngine | null>(null);

export type BoardProviderProps = {
  /** Engine instance to share across board components. */
  engine: CanvasEngine;
  /** Children rendered within the provider. */
  children: ReactNode;
};

/** Provide the canvas engine to descendant components. */
export function BoardProvider({ engine, children }: BoardProviderProps) {
  return <BoardContext.Provider value={engine}>{children}</BoardContext.Provider>;
}

/** Access the current canvas engine instance. */
export function useBoardEngine(): CanvasEngine {
  const engine = useContext(BoardContext);
  if (!engine) {
    throw new Error("useBoardEngine must be used within BoardProvider.");
  }
  return engine;
}
