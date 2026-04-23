/**
 * wechat/005 — bot-echo (from_user_id === botId) is filtered before AI fires.
 *
 * iLink occasionally re-emits messages the bot itself sent. shouldHandle
 * must drop them, otherwise the bot triggers AI on its own outbound and
 * loops. Inject one bot-echo, wait long enough that any AI turn would have
 * fired, assert outbox=0 and no jsonl growth.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/005 — bot-echo filtered, no AI fired', () => {
  it('wechat-005-bot-echo-skip — from_user_id=botId → outbox=0', async () => {
    const accountId = `wx-browser-test-005-${Date.now().toString(36)}`
    const botId = `mock-bot-${accountId}@im.bot`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-005', botId })
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-echo-${Date.now()}`,
              from_user_id: botId, // bot's own echo
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}-echo`,
              item_list: [{ text_item: { text: '这是 bot 自己的回声' } }],
            },
          ])
          // Wait through full debounce window + small AI run budget
          await new Promise((r) => setTimeout(r, 5_000))
          const outbound = await api.getOutbound()
          const messages = await api.getMessages()
          return {
            outboundLen: outbound.length,
            messageCount: messages.length,
          }
        }}
      />,
    )

    const result = await waitForPageResult(15_000)
    await takePageScreenshot('wechat-005-bot-echo-skip')

    const meta = {
      testCase: 'wechat-005-bot-echo-skip',
      prompt: '(wechat: bot-echo inbound, expect filtered)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `outLen=${result.payload?.outboundLen} msgN=${result.payload?.messageCount}`,
        startedAt: result.startedAt,
        payload: result.payload,
      },
      description: 'from_user_id=botId 的 echo 消息被过滤，无 AI 触发',
      tags: ['wechat', 'filter'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    expect(result.payload?.outboundLen).toBe(0)
    expect(result.payload?.messageCount).toBe(0)
  })
})
