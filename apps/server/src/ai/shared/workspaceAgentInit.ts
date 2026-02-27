/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { fileURLToPath } from 'node:url'
import {
  getActiveWorkspaceConfig,
  resolveWorkspaceRootPath,
} from '@openloaf/api/services/workspaceConfig'
import {
  ensureDefaultAgentFiles,
  ensureSystemAgentFiles,
} from '@/ai/shared/defaultAgentResolver'

/**
 * Initialize workspace agents:
 * 1. Ensure all system agent folders exist
 * 2. Ensure default (master) agent files exist
 */
function initWorkspaceAgents(rootPath: string): void {
  ensureSystemAgentFiles(rootPath)
  ensureDefaultAgentFiles(rootPath)
}

/**
 * Ensure the active workspace has default agent files.
 * Called at server startup.
 */
export function ensureActiveWorkspaceDefaultAgent(): void {
  try {
    const active = getActiveWorkspaceConfig()
    if (!active?.rootUri) return
    const rootPath = resolveWorkspaceRootPath(active.rootUri)
    initWorkspaceAgents(rootPath)
  } catch {
    // 逻辑：启动时静默忽略，不影响服务启动。
  }
}

/**
 * Ensure a workspace has default agent files by its rootUri.
 * Called when creating or switching workspaces.
 */
export function ensureWorkspaceDefaultAgentByRootUri(
  rootUri: string,
): void {
  if (!rootUri) return
  try {
    const rootPath = fileURLToPath(rootUri)
    initWorkspaceAgents(rootPath)
  } catch {
    // 逻辑：静默忽略，不影响 workspace 操作。
  }
}
