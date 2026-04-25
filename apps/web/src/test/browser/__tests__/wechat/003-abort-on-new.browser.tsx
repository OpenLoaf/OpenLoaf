/**
 * wechat/003 — new inbound mid-AI-run aborts and restarts (bridge V2).
 *
 * Inject A, wait until race A is mid-flight, then inject B. Expect race A's
 * fast+full to be aborted, race B to start with the merged pending queue,
 * final outbound is 1-2 messages (race B's fast+full, or just full if it
 * wins first). Race A's unsent text is discarded via stateRaceCtxChanged.
 * Timing-sensitive — generous budgets.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/003 — abort in-flight AI run on new inbound', () => {
  it('wechat-003-abort-on-new — inject A, then B mid-run → 1 outbound', async () => {
    const accountId = `wx-browser-test-003-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-003' })
          const ts = Date.now()
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-A-${ts}`,
              create_time_ms: ts,
              context_token: `ctx-${accountId}-A`,
              item_list: [{ text_item: { text: '第一条 在吗' } }],
            },
          ])
          // Bridge V2: race starts at T0 — wait ~1.5s so race A's fast has likely
          // already sent (or about to send) and full is mid-stream; then inject B.
          await new Promise((r) => setTimeout(r, 1_500))
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-B-${ts}`,
              create_time_ms: ts + 4000,
              context_token: `ctx-${accountId}-B`,
              item_list: [{ text_item: { text: '第二条 帮我查个东西' } }],
            },
          ])
          const outbound = await api.waitForOutbound(1, 35_000)
          // Settle window — allow race B's final turn to complete sending.
          await new Promise((r) => setTimeout(r, 3_000))
          const finalOutbound = await api.getOutbound()
          return {
            outboundLen: finalOutbound.length,
            outboundText: outbound[0]?.text ?? '',
          }
        }}
      />,
    )

    const result = await waitForPageResult(60_000)
    await takePageScreenshot('wechat-003-abort-on-new')

    const meta = {
      testCase: 'wechat-003-abort-on-new',
      prompt: '(wechat: inject A then B mid-run, expect 1 merged outbound)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `outLen=${result.payload?.outboundLen} preview=${String(result.payload?.outboundText ?? '').slice(0, 100)}`,
        startedAt: result.startedAt,
        payload: result.payload,
      },
      description: '消息 A 触发 race A → 中途消息 B 进入 → abort race A + 启动 race B → 最终 1-2 条回复',
      tags: ['wechat', 'race-abort'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Bridge V2: fast wins → 2 outbound; full wins → 1 outbound.
    expect(result.payload?.outboundLen).toBeGreaterThanOrEqual(1)
    expect(result.payload?.outboundLen).toBeLessThanOrEqual(2)
  })
})
