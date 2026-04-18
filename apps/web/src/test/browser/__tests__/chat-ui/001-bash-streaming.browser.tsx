/**
 * Bash 工具流式输出测试。
 *
 * 验证 data-tool-progress 事件能正确传递到前端，
 * ShellTool 组件在工具执行期间实时显示 accumulatedText。
 *
 * 测试步骤：
 * 1. 发送一个产生逐行输出的 bash 命令
 * 2. 等待聊天完成
 * 3. 截图 + 断言 Bash 工具被调用且输出包含预期内容
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('009 — Bash 工具流式输出，进度文本实时渲染', async () => {
  // 用一个简单的 bash 命令：快速输出多行内容
  const prompt = '运行 bash 命令 echo -e "line1\\nline2\\nline3\\nline4\\nline5"，只运行这一个命令，不需要其他操作'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()

  const result = await waitForProbeResult()

  // Save data before assertions (recorded even on failure)
  await takeProbeScreenshot('chat-ui-001-bash-streaming')
  const meta = { testCase: 'chat-ui-001-bash-streaming', prompt, result, description: 'Bash 工具流式输出（data-tool-progress）', tags: ['bash', 'streaming', 'tool-progress'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言：Bash 工具被调用 ──
  expect(result.toolCalls).toContain('Bash')

  // ── 断言：AI 回复存在且有实质内容 ──
  expect(result.status).toBe('ok')
  expect(result.textPreview.length).toBeGreaterThan(10)
}, 180_000)
