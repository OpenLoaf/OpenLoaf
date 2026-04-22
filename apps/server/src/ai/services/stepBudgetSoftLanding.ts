/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Step-budget soft-landing helpers — pure functions, no I/O, no skill /
 * prompt / model imports. Lives in its own module so unit tests can cover
 * the logic without pulling in agentFactory's heavy dependency graph
 * (which transitively imports builtin-skills `.md` files that Vite can't
 * parse as JS).
 *
 * Design mirror: Claude Code's `compaction_reminder`, but injected by
 * *step budget* rather than context window. See
 * `/Users/zhao/Documents/01.Code/Github/claude-code-src/src/services/compact/autoCompact.ts`
 * for the analogous proactive-threshold pattern.
 */

/** Inject a wrap-up reminder when this many (or fewer) steps remain. */
export const STEP_BUDGET_SOFT_LANDING_STEPS = 3

type MessageLike = { role?: string; content?: unknown }

/**
 * Mirror of agentFactory's `dynamicStepLimit()` — computes the step cap
 * that the running agent will actually hit given how many tool calls have
 * already happened. Returns the hard max when the dynamic limiter yields
 * (4+ tools or any Agent spawn = complex task).
 */
export function computeEffectiveStepCap(
  messages: ReadonlyArray<MessageLike>,
  hardMax: number,
): number {
  let totalToolCalls = 0
  let hasAgentSpawn = false
  for (const m of messages) {
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const part of m.content as Array<{ type?: string; toolName?: string }>) {
      if (part?.type === 'tool-call') {
        totalToolCalls++
        if (part.toolName === 'Agent') hasAgentSpawn = true
      }
    }
  }
  if (totalToolCalls >= 4 || hasAgentSpawn) return hardMax
  if (totalToolCalls >= 1) return Math.min(15, hardMax)
  return Math.min(5, hardMax)
}

/**
 * Returns a new messages array with a soft-landing `<system-reminder>`
 * inserted near the end when the agent is within
 * `STEP_BUDGET_SOFT_LANDING_STEPS` of the effective cap. Returns the
 * input array unchanged when no injection is needed (step 0, plenty of
 * budget left, or already at the cap).
 *
 * Why insert near-end (not at the tail): the last message is typically a
 * fresh tool-result the next step consumes. Sliding the reminder one slot
 * before keeps the provider's tool_call → tool_result adjacency intact.
 */
export function maybeInjectStepBudgetReminder<T extends MessageLike>(
  messages: ReadonlyArray<T>,
  stepNumber: number,
  maxSteps: number | undefined,
): ReadonlyArray<T> {
  if (!maxSteps || stepNumber <= 0) return messages
  const effectiveCap = computeEffectiveStepCap(messages, maxSteps)
  const remaining = effectiveCap - stepNumber
  if (remaining <= 0 || remaining > STEP_BUDGET_SOFT_LANDING_STEPS) return messages

  const reminder = {
    role: 'user' as const,
    content: [
      {
        type: 'text' as const,
        text:
          `<system-reminder>\n` +
          `你已执行 ${stepNumber} 步，再调 ${remaining} 次工具就会被系统强制停止。` +
          `请**立即**基于已有信息给出最终答复：\n` +
          `- 任务已完成 → 简短总结结果。\n` +
          `- 还没拿到想要的答案 → 明确告诉用户你拿到了什么、卡在哪、建议下一步怎么做。\n` +
          `不要再尝试新的工具调用路径；不要再重试刚才失败过的操作。\n` +
          `</system-reminder>`,
      },
    ],
  } as unknown as T

  const insertIdx = Math.max(0, messages.length - 1)
  return [...messages.slice(0, insertIdx), reminder, ...messages.slice(insertIdx)]
}
