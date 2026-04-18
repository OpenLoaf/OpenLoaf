/**
 * 034: 大文件 fallback — 超 20MB 视频保留文本 tag，走 cloud-media-skill / Read 路径。
 *
 * 把 fixture mp4 pad 到 21MB，即使模型支持 video_analysis，
 * expandAttachmentTagsForModel 也会因 size 超限保留原 tag 文本，
 * 让下游工具链（Read + cloud-media-skill 的 videoCaption）兜底。
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
const OVER_LIMIT_BYTES = 21 * 1024 * 1024 // > VIDEO_SIZE_LIMIT_BYTES (20MB)

it('034 — 大视频超限 fallback：原生路径关闭，走工具链兜底', async () => {
  const sessionId = `chat_probe_034_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这段视频里有什么？'

  const { tags, copied } = await (commands as any).stageAttachments({
    sessionId,
    files: ['jimeng-2026-02-08-5101.mp4'],
    padToBytes: OVER_LIMIT_BYTES,
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      sessionId={sessionId}
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
      title="034 — 大视频 fallback"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(360_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('multimodal-007-large-video-fallback')
  const meta = {
    testCase: 'multimodal-007-large-video-fallback',
    prompt,
    model: MODEL_ID,
    result,
    description: '超限视频绕过原生多模态，走工具链',
    tags: ['multimodal', 'fallback', 'size-limit', 'video'],
    extra: { stagedBytes: copied?.[0]?.bytes ?? null },
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // 未走原生视频，模型应通过 Read / 云端视频理解工具等兜底
  const usedFallback =
    result.toolCalls.includes('Read')
    || result.toolCalls.includes('CloudImageUnderstand')
    || result.toolCalls.includes('CloudSpeechRecognize')
    || result.toolCalls.includes('CloudVideoGenerate')
  expect(usedFallback).toBe(true)
})
