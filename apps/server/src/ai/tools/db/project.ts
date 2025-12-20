import { prisma } from "@teatime-ai/db";
import { tool, zodSchema } from "ai";
import { getProjectList } from "@teatime-ai/api/services/pageService";
import { getWorkspaceId } from "@/shared/requestContext";
import {
  projectListToolDef,
  projectGetToolDef,
  projectCreateToolDef,
  projectUpdateToolDef,
} from "@teatime-ai/api/types/tools/db";
import { uiEvents } from "@teatime-ai/api/types/event";
import { emitRuntimeUiEvent } from "@/modules/runtime/runtimeUi";

function requireWorkspaceId(): string {
  const workspaceId = getWorkspaceId();
  if (!workspaceId) throw new Error("workspaceId is required.");
  return workspaceId;
}

export const projectTools = {
  [projectListToolDef.id]: tool({
    description: projectListToolDef.description,
    inputSchema: zodSchema(projectListToolDef.parameters),
    execute: async () => {
      const workspaceId = requireWorkspaceId();
      const tree = await getProjectList(workspaceId, prisma);
      return { ok: true, data: tree };
    },
  }),

  [projectGetToolDef.id]: tool({
    description: projectGetToolDef.description,
    inputSchema: zodSchema(projectGetToolDef.parameters),
    execute: async (input) => {
      const workspaceId = requireWorkspaceId();
      const project = await prisma.page.findFirst({
        where: { id: input.id, workspaceId, parentId: null },
        include: { resources: true },
      });
      return { ok: true, data: project };
    },
  }),

  [projectCreateToolDef.id]: tool({
    description: projectCreateToolDef.description,
    inputSchema: zodSchema(projectCreateToolDef.parameters),
    needsApproval: projectCreateToolDef.needsApproval,
    execute: async (input) => {
      const workspaceId = requireWorkspaceId();
      const project = await prisma.page.create({
        data: {
          workspaceId,
          parentId: null,
          title: input.title ?? null,
          icon: input.icon ?? null,
          cover: input.cover ?? null,
          ...(typeof input.isExpanded === "boolean"
            ? { isExpanded: input.isExpanded }
            : {}),
        },
      });
      // 尽力触发 UI 刷新（Electron 环境通过 runtime -> IPC；非 Electron 环境忽略）。
      try {
        await emitRuntimeUiEvent(uiEvents.refreshPageTree());
      } catch {
        // ignore
      }
      return { ok: true, data: project };
    },
  }),

  [projectUpdateToolDef.id]: tool({
    description: projectUpdateToolDef.description,
    inputSchema: zodSchema(projectUpdateToolDef.parameters),
    execute: async (input) => {
      const workspaceId = requireWorkspaceId();

      const exists = await prisma.page.findFirst({
        where: { id: input.id, workspaceId, parentId: null },
        select: { id: true },
      });
      if (!exists) return { ok: true, data: null };

      const project = await prisma.page.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.cover !== undefined ? { cover: input.cover } : {}),
          ...(typeof input.isExpanded === "boolean"
            ? { isExpanded: input.isExpanded }
            : {}),
        },
      });

      return { ok: true, data: project };
    },
  }),
} as const;
