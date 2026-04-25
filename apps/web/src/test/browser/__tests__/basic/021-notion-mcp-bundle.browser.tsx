/**
 * Notion MCP deferred-load bundle — 真 Notion 端到端。
 *
 * 依赖开发者本地 OpenLoaf 已通过 Connections 对话框接入真实 Notion 工作空间
 * （integration id = `notion`，server name = `Notion`）。mcpMock 基建留在
 * `mcpMockStore.ts`，此处不使用——用户同意用自己的 Notion 测试闭环。
 *
 * 验证的是 `deferredLoad: true` 整条链路：
 *   1. session preface 只广告 `<system-tag type="available-mcp">`，
 *      并不展开 14 个 `mcp__Notion__*` 工具
 *   2. 模型为了完成 Notion CRUD 必须先 `ToolSearch({names:"notion-mcp"})`
 *      把 bundle 展开到 ActivatedToolSet
 *   3. 下一轮 prepareStep 把真实 `mcp__Notion__*` 工具放进 tools 字典，
 *      模型顺序调用 notion-create-pages（创建测试页）→ notion-update-page
 *      （archived:true 归档页面）形成闭环，不在工作空间留垃圾
 *
 * 断言：
 *   - toolCalls 含 `ToolSearch`（bundle 必须走解析路径）
 *   - toolCalls 含 `mcp__Notion__notion-create-pages`（成功创建）
 *   - toolCalls 含任一 Notion 更新/归档工具（notion-update-page 或
 *     notion-move-pages 等，宽松匹配，兼容模型选择不同工具完成归档）
 *   - `toolErrorCount === 0`（真 Notion 工具成功执行）
 *   - aiJudge 确认模型在回复中提到创建 + 归档/删除都完成
 *
 * 前置：
 *   - `pnpm desktop` 运行中
 *   - Notion integration 已在 Connections 里授权完成，状态为 connected
 *   - （可选）测试过后手动检查 Notion 工作空间垃圾桶确认闭环
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
  aiJudge,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

it('basic-021-notion-mcp-bundle — Notion bundle 延迟加载 + create/archive 闭环', async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const pageTitle = `OpenLoaf e2e test — ${stamp}`
  // Prompt 刻意**不**点名具体 MCP tool，模拟真实用户语境。
  // 模型需要：
  //   1) 从 preface 的 `<system-tag type="available-mcp">` 发现 `notion-mcp` bundle
  //   2) 调 `ToolSearch({names:"notion-mcp"})` 把全部 Notion 工具拉进来
  //   3) 自行选 create + archive 类工具完成闭环
  // 如果模型直接猜 tool 名（`notion-create-pages` 等），表示它未走 bundle 路径 —
  // 这是回归信号。
  const prompt = [
    `请在我 Notion 工作区里完整跑一个闭环测试：`,
    `1) 创建一个标题叫 "${pageTitle}" 的新页面，放到任意一个我有权限的父级下。`,
    `2) 创建完成后立刻把它归档/删除，不要在工作区留下这页测试数据。`,
    `做完后用一句话汇报结果（含页面 URL 或 id）。`,
  ].join('\n')

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
      title="basic-021-notion-mcp-bundle — Notion bundle e2e"
    />,
  )

  await waitForMessageCount(2, 30_000)
  // 远端 MCP 往返 + 2 次 Notion 调用，留足预算
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: false })

  await takeProbeScreenshot('basic-021-notion-mcp-bundle')
  const meta = {
    testCase: 'basic-021-notion-mcp-bundle',
    prompt,
    result,
    description:
      'Notion MCP deferred-load bundle 真连接 e2e：preface 广告 notion-mcp → ToolSearch 展开 → notion-create-pages + notion-update-page 归档闭环',
    tags: ['basic', 'mcp', 'notion', 'toolsearch', 'deferred-bundle', 'real-integration'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // ── 断言 1：bundle 必须通过 ToolSearch 解析 ──
  expect(result.toolCalls).toContain('ToolSearch')
  const toolSearchCalls = result.toolCallDetails.filter((t) => t.name === 'ToolSearch')
  const hitBundle = toolSearchCalls.some((call) => {
    const names = (call.input as any)?.names
    return typeof names === 'string' && /notion-mcp|^notion$/i.test(names)
  })
  expect(hitBundle).toBe(true)

  // ── 断言 2：bundle 展开后真正创建了页面 ──
  expect(result.toolCalls).toContain('mcp__Notion__notion-create-pages')

  // ── 断言 3：归档/删除动作完成闭环 ──
  // 不同 Notion MCP 版本可能用 notion-update-page 或 notion-move-pages，
  // 宽松匹配任一 Notion 写工具（排除 create 本身）
  const writeCalls = result.toolCalls.filter(
    (name) =>
      name.startsWith('mcp__Notion__') &&
      name !== 'mcp__Notion__notion-create-pages' &&
      /update|move|delete|archive|trash/i.test(name),
  )
  expect(writeCalls.length).toBeGreaterThan(0)

  // ── 断言 4：没有工具失败 ──
  expect(result.toolErrorCount).toBe(0)

  // ── 断言 5：aiJudge 语义验证闭环 ──
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复必须明确提到：(a) 页面创建成功，(b) 归档/删除成功。两点都要覆盖，含糊其辞不算。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
