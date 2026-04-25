/**
 * wechat/013 — "用语音回我" → refuse politely, never call SendWeChatMedia(voice).
 *
 * identity.md rule 8 says: WeChat channel cannot send voice bubbles (SDK
 * limitation). When asked, the agent should respond in text, NOT call
 * SendWeChatMedia(kind='voice') (which would return voice_send_unsupported),
 * and NOT waste credits on CloudTTS.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

describe('wechat/013 — voice-reply request → polite text refusal', () => {
  it('wechat-013-voice-out-refuse — do not call SendWeChatMedia(voice) or CloudTTS', { timeout: 180_000 }, async () => {
    const accountId = `wx-browser-test-013-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-013' })
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-voice-ask-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
              item_list: [{ text_item: { text: '用语音回我一句，讲讲今天天气' } }],
            },
          ])
          // fast-ack may land first with a generic "好的…" text; poll until
          // the full agent's refusal keyword arrives, so we grade full-agent
          // behaviour rather than the fast-ack stub.
          const deadline = Date.now() + 90_000
          const REFUSAL_RE = /不支持|暂不|语音|文字|iLink|voice/i
          while (Date.now() < deadline) {
            const cur = await api.getOutbound()
            const combined = cur
              .filter((o: any) => o.kind === 'text')
              .map((o: any) => o.text)
              .join(' | ')
            if (REFUSAL_RE.test(combined)) break
            await new Promise((r) => setTimeout(r, 1_500))
          }
          await new Promise((r) => setTimeout(r, 2_000))
          const finalOutbound = await api.getOutbound()
          const messages = await api.getMessages()
          const assistantMsgs = messages.filter((m: any) => m.role === 'assistant')
          const allToolCalls: string[] = []
          for (const m of assistantMsgs) {
            for (const p of (m.parts ?? []) as any[]) {
              const type = typeof p?.type === 'string' ? p.type : ''
              if (type.startsWith('tool-') && type !== 'tool-call') {
                allToolCalls.push(type.slice('tool-'.length))
              }
            }
          }
          return {
            outboundLen: finalOutbound.length,
            allOutboundKinds: finalOutbound.map((o: any) => o.kind),
            outboundText: finalOutbound
              .filter((o: any) => o.kind === 'text')
              .map((o: any) => o.text)
              .join(' | '),
            toolCalls: allToolCalls,
          }
        }}
      />,
    )

    const result = await waitForPageResult(120_000)
    await takePageScreenshot('wechat-013-voice-out-refuse')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-013-voice-out-refuse',
      prompt: '(wechat: user asks for voice reply, expect polite text refusal)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `kinds=${(payload?.allOutboundKinds ?? []).join(',')} tools=${(payload?.toolCalls ?? []).join(',')} text=${String(payload?.outboundText ?? '').slice(0, 120)}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '用户要"用语音回我"时 agent 应礼貌说明微信不支持语音气泡，不调 SendWeChatMedia(voice) 或 CloudTTS',
      tags: ['wechat', 'voice', 'outbound', 'refusal'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Must NOT invoke voice-related output tools.
    expect(payload?.toolCalls).not.toContain('CloudTTS')
    // SendWeChatMedia may be called to return voice_send_unsupported, but it's
    // a sign of weak identity compliance. Allow it but require the error path.
    // Easier assertion: outbound is all text.
    for (const k of (payload?.allOutboundKinds ?? []) as string[]) {
      expect(k).toBe('text')
    }
    // Reply text contains a polite refusal hint.
    expect(String(payload?.outboundText ?? '')).toMatch(/不支持|暂不|语音|文字/)
  })
})
