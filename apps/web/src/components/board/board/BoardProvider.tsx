"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "@teatime-ai/api";

import type { CanvasEngine } from "../engine/CanvasEngine";

/** React context storing the current canvas engine. */
const BoardContext = createContext<CanvasEngine | null>(null);
/** tRPC client type used by board features. */
export type BoardTrpcClient = TRPCClient<AppRouter>;
/** React context storing optional app dependencies (e.g., tRPC). */
const BoardAppContext = createContext<{ trpc?: BoardTrpcClient } | null>(null);

export type BoardProviderProps = {
  /** Engine instance to share across board components. */
  engine: CanvasEngine;
  /** Optional injected tRPC instance. */
  trpc?: BoardTrpcClient;
  /** Children rendered within the provider. */
  children: ReactNode;
};

/** Provide the canvas engine to descendant components. */
export function BoardProvider({ engine, trpc, children }: BoardProviderProps) {
  return (
    <BoardAppContext.Provider value={{ trpc }}>
      <BoardContext.Provider value={engine}>{children}</BoardContext.Provider>
    </BoardAppContext.Provider>
  );
}

/** Access the current canvas engine instance. */
export function useBoardEngine(): CanvasEngine {
  const engine = useContext(BoardContext);
  if (!engine) {
    throw new Error("useBoardEngine must be used within BoardProvider.");
  }
  return engine;
}

/** Access injected tRPC instance for board features. */
export function useBoardTrpc<TTrpc = unknown>(): TTrpc | undefined {
  const context = useContext(BoardAppContext);
  return context?.trpc as TTrpc | undefined;
}
