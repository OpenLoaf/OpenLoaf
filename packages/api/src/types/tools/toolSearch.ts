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
  name: 'Tool Search',
  description: `Load tools and skills by name. You start with ZERO tools. Every tool/skill MUST be loaded through this function first.

Pass one or more comma-separated names. Names come from the tool catalog and skill list in the system context.
- Tool names: "shell-command,read-file" → activates tools, returns parameter schemas
- Skill names: "jd-scraper,email-ops" → loads skill content with full instructions

Workflow: identify the right skill first → load it → read its guidance → load the tools it recommends → execute.`,
  parameters: z.object({
    names: z.string().min(1).describe(
      'Comma-separated tool/skill names to load. Example: "shell-command,read-file" or "jd-scraper"',
    ),
  }),
  component: null,
} as const
