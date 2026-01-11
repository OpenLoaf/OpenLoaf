import {
  t,
  shieldedProcedure,
  type Workspace,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "@tenas-ai/api";
import { v4 as uuidv4 } from "uuid";
import {
  getActiveWorkspaceConfig,
  getWorkspaces,
  setWorkspaces,
} from "@tenas-ai/api/services/workspaceConfig";

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
          const active = workspaces.find((w) => w.isActive) ?? workspaces[0];
          if (!active?.rootUri) {
            throw new Error("缺少 workspace rootUri 配置。");
          }
          const newWorkspace: Workspace = {
            id: uuidv4(),
            name: input.name,
            type: "local",
            isActive: false,
            rootUri: active.rootUri,
            projects: {},
          };
          setWorkspaces([...workspaces, newWorkspace] as Workspace[]);
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
