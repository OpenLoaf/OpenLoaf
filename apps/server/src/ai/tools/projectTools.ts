/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { tool, zodSchema } from "ai";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { appRouter } from "@openloaf/api";
import { createContext } from "@openloaf/api/context";
import {
  projectMutateToolDef,
  projectQueryToolDef,
} from "@openloaf/api/types/tools/db";
import { getProjectId } from "@/ai/shared/context/requestContext";

/** Flattened project entry for tool output. */
type ProjectListItem = {
  /** Project id. */
  projectId: string;
  /** Project display title. */
  title: string;
  /** Project icon. */
  icon?: string;
  /** Project root URI. */
  rootUri: string;
  /** Parent project id (null for root). */
  parentProjectId: string | null;
  /** Depth within project tree. */
  depth: number;
};

/** Output payload for project-query tool. */
type ProjectQueryToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data:
    | {
        /** Query mode. */
        mode: "list";
        /** Flattened project list. */
        projects: ProjectListItem[];
        /** Original project tree. */
        tree: ProjectNode[];
      }
    | {
        /** Query mode. */
        mode: "get";
        /** Project summary. */
        project: {
          /** Project id. */
          projectId: string;
          /** Project title. */
          title: string;
          /** Project icon. */
          icon?: string;
          /** Project root URI. */
          rootUri: string;
        };
      };
};

/** Output payload for project-mutate tool. */
type ProjectMutateToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data:
    | {
        /** Mutation action. */
        action: "create";
        /** Project summary. */
        project: {
          /** Project id. */
          projectId: string;
          /** Project title. */
          title: string;
          /** Project icon. */
          icon?: string;
          /** Project root URI. */
          rootUri: string;
        };
        /** Parent project id (null for root). */
        parentProjectId: string | null;
      }
    | {
        /** Mutation action. */
        action: "update";
        /** Project summary. */
        project: {
          /** Project id. */
          projectId: string;
          /** Project title. */
          title: string;
          /** Project icon. */
          icon?: string;
          /** Project root URI. */
          rootUri: string;
        };
      }
    | {
        /** Mutation action. */
        action: "move";
        /** Project id. */
        projectId: string;
        /** Target parent project id (null for root). */
        targetParentProjectId: string | null;
        /** Target sibling project id (null when not reordering). */
        targetSiblingProjectId: string | null;
        /** Target position relative to sibling. */
        targetPosition?: "before" | "after";
      }
    | {
        /** Mutation action. */
        action: "remove";
        /** Project id. */
        projectId: string;
      };
};

/** Normalize project summary from API responses. */
function normalizeProjectSummary(project: {
  projectId?: string;
  title?: string | null;
  icon?: string | null;
  rootUri?: string;
}): { projectId: string; title: string; icon?: string; rootUri: string } {
  // 中文注释：项目元信息不完整时直接报错，避免返回无效数据。
  if (!project.projectId || project.title == null || !project.rootUri) {
    throw new Error("Project summary is incomplete.");
  }
  return {
    projectId: project.projectId,
    title: project.title,
    icon: project.icon ?? undefined,
    rootUri: project.rootUri,
  };
}

/** Input payload for project-query tool. */
type ProjectQueryInput = {
  /** Action name for tool call (display only). */
  actionName?: string;
  /** Query mode. */
  mode?: "list" | "get";
  /** Project id override for get mode. */
  projectId?: string;
};

/** Input payload for project-mutate tool. */
type ProjectMutateInput = {
  /** Action name for tool call (display only). */
  actionName?: string;
  /** Mutation action. */
  action: "create" | "update" | "move" | "remove";
  /** Project id override. */
  projectId?: string;
  /** Project title (optional). */
  title?: string | null;
  /** Project folder name (optional). */
  folderName?: string | null;
  /** Project icon (optional). */
  icon?: string | null;
  /** Project root URI (optional). */
  rootUri?: string;
  /** Parent project id (optional). */
  parentProjectId?: string | null;
  /** Whether to create as child under current project. */
  createAsChild?: boolean;
  /** Enable version control (optional). */
  enableVersionControl?: boolean;
  /** Target parent project id (null for root). */
  targetParentProjectId?: string | null;
  /** Target sibling project id (for reordering). */
  targetSiblingProjectId?: string | null;
  /** Target position relative to sibling. */
  targetPosition?: "before" | "after";
};

/** Create a tRPC caller for project operations. */
async function createProjectCaller() {
  // 工具执行上下文不依赖 Hono Context，传空对象即可。
  const ctx = await createContext({ context: {} as any });
  return appRouter.createCaller(ctx).project;
}

/** Normalize an optional id value. */
function normalizeOptionalId(value?: string | null): string | null {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Resolve a project id from input or request context. */
function resolveProjectId(input?: string): string {
  const normalized = normalizeOptionalId(input);
  if (normalized) return normalized;
  const ctxProjectId = getProjectId();
  if (!ctxProjectId) {
    throw new Error("projectId is required.");
  }
  return ctxProjectId;
}

/** Resolve parent project id for create tool. */
function resolveParentProjectId(input: {
  parentProjectId?: string | null;
  createAsChild?: boolean;
}): string | null {
  const normalizedParent = normalizeOptionalId(input.parentProjectId ?? null);
  if (normalizedParent) return normalizedParent;
  if (input.createAsChild) {
    const ctxProjectId = getProjectId();
    if (!ctxProjectId) {
      throw new Error("parent projectId is required.");
    }
    return ctxProjectId;
  }
  return null;
}

/** Flatten project tree into a list with parent metadata. */
function flattenProjectTree(nodes: ProjectNode[]): ProjectListItem[] {
  const result: ProjectListItem[] = [];
  const stack: Array<{ node: ProjectNode; parentId: string | null; depth: number }> = [];
  nodes.forEach((node) => stack.push({ node, parentId: null, depth: 0 }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    result.push({
      projectId: current.node.projectId,
      title: current.node.title,
      icon: current.node.icon,
      rootUri: current.node.rootUri,
      parentProjectId: current.parentId,
      depth: current.depth,
    });
    // 倒序入栈以保持与原数组相同的顺序输出。
    const children = current.node.children ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (!child) continue;
      stack.push({ node: child, parentId: current.node.projectId, depth: current.depth + 1 });
    }
  }
  return result;
}

/** Execute list operation. */
async function executeProjectList() {
  const caller = await createProjectCaller();
  const tree = await caller.list();
  return { projects: flattenProjectTree(tree), tree };
}

/** Execute get operation. */
async function executeProjectGet(projectId?: string) {
  const caller = await createProjectCaller();
  const resolvedId = resolveProjectId(projectId);
  const result = await caller.get({ projectId: resolvedId });
  return { project: normalizeProjectSummary(result.project) };
}

/** Execute create operation. */
async function executeProjectCreate(input: ProjectMutateInput) {
  const caller = await createProjectCaller();
  const parentProjectId = resolveParentProjectId({
    parentProjectId: input.parentProjectId ?? null,
    createAsChild: input.createAsChild,
  });
  const result = await caller.create({
    title: input.title ?? undefined,
    folderName: input.folderName ?? undefined,
    icon: input.icon ?? undefined,
    rootUri: input.rootUri,
    parentProjectId: parentProjectId ?? undefined,
    enableVersionControl: input.enableVersionControl,
  });
  return { project: normalizeProjectSummary(result.project), parentProjectId };
}

/** Execute update operation. */
async function executeProjectUpdate(input: ProjectMutateInput) {
  const caller = await createProjectCaller();
  const projectId = resolveProjectId(input.projectId);
  const hasTitle = typeof input.title !== "undefined";
  const hasIcon = typeof input.icon !== "undefined";
  // 至少更新一项，避免空写入触发无效操作。
  if (!hasTitle && !hasIcon) {
    throw new Error("title or icon is required.");
  }
  await caller.update({
    projectId,
    ...(hasTitle ? { title: input.title ?? undefined } : {}),
    ...(hasIcon ? { icon: input.icon } : {}),
  });
  const updated = await caller.get({ projectId });
  return { project: normalizeProjectSummary(updated.project) };
}

/** Execute move operation. */
async function executeProjectMove(input: ProjectMutateInput) {
  const caller = await createProjectCaller();
  const projectId = resolveProjectId(input.projectId);
  const hasParent = input.targetParentProjectId !== undefined;
  const hasSibling = input.targetSiblingProjectId !== undefined;
  // 必须指定父项目或兄弟项目，否则视为无效移动。
  if (!hasParent && !hasSibling) {
    throw new Error("targetParentProjectId or targetSiblingProjectId is required.");
  }
  const targetParentProjectId = hasParent
    ? normalizeOptionalId(input.targetParentProjectId ?? null)
    : undefined;
  const targetSiblingProjectId = hasSibling
    ? normalizeOptionalId(input.targetSiblingProjectId ?? null)
    : undefined;
  await caller.move({
    projectId,
    targetParentProjectId,
    targetSiblingProjectId,
    targetPosition: input.targetPosition,
  });
  return {
    projectId,
    targetParentProjectId: targetParentProjectId ?? null,
    targetSiblingProjectId: targetSiblingProjectId ?? null,
    targetPosition: input.targetPosition,
  };
}

/** Execute remove operation. */
async function executeProjectRemove(projectId?: string) {
  const caller = await createProjectCaller();
  const resolvedId = resolveProjectId(projectId);
  await caller.remove({ projectId: resolvedId });
  return { projectId: resolvedId };
}

/** Execute project-query tool logic. */
export async function executeProjectQuery(
  input: ProjectQueryInput,
): Promise<ProjectQueryToolOutput> {
  const mode = input.mode ?? "list";
  if (mode === "get") {
    const { project } = await executeProjectGet(input.projectId);
    return {
      ok: true,
      data: {
        mode: "get",
        project,
      },
    };
  }
  const { projects, tree } = await executeProjectList();
  return {
    ok: true,
    data: {
      mode: "list",
      projects,
      tree,
    },
  };
}

/** Execute project-mutate tool logic. */
export async function executeProjectMutate(
  input: ProjectMutateInput,
): Promise<ProjectMutateToolOutput> {
  const action = input.action;
  if (action === "create") {
    const { project, parentProjectId } = await executeProjectCreate(input);
    return {
      ok: true,
      data: {
        action: "create",
        project,
        parentProjectId,
      },
    };
  }
  if (action === "update") {
    const { project } = await executeProjectUpdate(input);
    return {
      ok: true,
      data: {
        action: "update",
        project,
      },
    };
  }
  if (action === "move") {
    const payload = await executeProjectMove(input);
    return {
      ok: true,
      data: {
        action: "move",
        projectId: payload.projectId,
        targetParentProjectId: payload.targetParentProjectId,
        targetSiblingProjectId: payload.targetSiblingProjectId,
        targetPosition: payload.targetPosition,
      },
    };
  }
  if (action === "remove") {
    const payload = await executeProjectRemove(input.projectId);
    return {
      ok: true,
      data: {
        action: "remove",
        projectId: payload.projectId,
      },
    };
  }
  throw new Error(`Unsupported action: ${action}`);
}

/** Project query tool. */
export const projectQueryTool = tool({
  description: projectQueryToolDef.description,
  inputSchema: zodSchema(projectQueryToolDef.parameters),
  execute: async (input): Promise<ProjectQueryToolOutput> => {
    return executeProjectQuery(input as ProjectQueryInput);
  },
});

/** Project mutate tool. */
export const projectMutateTool = tool({
  description: projectMutateToolDef.description,
  inputSchema: zodSchema(projectMutateToolDef.parameters),
  needsApproval: true,
  execute: async (input): Promise<ProjectMutateToolOutput> => {
    return executeProjectMutate(input as ProjectMutateInput);
  },
});
