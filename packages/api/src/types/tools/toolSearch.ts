/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

export const toolSearchToolDef = {
  id: 'tool-search',
  name: 'Tool Search',
  description: `Search and load available tools.
CRITICAL: You start with ZERO tools available. Every tool MUST be loaded through this function before it can be called. Calling an unloaded tool will fail with a parameter validation error.

Query modes:
1. Direct selection (preferred): "select:open-url,browser-act,browser-wait" — loads specified tools by ID, supports multiple comma-separated IDs
2. Keyword search: "email", "file read" — returns and loads the most relevant tools

Loaded tools become immediately callable. Always use "select:" when you know the tool IDs from the catalog.`,
  parameters: z.object({
    query: z.string().min(1).describe(
      'Search query. Enter keywords for search; use "select:tool-id-1,tool-id-2" for direct selection',
    ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Max results to return, default 5'),
  }),
  component: null,
} as const
