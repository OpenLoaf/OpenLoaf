/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getDefaultWorkspaceRootDir, getLegacyWorkspaceRootDir, getOpenLoafRootDir } from "@openloaf/config";
import { workspaceBase, type Workspace } from "../types/workspace";

/** Schema for workspaces.json. */
const WorkspacesFileSchema = z.object({
  workspaces: z.array(workspaceBase),
});

type WorkspacesFile = z.infer<typeof WorkspacesFileSchema>;

/** Cache the last valid workspace config to avoid id flapping. */
let cachedWorkspaces: WorkspacesFile | null = null;

/** Resolve config directory. */
function getConfigDir(): string {
  return getOpenLoafRootDir();
}

/** Resolve workspaces.json path. */
function getWorkspacesPath(): string {
  return path.join(getConfigDir(), "workspaces.json");
}

/** Build default workspace root uri under config directory. */
function resolveDefaultWorkspaceRootUri(): string {
  const rootPath = getDefaultWorkspaceRootDir();
  // 逻辑：默认工作区目录固定在用户路径，便于统一管理。
  mkdirSync(rootPath, { recursive: true });
  return pathToFileURL(rootPath).href;
}

function normalizeLegacyWorkspaceUri(value?: string): string | undefined {
  if (!value) return value;
  const legacyRoot = pathToFileURL(getLegacyWorkspaceRootDir()).href;
  const nextRoot = resolveDefaultWorkspaceRootUri();
  if (!value.startsWith(legacyRoot)) return value;
  return value.replace(legacyRoot, nextRoot);
}

function normalizeProjectRoots(projects?: Record<string, string>): Record<string, string> {
  if (!projects) return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(projects)) {
    normalized[key] = normalizeLegacyWorkspaceUri(value) ?? value;
  }
  return normalized;
}

/** Ensure workspaces.json exists with a default workspace. */
function ensureDefaultWorkspaces(): WorkspacesFile {
  const workspace: Workspace = {
    id: uuidv4(),
    name: "默认工作空间",
    type: "local",
    isActive: true,
    rootUri: resolveDefaultWorkspaceRootUri(),
    projects: {},
    ignoreSkills: [],
  };
  const payload: WorkspacesFile = { workspaces: [workspace] };
  writeWorkspacesFile(payload);
  return payload;
}

/** Read workspaces.json payload safely. */
function readWorkspacesFile(): WorkspacesFile {
  const filePath = getWorkspacesPath();
  if (!existsSync(filePath)) {
    return ensureDefaultWorkspaces();
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    const parsed = WorkspacesFileSchema.parse(raw);
    const normalized: WorkspacesFile = {
      workspaces: parsed.workspaces.map((workspace) => ({
        ...workspace,
        rootUri: normalizeLegacyWorkspaceUri(workspace.rootUri) || resolveDefaultWorkspaceRootUri(),
        projects: normalizeProjectRoots(workspace.projects),
        ignoreSkills: workspace.ignoreSkills ?? [],
      })),
    };
    cachedWorkspaces = normalized;
    return normalized;
  } catch {
    if (cachedWorkspaces) return cachedWorkspaces;
    // 逻辑：解析失败时回退为默认配置，避免运行中断。
    return ensureDefaultWorkspaces();
  }
}

/** Write workspaces.json payload atomically. */
function writeWorkspacesFile(payload: WorkspacesFile): void {
  const filePath = getWorkspacesPath();
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 逻辑：原子写入，避免读取时遇到半写入状态。
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
  cachedWorkspaces = payload;
}

/** Return all workspaces. */
export function getWorkspaces(): Workspace[] {
  return readWorkspacesFile().workspaces;
}

/** Overwrite workspaces. */
export function setWorkspaces(workspaces: Workspace[]): void {
  const normalized = workspaces.map((workspace) => ({
    ...workspace,
    rootUri: normalizeLegacyWorkspaceUri(workspace.rootUri) || resolveDefaultWorkspaceRootUri(),
    projects: normalizeProjectRoots(workspace.projects),
    ignoreSkills: workspace.ignoreSkills ?? [],
  }));
  writeWorkspacesFile({ workspaces: normalized });
}

/** Get active workspace. */
export function getActiveWorkspaceConfig(): Workspace {
  const workspaces = getWorkspaces();
  const active = workspaces.find((workspace) => workspace.isActive) ?? workspaces[0];
  if (!active) {
    throw new Error("Active workspace not found.");
  }
  return active;
}

/** Get workspace by id. */
export function getWorkspaceByIdConfig(workspaceId: string): Workspace | null {
  if (!workspaceId) return null;
  const workspaces = getWorkspaces();
  const target = workspaces.find((workspace) => workspace.id === workspaceId);
  return target ?? null;
}

/** Resolve workspace root path. */
export function resolveWorkspaceRootPath(rootUri: string): string {
  const rootPath = fileURLToPath(rootUri);
  // 逻辑：确保工作区目录存在，避免后续读写失败。
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}
