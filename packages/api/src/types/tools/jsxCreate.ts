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
  name: '组件渲染',
  description:
    'Renders a JSX fragment directly in the chat UI (auto-rendered, no user action). Use for visual cards/layouts instead of plain text. Writes to `.openloaf/chat-history/<sessionId>/jsx/<messageId>.jsx`.\n'
    + '\n'
    + 'Rules:\n'
    + '- Write only a JSX fragment — no import/export/const/function definitions. Expressions (`{}`), `.map`, conditional rendering, and `style={{...}}` are allowed. Spread (`{...props}`) is NOT supported.\n'
    + '- Do NOT wrap in framed components (Message/Panel/Snippet/Task/WebPreview) or add border/shadow/ring/outline to the outer container.\n'
    + '- Use semantic tokens (`bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`) and `ol-*` accent colors (`bg-ol-blue/10 text-ol-blue`, green/amber/red/purple). Forbidden: hardcoded grays (`bg-white`, `text-gray-800`), gradients (`bg-gradient-*`), `shadow-*`.\n'
    + '- Style: `rounded-lg`/`rounded-xl`, compact spacing (`p-3`~`p-4`, `gap-2`~`gap-3`), prefer `text-sm`/`text-xs`. Prefer wide (horizontal) layouts over tall (vertical) ones.\n'
    + '- For interactive forms, use AskUserQuestion instead — this tool is display-only.\n'
    + '- Call at most once per reply. On validation failure, use apply-patch to fix the existing file — do NOT re-call JsxCreate.\n'
    + '- After calling this tool, do NOT repeat the JSX in your text reply — the frontend renders it directly.\n',
  parameters: z.object({
    content: z.string().min(1).describe('JSX 字符串内容。'),
  }),
  needsApproval: false,
  component: null,
} as const
