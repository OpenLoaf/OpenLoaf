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
  id: 'ToolSearch',
  readonly: true,
  name: 'Tool Search',
  description: `Load tool JSON schemas by name. Deferred tools start with no schema — call this before invoking them, otherwise invocation fails with InputValidationError.

Pass comma-separated tool IDs from the tool catalog. Matching is fuzzy:
- Case-insensitive: "websearch" resolves to "WebSearch"
- \`select:\` prefix tolerated: "select:WebFetch" works the same as "WebFetch"
- Unique substring fallback: "memsave" resolves to "MemorySave" if unambiguous

Examples:
- Single: "WebFetch"
- Batch (preferred — one round trip): "WebFetch,WebSearch,MemorySave"

Once activated, a tool's schema stays live for the whole session — do not re-search.

This tool does NOT load skills; use LoadSkill for that.`,
  parameters: z.object({
    names: z.string().min(1).describe(
      'Comma-separated tool IDs (case-insensitive, fuzzy), e.g. "WebFetch,WebSearch".',
    ),
  }),
  component: null,
} as const
