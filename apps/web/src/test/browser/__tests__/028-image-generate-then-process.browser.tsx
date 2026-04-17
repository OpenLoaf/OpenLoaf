/**
 * 028: 云端生图 + 本地处理 — 跨能力链路。
 *
 * 第一轮：让 AI 生成一张图片
 * 第二轮：让 AI 做本地处理（转格式 + 缩放）
 *
 * 验证 CloudImageGenerate 和 ImageProcess 两套工具在同一 session 中协作。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('028 — 云端生图+本地处理：生成后转格式缩放', async () => {
  const prompt = '帮我生成一张日式拉面的图片，我要用来做公众号配图'
  const followUp = '图不错！但公众号要求 webp 格式而且不能超过 500x500，帮我转一下格式顺便缩小尺寸'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      title="028 — 生图+本地处理"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('028-image-generate-then-process')
  const meta = {
    testCase: '028-image-generate-then-process',
    prompt: `${prompt} → ${followUp}`,
    result,
    description: '生成图片后本地转格式并缩放',
    tags: ['cloud', 'image', 'generate', 'local', 'imageprocess', 'convert', 'resize', 'multi-turn'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(2)

  // 第一轮用了云端生成（命名工具 CloudImageGenerate）
  expect(result.toolCalls).toContain('CloudImageGenerate')

  // 第二轮用了本地图片处理（ImageProcess 或 Bash 调 ImageMagick/sharp 均可）
  const usedLocalProcess = result.toolCalls.includes('ImageProcess') || result.toolCalls.includes('Bash')
  expect(usedLocalProcess).toBe(true)

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已完成格式转换和尺寸调整。' +
      '以下任一情况算通过：' +
      '1) 回复提到已转为 webp 格式，并缩小到 500x500 或以内；' +
      '2) 回复给出了处理后的文件路径，文件名包含 webp。' +
      '失败：报错、未处理、或只做了转格式没缩放（反之亦然）。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
