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

/** JSX create tool definition. */
export const jsxCreateToolDef = {
  id: 'JsxCreate',
  readonly: false,
  name: 'Create Jsx',
  description:
    'Render a JSX fragment inline in the chat UI for visual cards and layouts. See visualization-ops skill for usage.',
  parameters: z.object({
    content: z.string().min(1).describe('JSX fragment string.'),
  }),
  needsApproval: false,
  component: null,
} as const
