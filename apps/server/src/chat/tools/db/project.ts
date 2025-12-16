import { prisma } from "@teatime-ai/db";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { getProjectList } from "@teatime-ai/api/services/pageService";
import { requestContextManager } from "@/context/requestContext";

function requireWorkspaceId(): string {
  const workspaceId = requestContextManager.getWorkspaceId();
  if (!workspaceId) throw new Error("workspaceId is required.");
  return workspaceId;
}

export const projectTools = {
  project_list: tool({
    description:
      "获取当前工作空间下的项目列表，仅返回项目维度的数据，忽略非项目类型的记录。当需要查看所有可用项目或选择特定项目进行操作时调用此工具。",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const workspaceId = requireWorkspaceId();
      const tree = await getProjectList(workspaceId, prisma);
      return { ok: true, data: tree };
    },
  }),

  project_get: tool({
    description:
      "根据项目ID获取单个项目的详细信息，包括项目的基本属性和关联资源。当需要查看特定项目的详细内容或修改项目前获取当前状态时调用此工具。",
    inputSchema: zodSchema(z.object({ id: z.string() })),
    execute: async (input) => {
      const workspaceId = requireWorkspaceId();
      const project = await prisma.page.findFirst({
        where: { id: input.id, workspaceId, parentId: null },
        include: { resources: true },
      });
      return { ok: true, data: project };
    },
  }),

  project_create: tool({
    description:
      "创建一个新的项目，允许设置项目的标题、图标、封面和展开状态。当需要添加新的项目时调用此工具。",
    inputSchema: zodSchema(
      z.object({
        title: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        cover: z.string().nullable().optional(),
        isExpanded: z.boolean().optional(),
      })
    ),
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
      return { ok: true, data: project };
    },
  }),

  project_update: tool({
    description:
      "根据项目ID更新项目的属性，包括标题、图标、封面和展开状态。当需要修改现有项目的信息时调用此工具。",
    inputSchema: zodSchema(
      z.object({
        id: z.string(),
        title: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        cover: z.string().nullable().optional(),
        isExpanded: z.boolean().optional(),
      })
    ),
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
};
