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
import type { Workspace } from "@openloaf/api/types/workspace";

export const WorkspaceContext = createContext<{
  workspace: Workspace;
  isLoading: boolean;
}>({
  workspace: {} as Workspace,
  isLoading: true,
});

export const useWorkspace = () => useContext(WorkspaceContext);

