/**
 * wechat/010 — inbound image → agent describes it (native vision or CloudImageUnderstand).
 *
 * Register a tiny 1×1 transparent PNG as the mock backing buffer for the
 * image_item. The channel agent should either see the image via native
 * vision (qwen/OL-TX-008 supports image_analysis) or fall back to
 * CloudImageUnderstand. Either way we only require the outbound to be text
 * with non-trivial length — we don't assert image content because a 1×1
 * PNG is literally nothing.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import imageMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-image-whiteboard.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

/** 1×1 transparent PNG, smallest valid image (67 bytes). */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('wechat/010 — image inbound → description', () => {
  it('wechat-010-image-in-describe — image bubble triggers describe reply', async () => {
    const accountId = `wx-browser-test-010-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-010' })
          await api.registerMockMedia(
            'mock-image-001-aeskey',
            TINY_PNG_B64,
            'image',
          )
          await api.inject([
            {
              ...imageMsg,
              message_id: `mock-in-image-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
            },
          ])
          const outbound = await api.waitForOutbound(1, 60_000)
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
            outboundText: String(outbound[0]?.text ?? finalOutbound[0]?.text ?? ''),
            toolCalls: allToolCalls,
          }
        }}
      />,
    )

    const result = await waitForPageResult(90_000)
    await takePageScreenshot('wechat-010-image-in-describe')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-010-image-in-describe',
      prompt: '(wechat: inject image_item, expect describe reply via vision or CloudImageUnderstand)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `out.len=${payload?.outboundLen} kinds=${(payload?.allOutboundKinds ?? []).join(',')} tools=${(payload?.toolCalls ?? []).join(',')}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '入站图片消息触发 AI 描述回复（原生 vision 或 CloudImageUnderstand）',
      tags: ['wechat', 'image', 'multimodal'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    expect(payload?.outboundLen).toBeGreaterThanOrEqual(1)
    for (const k of (payload?.allOutboundKinds ?? []) as string[]) {
      expect(k).toBe('text')
    }
    expect((payload?.outboundText as string).length).toBeGreaterThan(0)
  })
})
