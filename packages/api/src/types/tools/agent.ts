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

export const agentToolDef = {
  id: 'Agent',
  readonly: false,
  name: 'Spawn Agent',
  description:
    'Launch a sub-agent in an isolated LLM session to keep intermediate results out of the main context. Sync mode (default) returns the full result; async mode (`run_in_background=true`) returns an agent_id immediately and you drive it via SendMessage.\n'
    + '\n'
    + 'Built-in types: `general-purpose` (default, full toolset), `explore` (read-only codebase exploration), `plan` (read-only exploration that designs an implementation plan, saves it as `PLAN_N.md` via SavePlanDraft, and returns the file path — the parent then calls `SubmitPlan(planFilePath)` for user approval). Custom subagent types may be available depending on agent configuration; pass the exact name if known.\n'
    + '\n'
    + 'Rules: launch independent sub-agents in parallel when possible; do not spawn for 1-2 tool-call tasks; nesting depth = 1, max concurrency = 4; do not launch a sub-agent of the same type as yourself.',
  parameters: z.object({
    description: z
      .string()
      .min(1)
      .describe('Short label (3-5 words) summarizing the task.'),
    prompt: z
      .string()
      .min(1)
      .describe('Full task description. Be clear and detailed so the sub-agent can work autonomously.'),
    subagent_type: z
      .string()
      .optional()
      .describe('Defaults to general-purpose when omitted.'),
    model: z.string().optional().describe('Model override.'),
    run_in_background: z
      .boolean()
      .optional()
      .describe('Default false (wait for result); true returns agent_id immediately.'),
  }),
  component: null,
} as const

export const sendMessageToolDef = {
  id: 'SendMessage',
  readonly: false,
  name: 'Send Message',
  description:
    'Send a message to a sub-agent, resuming it if stopped or completed. Returns `{ submission_id: string }` — use it in logs or to trace delivery; the sub-agent processes the message and continues from where it left off.',
  parameters: z.object({
    to: z.string().min(1).describe('Target sub-agent id.'),
    message: z.string().min(1),
  }),
  component: null,
} as const
