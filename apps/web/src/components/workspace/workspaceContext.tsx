"use client";

import { createContext, useContext } from "react";
import type { Workspace } from "@tenas-ai/api/types/workspace";

export const WorkspaceContext = createContext<{
  workspace: Workspace;
  isLoading: boolean;
}>({
  workspace: {} as Workspace,
  isLoading: true,
});

export const useWorkspace = () => useContext(WorkspaceContext);

