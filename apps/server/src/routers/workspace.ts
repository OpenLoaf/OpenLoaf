/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport {
  t,
  shieldedProcedure,
  type Workspace,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "@openloaf/api";
import { v4 as uuidv4 } from "uuid";
import {
  getActiveWorkspaceConfig,
  getWorkspaces,
  resolveWorkspaceRootPath,
  setWorkspaces,
} from "@openloaf/api/services/workspaceConfig";
import { normalizeFileUri, resolveFilePathFromUri } from "@openloaf/api/services/fileUri";
import { ensureWorkspaceDefaultAgentByRootUri } from "@/ai/shared/workspaceAgentInit";

/** Build a comparable workspace root path key. */
function buildWorkspaceRootPathKey(rootUri: string): string {
  const normalizedPath = resolveFilePathFromUri(normalizeFileUri(rootUri));
  // 中文注释：Windows 路径比较忽略大小写，避免同一路径被重复创建。
  return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

export class WorkspaceRouterImpl extends BaseWorkspaceRouter {
  /** Workspace CRUD（MVP）：基于本地配置文件。 */
  public static createRouter() {
    return t.router({
      getList: shieldedProcedure
        .output(workspaceSchemas.getList.output)
        .query(async () => getWorkspaces() as Workspace[]),

      getActive: shieldedProcedure
        .output(workspaceSchemas.getActive.output)
        .query(async () => {
          return getActiveWorkspaceConfig() as Workspace;
        }),

      create: shieldedProcedure
        .input(workspaceSchemas.create.input)
        .output(workspaceSchemas.create.output)
        .mutation(async ({ input }) => {
          const workspaces = getWorkspaces() as Workspace[];
          const normalizedRootUri = normalizeFileUri(input.rootUri);
          const targetRootKey = buildWorkspaceRootPathKey(normalizedRootUri);
          const duplicated = workspaces.find(
            (workspace) => buildWorkspaceRootPathKey(workspace.rootUri) === targetRootKey,
          );
          if (duplicated) {
            throw new Error("工作空间保存目录不能重复，请选择其他文件夹。");
          }
          // 中文注释：创建前确保目录存在，避免后续读写工作空间文件失败。
          resolveWorkspaceRootPath(normalizedRootUri);
          const newWorkspace: Workspace = {
            id: uuidv4(),
            name: input.name,
            type: "local",
            isActive: false,
            rootUri: normalizedRootUri,
            projects: {},
          };
          setWorkspaces([...workspaces, newWorkspace] as Workspace[]);
          // 逻辑：创建 workspace 后自动初始化默认 agent 文件。
          ensureWorkspaceDefaultAgentByRootUri(normalizedRootUri);
          return newWorkspace;
        }),

      activate: shieldedProcedure
        .input(workspaceSchemas.activate.input)
        .output(workspaceSchemas.activate.output)
        .mutation(async ({ input }) => {
          const workspaces = getWorkspaces() as Workspace[];
          const exists = workspaces.find((w) => w.id === input.id);
          if (!exists) throw new Error("工作空间不存在");
          const next = workspaces.map((w) => ({ ...w, isActive: w.id === input.id }));
          setWorkspaces(next as Workspace[]);
          // 逻辑：切换 workspace 后确保目标 workspace 有默认 agent 文件。
          ensureWorkspaceDefaultAgentByRootUri(exists.rootUri);
          return { ...exists, isActive: true };
        }),

      delete: shieldedProcedure
        .input(workspaceSchemas.delete.input)
        .output(workspaceSchemas.delete.output)
        .mutation(async ({ input }) => {
          const workspaces = getWorkspaces() as Workspace[];
          if (workspaces.length <= 1) throw new Error("至少需要保留一个工作空间");
          const next = workspaces.filter((w) => w.id !== input.id);
          if (next.length === workspaces.length) throw new Error("工作空间不存在");
          if (!next.some((w) => w.isActive) && next[0]) next[0] = { ...next[0], isActive: true };
          setWorkspaces(next as Workspace[]);
          return true;
        }),

      updateName: shieldedProcedure
        .input(workspaceSchemas.updateName.input)
        .output(workspaceSchemas.updateName.output)
        .mutation(async ({ input }) => {
          const workspaces = getWorkspaces() as Workspace[];
          const exists = workspaces.find((w) => w.id === input.id);
          if (!exists) throw new Error("工作空间不存在");
          const next = workspaces.map((w) => (w.id === input.id ? { ...w, name: input.name } : w));
          setWorkspaces(next as Workspace[]);
          return { ...exists, name: input.name };
        }),

    });
  }
}

export const workspaceRouterImplementation = WorkspaceRouterImpl.createRouter();
