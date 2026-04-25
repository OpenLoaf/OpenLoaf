/**
 * wechat/016 — outbound video via SendWeChatMedia(video) — **forward mode**.
 *
 * Goal: prove the outbound-video pipeline end-to-end (bridge → api.sendVideo),
 * **without** spending SaaS credits on CloudVideoGenerate (which costs 60-180s
 * + non-trivial credits per run). The prompt hands the agent a concrete local
 * mp4 path and asks to forward it — agent should call `SendWeChatMedia({
 * kind: 'video', source })` directly.
 *
 * Original generate-via-CloudVideoGenerate flow is covered by the cloud suite
 * / manual SaaS smoke on demand.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

declare const __REPO_ROOT__: string

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

// Checked-in repo fixture — ~4MB MP4, safe to forward repeatedly.
const FIXTURE_PATH = `${__REPO_ROOT__}/.agents/skills/ai-browser-test/fixtures/jimeng-2026-02-08-5101.mp4`

describe('wechat/016 — video outbound via SendWeChatMedia (forward local file)', () => {
  it('wechat-016-video-out-generate — forward local video via SendWeChatMedia(video)', { timeout: 180_000 }, async () => {
    const accountId = `wx-browser-test-016-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-016' })
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-forward-vid-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
              item_list: [
                {
                  text_item: {
                    text: `把这个视频发给我：${FIXTURE_PATH}`,
                  },
                },
              ],
            },
          ])
          const deadline = Date.now() + 120_000
          while (Date.now() < deadline) {
            const cur = await api.getOutbound()
            if (cur.some((o: any) => o.kind === 'video')) break
            await new Promise((r) => setTimeout(r, 1_000))
          }
          await new Promise((r) => setTimeout(r, 1_500))
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
          const videoOut = finalOutbound.find((o: any) => o.kind === 'video')
          return {
            outboundLen: finalOutbound.length,
            allOutboundKinds: finalOutbound.map((o: any) => o.kind),
            videoOutbound: videoOut ?? null,
            toolCalls: allToolCalls,
          }
        }}
      />,
    )

    const result = await waitForPageResult(160_000)
    await takePageScreenshot('wechat-016-video-out-generate')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-016-video-out-generate',
      prompt: '(wechat: forward local video file → SendWeChatMedia(video))',
      result: {
        sessionId: `wx-${accountId}`,
        status: result.status,
        toolCalls: payload?.toolCalls ?? [],
        toolCallDetails: [],
        elapsedMs: result.elapsedMs,
        finishReason: null,
        error: result.error,
        textPreview: `kinds=${(payload?.allOutboundKinds ?? []).join(',')} tools=${(payload?.toolCalls ?? []).join(',')}`,
        startedAt: result.startedAt,
        payload,
      },
      description: '用户给出本地视频绝对路径要求转发 → agent 直接调 SendWeChatMedia(video)，不走 CloudVideoGenerate',
      tags: ['wechat', 'video', 'multimodal', 'outbound', 'forward'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Ground truth: a video bubble actually arrived. See 011 for why we don't
    // assert on toolCalls (jsonl flush lags outbound delivery).
    expect(payload?.videoOutbound).not.toBeNull()
    expect(String(payload?.videoOutbound?.mediaType ?? '')).toMatch(/^video\//)
    expect(String(payload?.videoOutbound?.localPath ?? '')).toMatch(/\.(mp4|webm|mov)$/i)
    expect(payload?.toolCalls).not.toContain('CloudVideoGenerate')
  })
})
