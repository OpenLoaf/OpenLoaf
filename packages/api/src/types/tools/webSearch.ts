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

export const webSearchToolDef = {
  id: "WebSearch",
  readonly: true,
  name: "Web Search",
  description: `Search the web for real-time information.

- Use for current events, fact-checking, documentation lookups, or information beyond your training cutoff.
- Supports domain filtering via allowed_domains OR blocked_domains (not both in the same call).
- Include Sources with URLs in your response after searching.
- Do not use when you already know the answer, when local files would suffice (use Read/Grep), or when you have a specific URL (use WebFetch).`,
  parameters: z.object({
    query: z.string().min(2),
    allowed_domains: z
      .array(z.string())
      .optional()
      .describe("Only return results from these domains."),
    blocked_domains: z
      .array(z.string())
      .optional()
      .describe("Exclude results from these domains."),
  }),
  component: null,
} as const;
