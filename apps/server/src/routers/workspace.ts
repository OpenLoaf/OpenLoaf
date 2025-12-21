import {
  t,
  shieldedProcedure,
  type Workspace,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "@teatime-ai/api";
import { v4 as uuidv4 } from "uuid";
import { teatimeConfigStore } from "@/modules/workspace/TeatimeConfigStoreAdapter";

export class WorkspaceRouterImpl extends BaseWorkspaceRouter {
  /** Workspace CRUD（MVP）：基于本地配置文件。 */
  public static createRouter() {
    return t.router({
      getList: shieldedProcedure
        .output(workspaceSchemas.getList.output)
        .query(async () => teatimeConfigStore.get().workspaces as Workspace[]),

      getActive: shieldedProcedure
        .output(workspaceSchemas.getActive.output)
        .query(async () => {
          const cfg = teatimeConfigStore.get();
          const workspaces = cfg.workspaces as Workspace[];
          const active = workspaces.find((w) => w.isActive) ?? workspaces[0];
          if (!active) throw new Error("缺少 workspace 配置。");
          return active;
        }),

      create: shieldedProcedure
        .input(workspaceSchemas.create.input)
        .output(workspaceSchemas.create.output)
        .mutation(async ({ input }) => {
          const cfg = teatimeConfigStore.get();
          const newWorkspace: Workspace = {
            id: uuidv4(),
            name: input.name,
            type: "local",
            isActive: false,
          };
          teatimeConfigStore.set({ ...cfg, workspaces: [...cfg.workspaces, newWorkspace] as any });
          return newWorkspace;
        }),

      activate: shieldedProcedure
        .input(workspaceSchemas.activate.input)
        .output(workspaceSchemas.activate.output)
        .mutation(async ({ input }) => {
          const cfg = teatimeConfigStore.get();
          const workspaces = cfg.workspaces as Workspace[];
          const exists = workspaces.find((w) => w.id === input.id);
          if (!exists) throw new Error("工作空间不存在");
          const next = workspaces.map((w) => ({ ...w, isActive: w.id === input.id }));
          teatimeConfigStore.set({ ...cfg, workspaces: next as any });
          return { ...exists, isActive: true };
        }),

      delete: shieldedProcedure
        .input(workspaceSchemas.delete.input)
        .output(workspaceSchemas.delete.output)
        .mutation(async ({ input }) => {
          const cfg = teatimeConfigStore.get();
          const workspaces = cfg.workspaces as Workspace[];
          if (workspaces.length <= 1) throw new Error("至少需要保留一个工作空间");
          const next = workspaces.filter((w) => w.id !== input.id);
          if (next.length === workspaces.length) throw new Error("工作空间不存在");
          if (!next.some((w) => w.isActive) && next[0]) next[0] = { ...next[0], isActive: true };
          teatimeConfigStore.set({ ...cfg, workspaces: next as any });
          return true;
        }),

      updateName: shieldedProcedure
        .input(workspaceSchemas.updateName.input)
        .output(workspaceSchemas.updateName.output)
        .mutation(async ({ input }) => {
          const cfg = teatimeConfigStore.get();
          const workspaces = cfg.workspaces as Workspace[];
          const exists = workspaces.find((w) => w.id === input.id);
          if (!exists) throw new Error("工作空间不存在");
          const next = workspaces.map((w) => (w.id === input.id ? { ...w, name: input.name } : w));
          teatimeConfigStore.set({ ...cfg, workspaces: next as any });
          return { ...exists, name: input.name };
        }),
    });
  }
}

export const workspaceRouterImplementation = WorkspaceRouterImpl.createRouter();
