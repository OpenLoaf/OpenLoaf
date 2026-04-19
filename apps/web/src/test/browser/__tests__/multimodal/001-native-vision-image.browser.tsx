/**
 * 030: 原生 vision 读图 — 验证 attachment tag 被升级为 file part。
 *
 * 用户上传一张 jpg，选一个声明了 image_input 的 vision 模型。
 * 预期模型直接用原生视觉能力回答，不调 Read/ImageProcess/CloudImageUnderstand。
 *
 * 覆盖 843e4af2：expandAttachmentTagsForModel 把 <system-tag attachment> 升级成
 * {type:"file"} part，省掉 Read + cloud-media-skill 的绕路。
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

it('030 — 原生 vision 读图：不走 Read 直接用视觉能力', async () => {
  const sessionId = `chat_probe_030_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这张图里有什么？简短描述即可。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['21fa3e725d110225873bcc2b9eadae99.jpg'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      sessionId={sessionId}
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
      title="030 — 原生 vision 读图"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('multimodal-001-native-vision-image')
  const meta = {
    testCase: 'multimodal-001-native-vision-image',
    prompt,
    model: MODEL_ID,
    result,
    description: '视觉模型直接看图，不调 Read',
    tags: ['multimodal', 'native-vision', 'image', 'attachment-tag'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.textPreview.length).toBeGreaterThan(20)
  // 关键：不应该调 Read / ImageProcess / 云端图片理解工具
  expect(result.toolCalls).not.toContain('Read')
  expect(result.toolCalls).not.toContain('ImageProcess')
  expect(result.toolCalls).not.toContain('CloudImageUnderstand')
})
