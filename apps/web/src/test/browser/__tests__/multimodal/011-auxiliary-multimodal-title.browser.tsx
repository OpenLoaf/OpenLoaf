/**
 * 036: 辅助模型（chat.title capability）看到原生图片生成标题。
 *
 * 流程：
 *   1. 带图 + "看看这图"的对话完成一轮
 *   2. 调 tRPC chat.autoTitle 触发辅助模型生成标题
 *   3. 断言 title 非空、非默认占位、不是附件文件名（说明辅助模型真的"看到"了图）
 *
 * 覆盖 df13ff1b：auxiliaryInfer 支持 messages 入参，带图消息走原生 vision。
 *
 * 注意：ChatProbeHarness 不传 title，让 session 保持 isUserRename=false，
 * autoTitle 才会实际跑。
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
const DEFAULT_PLACEHOLDER_TITLES = new Set(['', 'New chat', 'New Chat', '新对话', '新聊天'])

it('036 — 辅助模型带图生成标题：autoTitle 走原生 vision', async () => {
  const sessionId = `chat_probe_036_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '帮我看看这张图里是什么。'

  const { tags, copied } = await (commands as any).stageAttachments({
    sessionId, files: ['21fa3e725d110225873bcc2b9eadae99.jpg'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`
  const fileBase = copied?.[0]?.basename ?? ''
  const fileStem = fileBase.replace(/\.[^.]+$/, '')

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      sessionId={sessionId}
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
      // 显式 title={null}：跳过 harness 默认的 testName fallback，
      // 保持 isUserRename=false，让 autoTitle 真正跑
      title={null}
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  // 对话完成后触发 autoTitle
  const titleResp = await (commands as any).fetchAutoTitle({
    serverUrl: SERVER_URL,
    sessionId,
  })

  await takeProbeScreenshot('multimodal-011-auxiliary-multimodal-title')
  const meta = {
    testCase: 'multimodal-011-auxiliary-multimodal-title',
    prompt,
    model: MODEL_ID,
    result,
    description: 'chat.autoTitle 辅助模型原生看图生成标题',
    tags: ['multimodal', 'auxiliary-model', 'chat-title'],
    extra: { titleResp },
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(titleResp.ok).toBe(true)
  const title = (titleResp.title ?? '').trim()
  expect(title.length).toBeGreaterThan(0)
  expect(DEFAULT_PLACEHOLDER_TITLES.has(title)).toBe(false)
  // 标题不应是附件文件名（说明 aux 模型不是只看文件名 fallback）
  expect(title).not.toBe(fileBase)
  if (fileStem) expect(title.includes(fileStem)).toBe(false)
})
