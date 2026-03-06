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
  description: `Search and load available tools. You start with no other tools and must use this to search and load them first.

Query modes:
1. Keyword search: enter keywords ("email", "file read"), returns and loads the most relevant tools
2. Direct selection: enter "select:read-file,apply-patch", loads specified tools by ID

Important: searched tools become immediately available. Use select: for efficiency when you know the tool IDs.`,
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
