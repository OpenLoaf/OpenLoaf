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
  name: "网页搜索",
  description: `Search the web for real-time information.

Usage:
- Use this tool to find current information, verify facts, or research topics
- Supports domain filtering: use allowed_domains to restrict results, or blocked_domains to exclude specific sites
- Cannot specify both allowed_domains and blocked_domains in the same request
- After searching, you MUST include Sources with URLs in your response

When to use:
- Current events or information beyond your knowledge cutoff
- Fact-checking or verifying claims
- Finding documentation, tutorials, or references
- Researching products, services, or technologies

When NOT to use:
- Information you already know and are confident about
- Data available from local files (use Read/Grep instead)
- When you have a specific URL to visit (use WebFetch instead)`,
  parameters: z.object({
    query: z
      .string()
      .min(2)
      .describe("The search query to use"),
    allowed_domains: z
      .array(z.string())
      .optional()
      .describe("Optional: only include results from these domains"),
    blocked_domains: z
      .array(z.string())
      .optional()
      .describe("Optional: exclude results from these domains"),
  }),
  component: null,
} as const;
