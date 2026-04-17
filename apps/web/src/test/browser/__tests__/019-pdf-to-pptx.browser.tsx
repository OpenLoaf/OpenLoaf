/**
 * 019: PDF → PPTX 多轮：读 PDF 分镜脚本后生成汇报 PPT。
 *
 * 用户场景：手上有一份 PDF 分镜，需要快速做成 PPT 给团队分享关键信息。
 * 第一轮：让 AI 读取并理解 PDF 内容
 * 第二轮：基于 PDF 内容生成汇报 PPT
 *
 * 验证：
 * 1) 读取了 PDF（Read/DocPreview）
 * 2) 生成了 PPTX（PptxMutate）
 * 3) 多轮对话连贯
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('019 — PDF → PPTX：读分镜脚本后生成汇报 PPT', async () => {
  const sessionId = `chat_probe_019_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请阅读这份 PDF 分镜脚本，帮我提炼 3-5 个关键镜头信息。'

  const followUp =
    '好的，请把这些关键镜头做成一份 PPT，3-4 页即可，' +
    '包含封面页和每个关键镜头的描述页。' +
    '保存为 storyboard_slides_019.pptx。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      sessionId={sessionId}
      approvalStrategy="approve-all"
    />,
  )

  // 多轮 + 跨格式操作
  await waitForChatComplete(240_000)
  const result = await waitForProbeResult(30_000)

  await takeProbeScreenshot('019-pdf-to-pptx')
  const meta = {
    testCase: '019-pdf-to-pptx', prompt: `${prompt} → ${followUp}`, result,
    description: '多轮：读 PDF 分镜后生成 PPTX',
    tags: ['multi-turn', 'pdf', 'pptx', 'pptxmutate', 'cross-format'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 多轮验证
  expect(result.totalTurns).toBe(2)
  expect(result.messages.length).toBeGreaterThanOrEqual(4)

  // 工具调用：读取了 PDF + 生成了 PPTX
  const usedRead = result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')
  const usedPptxMutate = result.toolCalls.includes('PptxMutate')
  expect(usedRead).toBe(true)
  expect(usedPptxMutate).toBe(true)

  // AI 语义评判
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '这是多轮对话的第二轮回复。AI 应确认已基于 PDF 分镜内容生成了 PPT 文件。' +
      '满足以下任一即通过：1) 提到 PPT/幻灯片已创建/生成；' +
      '2) 提到文件名或页数；3) 工具调用包含 PptxMutate 且回复不为空',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
