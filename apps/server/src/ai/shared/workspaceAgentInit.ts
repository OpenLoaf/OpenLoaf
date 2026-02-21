import { fileURLToPath } from 'node:url'
import {
  getActiveWorkspaceConfig,
  resolveWorkspaceRootPath,
} from '@tenas-ai/api/services/workspaceConfig'
import {
  ensureDefaultAgentFiles,
  migrateDefaultToMain,
  ensureSystemAgentFiles,
} from '@/ai/shared/defaultAgentResolver'

/**
 * Initialize workspace agents:
 * 1. Migrate legacy 'default' folder to 'main'
 * 2. Ensure all system agent folders exist
 * 3. Ensure default (main) agent files exist
 */
function initWorkspaceAgents(rootPath: string): void {
  migrateDefaultToMain(rootPath)
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
