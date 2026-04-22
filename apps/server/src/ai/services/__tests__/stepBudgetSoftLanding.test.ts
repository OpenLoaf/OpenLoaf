/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Step-budget soft-landing unit tests.
 *
 * Browser/E2E tests can't reliably reach step 197/200 or control the
 * exact toolCall count needed to trigger the dynamic caps, and the
 * mechanism is a pure plumbing decision. So the logic is covered here
 * via direct calls to `stepBudgetSoftLanding` — the tiny standalone
 * module agentFactory delegates to.
 */
import { describe, expect, it } from 'vitest'
import {
  STEP_BUDGET_SOFT_LANDING_STEPS,
  computeEffectiveStepCap,
  maybeInjectStepBudgetReminder,
} from '../stepBudgetSoftLanding'

type Msg = { role?: string; content?: unknown }

function userText(text = 'hi'): Msg {
  return { role: 'user', content: [{ type: 'text', text }] }
}

function assistantToolCall(toolName = 'Bash'): Msg {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolName, toolCallId: 'tc', input: {} }],
  }
}

function toolResult(toolName = 'Bash'): Msg {
  return {
    role: 'tool',
    content: [{ type: 'tool-result', toolName, toolCallId: 'tc', output: 'ok' }],
  }
}

function findReminder(messages: ReadonlyArray<Msg>): string | null {
  for (const m of messages) {
    if (!Array.isArray(m?.content)) continue
    for (const part of m.content as Array<{ type?: string; text?: unknown }>) {
      if (
        part?.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.includes('<system-reminder>') &&
        part.text.includes('再调')
      ) {
        return part.text
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// computeEffectiveStepCap
// ---------------------------------------------------------------------------

describe('computeEffectiveStepCap', () => {
  it('returns min(5, hardMax) when no tool calls so far (pure-text task)', () => {
    const msgs = [userText(), { role: 'assistant', content: [{ type: 'text', text: 'hi' }] }]
    expect(computeEffectiveStepCap(msgs, 200)).toBe(5)
    expect(computeEffectiveStepCap(msgs, 3)).toBe(3) // hardMax wins when < 5
  })

  it('returns min(15, hardMax) for 1-3 tool calls (medium task)', () => {
    const msgs = [userText(), assistantToolCall(), toolResult()]
    expect(computeEffectiveStepCap(msgs, 200)).toBe(15)
    expect(computeEffectiveStepCap(msgs, 10)).toBe(10)
  })

  it('returns hardMax once 4+ tool calls happened (complex task)', () => {
    const msgs = [userText(), ...Array.from({ length: 4 }, () => assistantToolCall())]
    expect(computeEffectiveStepCap(msgs, 200)).toBe(200)
    expect(computeEffectiveStepCap(msgs, 80)).toBe(80)
  })

  it('returns hardMax whenever an Agent tool call appears, regardless of count', () => {
    const msgs = [userText(), assistantToolCall('Agent')]
    expect(computeEffectiveStepCap(msgs, 200)).toBe(200)
  })

  it('ignores non-tool-call assistant parts (reasoning, text)', () => {
    const msgs = [
      userText(),
      { role: 'assistant', content: [{ type: 'reasoning', text: 'thinking' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    ]
    expect(computeEffectiveStepCap(msgs, 200)).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// maybeInjectStepBudgetReminder
// ---------------------------------------------------------------------------

describe('maybeInjectStepBudgetReminder', () => {
  it('returns input unchanged at step 0', () => {
    const msgs = [userText(), assistantToolCall(), toolResult(), userText('next')]
    const out = maybeInjectStepBudgetReminder(msgs, 0, 15)
    expect(out).toBe(msgs)
    expect(findReminder(out)).toBeNull()
  })

  it('returns input unchanged when maxSteps omitted', () => {
    const msgs = [userText(), ...Array.from({ length: 4 }, () => assistantToolCall())]
    const out = maybeInjectStepBudgetReminder(msgs, 197, undefined)
    expect(out).toBe(msgs)
  })

  it('does not inject when remaining budget is plenty', () => {
    const msgs = [userText(), assistantToolCall(), toolResult()]
    const out = maybeInjectStepBudgetReminder(msgs, 5, 200) // 2 tools → cap 15, remaining=10
    expect(findReminder(out)).toBeNull()
  })

  it('injects on the dynamic 15-step cap path at step 12', () => {
    const msgs = [userText(), assistantToolCall(), toolResult(), assistantToolCall(), toolResult()]
    const out = maybeInjectStepBudgetReminder(msgs, 12, 200) // 2 tools → cap 15, remaining=3
    expect(findReminder(out)).not.toBeNull()
  })

  it('injects on the complex-task hardMax path (cap=200) when 3 steps remain', () => {
    const msgs = [userText(), ...Array.from({ length: 4 }, () => assistantToolCall())]
    const atEdge = 200 - STEP_BUDGET_SOFT_LANDING_STEPS
    const out = maybeInjectStepBudgetReminder(msgs, atEdge, 200)
    expect(findReminder(out)).not.toBeNull()
  })

  it('does NOT inject when remaining hits 0 (already at cap — avoid wasting final step)', () => {
    const msgs = [userText(), assistantToolCall(), toolResult()]
    // 2 tools → cap 15. stepNumber=15 → remaining=0 → skip.
    const out = maybeInjectStepBudgetReminder(msgs, 15, 200)
    expect(findReminder(out)).toBeNull()
  })

  it('does NOT inject when stepNumber exceeds cap (remaining <0 safety)', () => {
    const msgs = [userText(), assistantToolCall(), toolResult()]
    const out = maybeInjectStepBudgetReminder(msgs, 20, 200)
    expect(findReminder(out)).toBeNull()
  })

  it('inserts reminder before the last message (keeps tool_call→tool_result adjacency)', () => {
    const msgs = [userText(), assistantToolCall(), toolResult()]
    // stepNumber=3 with 1 tool → cap 15, remaining=12: NO injection. Force edge:
    const msgs2 = [userText(), assistantToolCall(), toolResult(), userText('tail')]
    const out = maybeInjectStepBudgetReminder(msgs2, 13, 200) // 1 tool → cap 15, remaining=2
    expect(findReminder(out)).not.toBeNull()
    // Last slot must still be the original tail, not the reminder
    expect(out[out.length - 1]).toBe(msgs2[msgs2.length - 1])
    // Second-to-last should be the injected reminder
    expect((out[out.length - 2] as any).content[0].text).toContain('<system-reminder>')
  })

  it('reminder contains explicit wrap-up directive + "no new tool paths" rule', () => {
    const msgs = [userText(), ...Array.from({ length: 4 }, () => assistantToolCall())]
    const out = maybeInjectStepBudgetReminder(msgs, 198, 200)
    const text = findReminder(out)!
    expect(text).toContain('立即')
    expect(text).toContain('不要再尝试新的工具调用路径')
    expect(text).toMatch(/再调 2 次/) // remaining=2 interpolated
  })
})
