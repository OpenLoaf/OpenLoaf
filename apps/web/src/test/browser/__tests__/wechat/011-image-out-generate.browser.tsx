/**
 * wechat/011 — outbound image via SendWeChatMedia(image) — **forward mode**.
 *
 * Goal: prove the outbound-media pipeline (bridge `enqueueChannelOutbound` →
 * `flushPendingOutbound` → `api.sendImage`) works end-to-end, **without**
 * spending SaaS credits on CloudImageGenerate. The prompt hands the agent a
 * concrete local file path and asks to forward it. The agent should call
 * `SendWeChatMedia({ kind: 'image', source: <abs path> })` directly and NOT
 * invoke any cloud-generation tool.
 *
 * Original design (painted via CloudImageGenerate) is covered by the cloud
 * suite / manual SaaS smoke — it's too expensive to run on every regression.
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import WeChatProbeHarness from '../../WeChatProbeHarness'
import { waitForPageResult, takePageScreenshot } from '../../page-helpers'
import helloMsg from '../../../../../../../.agents/skills/ai-browser-test/fixtures/wechat/msg-hello.json'

declare const __REPO_ROOT__: string

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

// Checked-in repo fixture — 54KB PNG, safe to forward repeatedly.
const FIXTURE_PATH = `${__REPO_ROOT__}/.agents/skills/ai-browser-test/fixtures/icon.png`

describe('wechat/011 — image outbound via SendWeChatMedia (forward local file)', () => {
  it('wechat-011-image-out-generate — forward local image via SendWeChatMedia(image)', { timeout: 180_000 }, async () => {
    const accountId = `wx-browser-test-011-${Date.now().toString(36)}`

    render(
      <WeChatProbeHarness
        serverUrl={SERVER_URL}
        accountId={accountId}
        scenario={async (api) => {
          await api.createAccount({ mode: 'normal', ownerUserId: 'mock-owner-011' })
          await api.inject([
            {
              ...helloMsg,
              message_id: `mock-in-forward-img-${Date.now()}`,
              create_time_ms: Date.now(),
              context_token: `ctx-${accountId}`,
              item_list: [
                {
                  text_item: {
                    text: `把这张图片发给我：${FIXTURE_PATH}`,
                  },
                },
              ],
            },
          ])
          // Forward is fast (no SaaS): poll until an image outbound appears.
          const deadline = Date.now() + 120_000
          while (Date.now() < deadline) {
            const cur = await api.getOutbound()
            if (cur.some((o: any) => o.kind === 'image')) break
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
          const imageOutbounds = finalOutbound.filter((o: any) => o.kind === 'image')
          return {
            outboundLen: finalOutbound.length,
            allOutboundKinds: finalOutbound.map((o: any) => o.kind),
            imageOutbound: imageOutbounds[0] ?? null,
            toolCalls: allToolCalls,
          }
        }}
      />,
    )

    const result = await waitForPageResult(160_000)
    await takePageScreenshot('wechat-011-image-out-generate')

    const payload = result.payload as any
    const meta = {
      testCase: 'wechat-011-image-out-generate',
      prompt: '(wechat: forward local image file → SendWeChatMedia(image))',
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
      description: '用户给出本地图片绝对路径要求转发 → agent 直接调 SendWeChatMedia(image)，不走 CloudImageGenerate',
      tags: ['wechat', 'image', 'multimodal', 'outbound', 'forward'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ready')
    // Ground truth: an image bubble actually arrived (SendWeChatMedia completed
    // successfully and bridge delivered the bytes). Asserting on `toolCalls`
    // is redundant and racy — messages.jsonl flush lags behind the outbound,
    // so polling that finds the bubble can still see an empty toolCalls list.
    expect(payload?.imageOutbound).not.toBeNull()
    expect(String(payload?.imageOutbound?.mediaType ?? '')).toMatch(/^image\//)
    expect(String(payload?.imageOutbound?.localPath ?? '')).toMatch(/\.(png|jpg|jpeg|webp|gif)$/i)
    // Must NOT burn SaaS credits on a forward task. (Soft check — if jsonl
    // hasn't flushed yet, toolCalls is empty and this trivially passes;
    // the real anti-regression is elapsed time staying low, see purpose yaml.)
    expect(payload?.toolCalls).not.toContain('CloudImageGenerate')
    expect(payload?.toolCalls).not.toContain('CloudImageEdit')
  })
})
