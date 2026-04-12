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
import { RiskType } from "../toolResult";

export const memorySaveToolDef = {
  id: "MemorySave",
  readonly: false,
  name: "Save Memory",
  description:
    "Persist a memory entry (cross-session, retrievable). Each entry is a single Markdown file keyed by `key`; the MEMORY.md index is maintained automatically. Supports upsert / append / delete modes.",
  parameters: z.object({
    key: z
      .string()
      .min(1)
      .max(60)
      .describe("Lowercase letters, digits, hyphens, e.g. food-preferences."),
    content: z
      .string()
      .max(10240)
      .optional()
      .describe("Markdown. Omit for delete."),
    scope: z
      .enum(["user", "project", "agent"])
      .optional()
      .describe("user=global (default), project=current project, agent=current agent."),
    mode: z
      .enum(["upsert", "append", "delete"])
      .optional()
      .describe("Default upsert."),
    tags: z
      .array(z.string())
      .optional()
      .describe('Injected into frontmatter, e.g. ["food","preference"].'),
    indexEntry: z
      .string()
      .max(100)
      .optional()
      .describe("One-line summary for MEMORY.md index. Falls back to first line of content."),
  }),
  component: null,
} as const;

export const memorySearchToolDef = {
  id: "MemorySearch",
  readonly: true,
  name: "Search Memory",
  description:
    "Search memory files. Returns ranked matches (path, snippet, date, decay weight) for on-demand history retrieval.",
  parameters: z.object({
    query: z.string().min(1).describe("Matched against memory file contents."),
    scope: z
      .enum(["user", "project", "agent"])
      .optional()
      .describe("Omit to search all visible scopes."),
    topK: z.number().min(1).max(20).optional().describe("Default 10."),
  }),
  component: null,
} as const;

export const memoryGetToolDef = {
  id: "MemoryGet",
  readonly: true,
  name: "Get Memory",
  description:
    "Read a memory file's full content by path. Usually called after MemorySearch to fetch an interesting entry.",
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe("From a MemorySearch result."),
  }),
  component: null,
} as const;

export const memoryToolMeta = {
  [memorySaveToolDef.id]: { riskType: RiskType.Write },
  [memorySearchToolDef.id]: { riskType: RiskType.Read },
  [memoryGetToolDef.id]: { riskType: RiskType.Read },
} as const;
