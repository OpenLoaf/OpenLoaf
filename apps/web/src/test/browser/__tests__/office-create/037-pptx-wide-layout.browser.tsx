/**
 * office-create/037: 两页 PPT 宽屏布局回归。
 *
 * 回归来源：/Users/zhao/OpenLoafData/chat-history/chat_20260422_181128_4p8bbiem
 * 故障类型：VISUAL_REGRESSION / 伪成功
 * 根因：pptx skill 示例把 `LAYOUT_16x9` 和 `13.33 × 7.5` 坐标混用，导致生成产物页面尺寸只有
 * 10 × 5.625 英寸，内容被画到页外。这个用例直接检查生成的 PPTX 包内 `ppt/presentation.xml`
 * 的页面尺寸，确保宽屏产物真的是 13.333 × 7.5。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'
const MODEL_ID = 'qwen:OL-TX-008'
const MODEL_SOURCE = 'cloud' as const

function extractWrittenFiles(output: unknown): string[] {
  let value = output
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!value || typeof value !== 'object') return []
  const files = (value as { writtenFiles?: unknown }).writtenFiles
  return Array.isArray(files) ? files.filter((item): item is string => typeof item === 'string') : []
}

it('office-create-037-pptx-wide-layout — 两页 PPT 应生成标准宽屏页面尺寸', async () => {
  const prompt =
    '创建一个两页的 PPT，内容是关于虚拟电厂的研究，只需要两页就可以。' +
    '第 1 页做封面页，第 2 页做核心技术方向概览。' +
    '保存为 vpp_research_037.pptx。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
      title="office-create-037 — 两页虚拟电厂 PPT 宽屏布局"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult(180_000)

  await takeProbeScreenshot('office-create-037-pptx-wide-layout')
  const meta = {
    testCase: 'office-create-037-pptx-wide-layout',
    prompt,
    result,
    description: '回归：PPT 生成后页面尺寸必须是标准宽屏，不能再出现 16:9 坐标错配导致的裁切',
    tags: ['office-create', 'pptx', 'jssandbox', 'layout', 'regression'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('JsSandbox')

  const jsSandboxCall = [...(result.toolCallDetails ?? [])]
    .reverse()
    .find((detail: any) => detail.name === 'JsSandbox' && !detail.hasError)
  expect(jsSandboxCall, '应至少有一次成功的 JsSandbox 生成调用').toBeTruthy()

  const writtenFiles = extractWrittenFiles(jsSandboxCall?.output)
  const pptxPath = writtenFiles.find((file) => file.endsWith('.pptx')) ?? ''
  expect(pptxPath, 'JsSandbox 输出里应包含生成的 .pptx 路径').toBeTruthy()

  const layout = await (commands as any).inspectPptxLayout({ filePath: pptxPath })
  if (!layout?.ok) {
    throw new Error(layout?.error ?? 'inspectPptxLayout failed')
  }

  expect(layout.slideCount).toBe(2)
  expect(layout.widthEmu).toBe(12192000)
  expect(layout.heightEmu).toBe(6858000)
  expect(layout.widthInches).toBe(13.333)
  expect(layout.heightInches).toBe(7.5)

  const judgment = await aiJudge({
    testCase: 'office-create-037-pptx-wide-layout',
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已创建一份两页的虚拟电厂研究 PPT，并明确提到文件已生成或可打开。' +
      '可接受复述封面页/核心技术方向页的内容，但不应只给空泛成功话术。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
