/**
 * 029: 纯本地图片处理 — 不走云端。
 *
 * 用户上传一张 jpg 图片，要求：
 * 第一轮：查看图片信息（分辨率、格式等）
 * 第二轮：转成 png 并加灰度效果
 *
 * 验证 ImageProcess 工具的 get-info / convert / grayscale 能力。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('029 — 纯本地图片处理：查看信息+转格式+灰度', async () => {
  const sessionId = `chat_probe_029_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '这张图片是什么格式的？分辨率多少？'
  const followUp = '帮我把它转成 png 格式，再弄成黑白的'

  const { tags } = await (commands as any).stageAttachments({
    sessionId,
    files: ['21fa3e725d110225873bcc2b9eadae99.jpg'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      sessionId={sessionId}
      title="029 — 本地图片处理"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('media-process-003-local-image-process')
  const meta = {
    testCase: 'media-process-003-local-image-process',
    prompt: `${prompt} → ${followUp}`,
    result,
    description: '本地图像处理：查信息、转 PNG、灰度化',
    tags: ['local', 'imageprocess', 'get-info', 'convert', 'grayscale', 'multi-turn'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(2)

  // 应该用了 ImageProcess 或 Read 来获取图片信息
  const usedImageTool = result.toolCalls.includes('ImageProcess') || result.toolCalls.includes('Read')
  expect(usedImageTool).toBe(true)

  // 不应该调云端生成工具（纯本地处理）
  expect(result.toolCalls).not.toContain('CloudImageGenerate')
  expect(result.toolCalls).not.toContain('CloudImageEdit')
  expect(result.toolCalls).not.toContain('CloudVideoGenerate')
  expect(result.toolCalls).not.toContain('CloudTTS')

  const judgment = await aiJudge({
    testCase: 'media-process-003-local-image-process',
    serverUrl: SERVER_URL,
    criteria:
      '第二轮回复应确认已完成图片处理。以下任一情况算通过：' +
      '1) 回复提到已转成 png 或已应用灰度/黑白效果；' +
      '2) 回复给出了处理后的文件名或路径。' +
      '不应有报错。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
