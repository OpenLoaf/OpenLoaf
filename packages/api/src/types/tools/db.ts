/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const projectQueryToolDef = {
  id: "ProjectQuery",
  readonly: true,
  name: "Query Project",
  description:
    "Read-only queries on projects: list returns the project tree, get returns a single project summary. See project-ops skill for usage.",
  parameters: z.object({
    mode: z.enum(["list", "get"]).optional().describe("Default list."),
    projectId: z
      .string()
      .optional()
      .describe("Defaults to current context project (get)."),
  }),
  component: null,
} as const;

export const projectMutateToolDef = {
  id: "ProjectMutate",
  readonly: false,
  name: "Mutate Project",
  description:
    "Mutate the project tree: create / update / move / remove. Note: remove only unlinks from the list, it does not delete files on disk. See project-ops skill for usage.",
  parameters: z.object({
    action: z.enum(["create", "update", "move", "remove"]),
    projectId: z
      .string()
      .optional()
      .describe("Defaults to current context project (update/move/remove)."),
    title: z.string().nullable().optional(),
    folderName: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    rootUri: z
      .string()
      .optional()
      .describe("file://... URI for create."),
    parentProjectId: z.string().optional().describe("For create."),
    createAsChild: z
      .boolean()
      .optional()
      .describe("On create without parentProjectId, use current context project as parent."),
    enableVersionControl: z
      .boolean()
      .optional()
      .describe("For create. Default true."),
    targetParentProjectId: z
      .string()
      .nullable()
      .optional()
      .describe("For move; null means root."),
    targetSiblingProjectId: z
      .string()
      .nullable()
      .optional()
      .describe("For ordering within same parent (move)."),
    targetPosition: z
      .enum(["before", "after"])
      .optional()
      .describe("Relative to targetSiblingProjectId (move)."),
  }),
  needsApproval: true,
  component: null,
} as const;
