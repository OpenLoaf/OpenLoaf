/**
 * 027: 图片理解 + OCR — 多轮对话。
 *
 * 第一轮：让 AI 生成一张带文字的海报
 * 第二轮：让 AI 描述这张图片里有什么
 * 第三轮：让 AI 识别图片上的文字
 *
 * 验证云端 imageCaption（理解）和 ocrRecognize（OCR）能力链路。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('027 — 图片生成+理解+OCR：生成后分析', async () => {
  const prompt = '帮我画一张简约风的咖啡店促销海报，上面写着 "买一送一 限时三天"'
  const followUp1 = '这张海报画得怎么样？帮我分析一下画面构图和配色'
  const followUp2 = '顺便帮我识别一下图上写了哪些文字'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp1, followUp2]}
      title="027 — 图片理解+OCR"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('cloud-005-image-understand')
  const meta = {
    testCase: 'cloud-005-image-understand',
    prompt: `${prompt} → ${followUp1} → ${followUp2}`,
    result,
    description: '生成海报后理解并 OCR',
    tags: ['cloud', 'image', 'generate', 'caption', 'ocr', 'multi-turn'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(3)
  expect(result.messages.length).toBeGreaterThanOrEqual(6)

  // 至少调了生图工具（CloudImageGenerate）
  expect(result.toolCalls).toContain('CloudImageGenerate')

  // 理解/OCR 轮次的工具选择由 aiJudge 判定（模型自带视觉可跳过工具调用，
  // 也可能走 CloudImageUnderstand 命名工具），此处不做硬断言。

  const judgment = await aiJudge({
    testCase: 'cloud-005-image-understand',
    serverUrl: SERVER_URL,
    criteria:
      '最终回复应包含从图片中识别出的文字内容。' +
      '以下任一情况算通过：' +
      '1) 回复提到了 "买一送一" 或 "限时三天" 等海报上的文字；' +
      '2) 回复说明了识别到的文字内容，即使不完全匹配原文；' +
      '3) AI 用自身视觉能力直接读出了图上的文字（不一定调了 OCR 工具）。' +
      '失败：回复为空、报错、或完全没有提到图片上的文字。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: followUp2,
  })
  expect(judgment.pass).toBe(true)
})
