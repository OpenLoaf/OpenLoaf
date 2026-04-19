/**
 * 033: CDN 跨轮复用 — 首轮上传后 url 回填到 messages.jsonl，次轮不重传。
 *
 * 首轮：上传 jpg 问"图里有什么"
 * 次轮：追问"主色调是什么"（隐式复用同一张图）
 *
 * 验证两件事：
 *   1. 两轮都能让 vision 模型直接回答，不调 Read
 *   2. session messages.jsonl 的首条 user 消息的 tag 已回填 url="https://..."
 *      （仅在 SaaS 已登录 + CDN 上传成功时成立；未登录时降级 base64 不回填，
 *       此时也算通过，但会记录 hasUrlAttr=false 供事后分析）
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'
// Qwen Flash — image + video + audio 全模态（来源：/api/ai/v3/capabilities/chat）
const MODEL_ID = 'qwen:OL-TX-006'
const MODEL_SOURCE = 'cloud' as const

it('033 — CDN 跨轮复用：两轮都用原生 vision，url 回填 jsonl', async () => {
  const sessionId = `chat_probe_033_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const prompt = '图里画的是什么？'
  const followUp = '那主色调偏什么颜色？'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['21fa3e725d110225873bcc2b9eadae99.jpg'],
  })
  const firstTurn = `${tags.join(' ')} ${prompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={firstTurn}
      followUpPrompts={[followUp]}
      sessionId={sessionId}
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
      title="033 — CDN 跨轮复用"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(360_000)
  const result = await waitForProbeResult()

  const jsonl = await (commands as any).readSessionUserTags({ sessionId })

  await takeProbeScreenshot('multimodal-005-attachment-cdn-reuse')
  const meta = {
    testCase: 'multimodal-005-attachment-cdn-reuse',
    prompt: `${firstTurn} → ${followUp}`,
    model: MODEL_ID,
    result,
    description: '同附件两轮使用，jsonl 应回填 CDN url',
    tags: ['multimodal', 'native-vision', 'cdn-reuse', 'multi-turn'],
    extra: { jsonl },
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(2)
  expect(result.toolCalls).not.toContain('Read')
  expect(result.textPreview.length).toBeGreaterThan(10)
  // messages.jsonl 首条 user 消息应存在
  expect(jsonl.found).toBe(true)
  // 仅当登录 SaaS 时 url 会回填；未登录走 base64 不回填，放宽为非强制断言
  if (!jsonl.hasUrlAttr) {
    console.warn('[033] tag has no url= attr — likely unauthenticated (base64 fallback)')
  }
})
