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

/** Browser SubAgent display name. */
export const browserSubAgentName = "BrowserSubAgent" as const;
/** Document analysis SubAgent display name. */
export const documentAnalysisSubAgentName = "DocumentAnalysisSubAgent" as const;
/** Allowed SubAgent names. */
export const subAgentNames = [
  browserSubAgentName,
  documentAnalysisSubAgentName,
] as const;

/** Sub-agent tool definition. */
export const subAgentToolDef = {
  id: "SubAgent",
  readonly: true,
  name: "子代理",
  description:
    "Dispatches a task to a specific sub-agent (e.g. browsing / document analysis) and returns its final response part. Streams events during execution. Do NOT use for simple tasks that don't need splitting off.",
  parameters: z.object({
    name: z
      .enum(subAgentNames)
      .describe(
        "子Agent名称（当前支持 BrowserSubAgent 与 DocumentAnalysisSubAgent）。",
      ),
    task: z.string().describe("子Agent需要执行的任务描述。"),
  }),
  component: null,
} as const;
