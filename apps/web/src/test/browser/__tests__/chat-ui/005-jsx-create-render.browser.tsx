/**
 * JsxCreate 工具回归：可视化场景下 AI 必须用 JsxCreate 渲染一张卡片到消息流里。
 *
 * 场景：
 *   - 用户要「对比 Python / Go / Rust 特点，用一张汇总卡片展示」—— 典型结构化输出，
 *     visualization-ops-skill 预期被 LoadSkill 加载、再 ToolSearch 激活 JsxCreate。
 *   - 目标不是答案质量，是守住一整条"LoadSkill → JsxCreate 调用 → 落盘 asset/jsx/
 *     → 前端 JSXPreview 渲染"链路无错。
 *
 * 覆盖 2026-04-19 这次 asset/jsx/ 路径迁移：
 *   1. JsxCreate 写入目录应是 <sessionDir>/asset/jsx/（回报 path 必须带 /asset/jsx/）
 *   2. Edit 工具对该路径的 writable-root 检查天然通过（本测试不主动触发 Edit，
 *      但一旦路径配错，后续「模型 JsxCreate 校验失败→Edit 修正」流程会再次炸）
 *   3. 前端 JSXPreview 用新 URI 模板（${CHAT_SESSION_DIR}/asset/jsx/<messageId>.jsx）
 *      读文件并渲染，DOM 上必须落出 `.jsx-preview-content` 且有实际内容
 *   4. react-jsx-parser 渲染不应抛 `[jsx-preview]` console.error —— 这是
 *      JSXEmptyExpression / 非法 JSX 的唯一可自动抓的视觉 error 信号
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForMessageCount,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('chat-ui-005-jsx-create-render — visualization-ops + JsxCreate 链路完整落盘并渲染', async () => {
  const prompt = [
    '请用一张汇总卡片对比 Python、Go、Rust 三门后端语言的主要特点：',
    '性能、易用性、典型使用场景三个维度各给一句。',
    '信息你基于常识直接给出，不需要联网搜索。',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  // 流式完成后 ChatProbeHarness 仍需要一小段时间 drain observers + 写 ProbeResult
  // 到 DOM；放宽超时避免在 JSX 文件首次加载 / DOM snapshot 捕获时踩坑。
  const result = await waitForProbeResult(60_000)

  await takeProbeScreenshot('chat-ui-005-jsx-create-render')

  const meta = {
    testCase: 'chat-ui-005-jsx-create-render',
    prompt,
    result,
    description: 'LoadSkill(visualization-ops) → JsxCreate 成功渲染卡片，asset/jsx 路径与 JSXPreview 无错',
    tags: ['chat-ui', 'jsx-create', 'visualization-ops', 'render', 'regression'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 基本链路 ──
  expect(result.status).toBe('ok')

  // ── JsxCreate 必须被调用 ──
  // LoadSkill(visualization-ops-skill) 理论上应先于 JsxCreate，但实际模型可能
  // 绕开 LoadSkill 直接 ToolSearch + JsxCreate。此测试聚焦"JsxCreate 工具链路"，
  // skill 触发路径的合规性另外由 visualization skill 专项测试覆盖，这里不硬断言。
  expect(result.toolCalls).toContain('JsxCreate')
  const jsxCalls = result.toolCallDetails.filter(t => t.name === 'JsxCreate')
  expect(jsxCalls.length).toBeGreaterThanOrEqual(1)

  // ── JsxCreate 调用必须成功（无 hasError，output 带 path） ──
  // path 是相对 writable root（project-less 场景 = <sessionDir>/asset/）的相对路径。
  // 迁移后写入在 <sessionDir>/asset/jsx/，relative 应是 `jsx/<id>.jsx`；
  // 迁移前写入在 <sessionDir>/jsx/，relative 会是 `../jsx/<id>.jsx`——
  // 断言 "不以 .. 开头 + 以 jsx/ 开头 + .jsx 结尾" 就能精准卡住路径回退。
  const lastJsxCall = jsxCalls.at(-1)!
  expect(lastJsxCall.hasError).toBe(false)
  const jsxOutput = lastJsxCall.output as any
  const reportedPath = typeof jsxOutput?.path === 'string' ? jsxOutput.path : ''
  expect(reportedPath).toMatch(/^jsx\/.+\.jsx$/)
  expect(reportedPath.startsWith('..')).toBe(false)

  // ── 链路任一环节出错都视为回归 ──
  expect(result.toolErrorCount).toBe(0)

  // ── DOM：JSXPreview 渲染出内容（至少一条 .jsx-preview-content 且含实际文本） ──
  const previews = Array.from(
    document.querySelectorAll('.jsx-preview-content'),
  ) as HTMLElement[]
  expect(previews.length).toBeGreaterThanOrEqual(1)
  const renderedText = previews.map(el => el.textContent ?? '').join('').trim()
  expect(renderedText.length).toBeGreaterThan(20)

  // ── console：任何 [jsx-preview] 前缀的 error 都是致命回归 ──
  // jsx-preview.tsx 的 handleError (line 210-232) 保证流式期间 silent return，
  // 不会 console.error。所以 `[jsx-preview]` 前缀出现在 console 上 = 非流式阶段
  // 的真渲染错误，用户屏幕上已经是红色 error 气泡（整张卡片变红 error 卡）。
  //
  // 不再分类"致命 / 噪音"：
  //   - JSXEmptyExpression — `{/* 注释 */}` 未被剥掉
  //   - Unexpected token — 语法崩溃
  //   - Expected corresponding JSX closing tag — react-jsx-parser 拒解析
  //   - 其他 react-jsx-parser 抛出的 Error
  // 这些在非流式阶段出现都是回归，不存在"允许的噪音"——流式半截 tag 已被 silent
  // return 过滤掉。之前把 "Expected corresponding JSX closing tag" 当噪音豁免是
  // 把真红卡放行的漏洞（参见 aiJudge EVALUATION.json 的 visual FAIL 对照）。
  const jsxPreviewErrors = (result.consoleLogs ?? []).filter(
    entry => entry.level === 'error' && entry.text.includes('[jsx-preview]'),
  )
  expect(jsxPreviewErrors).toEqual([])
}, 300_000)
