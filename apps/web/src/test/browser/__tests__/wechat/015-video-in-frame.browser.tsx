/**
 * wechat/015 — inbound video → graceful handling (frame extraction attempt
 * or polite "can't see clearly" fallback).
 *
 * video_item gets persisted as an attachment; channel's default model (qwen
 * flash) doesn't support video_analysis, so `stripUnsupportedMediaPartsForModel`
 * replaces the part with a text reference `[video attached: <path>]`. The
 * agent should either:
 *   (a) attempt ImageProcess / VideoConvert to extract a frame, then
 *       CloudImageUnderstand; OR
 *   (b) acknowledge the video and ask for a screenshot.
 * Either path yields a plain-text reply that mentions the video.
 *
 * Because our mock buffer is a nonsense sequence (not a real MP4), any
 * extraction will fail — the graceful-fallback path (b) is the likely
 * winner. Test succeeds as long as outbound is text and mentions video.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import videoMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-video-demo.json'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

/** 28-byte "ftyp mp42" header — enough bytes for persist to succeed, not a real playable video. */
const TINY_MP4_HEADER_B64 = 'AAAAHGZ0eXBtcDQyAAAAAGlzb21pc28yYXZjMQ=='

describe('wechat/015 — video inbound → frame-extract or graceful fallback', () => {
  it('wechat-015-video-in-frame — video bubble handled without crash', { timeout: 240_000 }, async () => {
    const accountId = `wx-browser-test-015-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-015' })
          await api.registerMockMedia(
            'mock-video-001-aeskey',
            TINY_MP4_HEADER_B64,
            'video',
          )
          await api.inject([
            {
              ...videoMsg,
              message_id: `mock-in-video-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
            },
          ])
          // fast-ack may land first with a generic "收到，正在查看" text; poll
          // until the full agent's video-aware answer arrives (mentions
          // 视频/video/截图/画面) so we grade full-agent behaviour.
          const deadline = Date.now() + 150_000
          const VIDEO_RE = /视频|video|截图|画面|帧/i
          while (Date.now() < deadline) {
            const cur = await api.getOutbound()
            const combined = cur
              .filter((o: any) => o.kind === 'text')
              .map((o: any) => o.text)
              .join(' | ')
            if (VIDEO_RE.test(combined)) break
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

    const result = await waitForPageResult(180_000)
    await takePageScreenshot('wechat-015-video-in-frame')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-015-video-in-frame',
      prompt: '(wechat: inject video_item, expect graceful frame-extract or fallback)',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `tools=${(payload?.toolCalls ?? []).join(',')} text=${String(payload?.outboundText ?? '').slice(0, 120)}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '入站视频：AI 尝试抽帧理解或礼貌降级"看不清"，不 crash',
      tags: ['wechat', 'video', 'multimodal', 'inbound'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    for (const k of (payload?.allOutboundKinds ?? []) as string[]) {
      expect(k).toBe('text')
    }
    expect((payload?.outboundText as string).length).toBeGreaterThan(0)
    // Must mention "video" (视频) somewhere — proves agent acknowledged the attachment.
    expect(String(payload?.outboundText ?? '')).toMatch(/视频|video/i)
  })
})
