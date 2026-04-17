/**
 * 035: 非 vision 模型降级 — 不升级 attachment，保留 tag 走 Read 路径。
 *
 * 切到一个不声明 image_input 的纯文本模型（deepseek-chat）。
 * expandAttachmentTagsForModel 的 caps.anySupported 为 false，
 * 直接返回原 messages，模型只能调 Read 读文件（或提示无法读图）。
 *
 * 和 005 区别：005 验证"旧通路 Read 工具工作"；035 验证"模型能力不足时
 * 仍能正确降级"，防止升级路径错误地吞掉非 vision 模型的 attachment。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'
// DeepSeek — 纯文本，无 image/video/audio inputSlot（来源：/api/ai/v3/capabilities/chat）
const MODEL_ID = 'deepseek:OL-TX-003'
const MODEL_SOURCE = 'cloud' as const

it('035 — 非 vision 模型收到图片：降级走 Read', async () => {
  const sessionId = `chat_probe_035_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这张图是什么？尽量描述。'

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
      title="035 — 非 vision 降级"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('035-non-vision-model-fallback')
  const meta = {
    testCase: '035-non-vision-model-fallback',
    prompt,
    model: MODEL_ID,
    result,
    description: '纯文本模型收到图片附件，走 Read 兜底',
    tags: ['multimodal', 'fallback', 'non-vision', 'read'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // 关键断言：非 vision 模型应当调 Read 去读附件，而不是直接回答
  expect(result.toolCalls).toContain('Read')
  expect(result.textPreview.length).toBeGreaterThan(20)
})
