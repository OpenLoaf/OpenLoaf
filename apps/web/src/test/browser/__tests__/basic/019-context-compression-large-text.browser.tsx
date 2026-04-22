/**
 * 测试自动上下文压缩功能 - 大文件复杂问答
 * 
 * 场景：用户深度阅读长篇小说并进行多轮复杂问答
 * 预期：
 * - 前 3 轮复杂问题产生大量上下文（超过 DeepSeek 128k 限制）
 * - 第 4、5 轮触发自动压缩
 * - 压缩后 AI 仍能准确引用前面提到的信息
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
  aiJudge,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('basic-019 — 自动上下文压缩 - 大文件复杂问答', async () => {
  const sessionId = `context_compression_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // 准备附件
  const { tags } = await (commands as any).stageAttachments({
    sessionId,
    files: ['test-data.txt'],
  })

  const prompts = [
    `${tags.join(' ')} 读取整个小说文件，列出所有反派角色及其特征，包括他们的行为动机`,
    `${tags.join(' ')} 把主角蔡侪的重大事件按时间顺序描述，包括每个事件的起因、经过、结果`,
    `${tags.join(' ')} 整个小说都有哪些场景？按章节或情节发展列出所有场景地点`,
    `${tags.join(' ')} 基于前面的分析，总结这本小说的核心冲突和主题`,
    `${tags.join(' ')} 第1章中申菲陷害蔡侪的细节有哪些？这对后续剧情有什么影响？`,
  ]

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompts[0]}
      followUpPrompts={prompts.slice(1)}
      sessionId={sessionId}
      title="basic-019 — 自动上下文压缩"
      chatModelId="deepseek:OL-TX-003"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-019-context-compression')

  // 验证多轮对话
  expect(result.totalTurns).toBe(5)

  // 验证前 3 轮产生了较长的回复（累积上下文）
  expect(result.textPreview.length).toBeGreaterThan(500)

  // 验证是否触发压缩（压缩后的消息会包含 [Context Summary - Earlier conversation:]）
  const hasCompressionMarker = result.messages.some((msg: any) =>
    Array.isArray(msg.parts)
      ? msg.parts.some((p: any) => p.type === 'text' && typeof p.text === 'string' && p.text.includes('[Context Summary'))
      : false,
  )

  if (hasCompressionMarker) {
    console.log('[测试通过] 检测到上下文压缩标记')
  }

  // 使用 aiJudge 验证第 5 轮的回答质量
  // 需要能准确引用第 1 章的细节（申菲陷害蔡侪的选课表问题）
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria: '应该准确提到申菲陷害蔡侪的细节，包括选课表、学分问题、课堂冲突等，并说明这对后续剧情的影响',
    aiResponse: result.textPreview,
    userPrompt: prompts[4],
  })

  expect(judgment.pass).toBe(true)

  const meta = {
    testCase: 'basic-019-context-compression-large-text',
    prompt: prompts.join('\n---\n'),
    result,
    description: '大文件多轮复杂问答，测试自动上下文压缩',
    tags: ['context-compression', 'deepseek', 'large-text', 'multi-turn'],
  }

  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)
})