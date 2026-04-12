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
  name: "Dispatch SubAgent",
  description:
    "Dispatch a task to a specialized sub-agent (browsing / document analysis). Streams events during execution and returns the final response. Do not use for simple tasks.",
  parameters: z.object({
    name: z.enum(subAgentNames),
    task: z.string(),
  }),
  component: null,
} as const;
