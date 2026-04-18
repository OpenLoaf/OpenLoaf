/**
 * 032: 原生 video 理解 — mp4 附件升级为 file part。
 *
 * 选一个声明了 video_analysis 的模型（Gemini）。
 * 预期不调 Read，模型直接看视频作答。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'
// Qwen Flash — image + video + audio 全模态（来源：/api/ai/v3/capabilities/chat）
const MODEL_ID = 'qwen:OL-TX-006'
const MODEL_SOURCE = 'cloud' as const

it('032 — 原生 video 理解：不走 Read 直接看视频', async () => {
  const sessionId = `chat_probe_032_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这段视频里出现了什么画面？简短描述。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['jimeng-2026-02-08-5101.mp4'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      sessionId={sessionId}
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
      title="032 — 原生 video 理解"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(300_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('multimodal-003-native-video-understand')
  const meta = {
    testCase: 'multimodal-003-native-video-understand',
    prompt,
    model: MODEL_ID,
    result,
    description: '视频模型直接看 mp4，不调 Read',
    tags: ['multimodal', 'native-video', 'mp4', 'attachment-tag'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.textPreview.length).toBeGreaterThan(20)
  expect(result.toolCalls).not.toContain('Read')
  expect(result.toolCalls).not.toContain('CloudImageUnderstand')
})
