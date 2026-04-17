/**
 * Chat Probe 测试辅助函数。
 *
 * 提供等待完成、截图、查询消息、读取结果等工具方法，
 * 供 *.browser.tsx 测试文件使用。
 */
import { page } from '@vitest/browser/context'
import type { ProbeResult } from './ChatProbeHarness'

/**
 * 等待 chat probe 进入指定状态。
 */
export async function waitForProbeStatus(
  status: 'complete' | 'error' | 'streaming' | 'ready',
  timeout = 120_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const attr = page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-status')
    if (attr === status) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Timeout waiting for probe status: ${status}`)
}

/**
 * 等待 chat 完成（status 变为 complete）。
 */
export async function waitForChatComplete(timeout = 120_000) {
  await waitForProbeStatus('complete', timeout)
}

/**
 * 等待消息数量达到指定值。
 */
export async function waitForMessageCount(count: number, timeout = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = page.getByTestId('chat-probe-harness').element()
    const attr = el.getAttribute('data-probe-message-count')
    if (attr && Number.parseInt(attr, 10) >= count) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Timeout waiting for message count >= ${count}`)
}

/**
 * 获取当前 probe 状态。
 */
export function getProbeStatus(): string {
  return page.getByTestId('probe-status').element().textContent ?? ''
}

/**
 * 获取当前消息数量。
 */
export function getMessageCount(): number {
  const attr = page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-message-count')
  return attr ? Number.parseInt(attr, 10) : 0
}

/**
 * 获取 sessionId。
 */
export function getSessionId(): string {
  return page.getByTestId('chat-probe-harness').element().getAttribute('data-probe-session-id') ?? ''
}

/**
 * 读取 ProbeResult JSON（在 onComplete 后可用）。
 */
export function getProbeResult(): ProbeResult | null {
  const el = page.getByTestId('probe-result-json').element()
  const raw = el.textContent
  if (!raw) return null
  try {
    return JSON.parse(raw) as ProbeResult
  } catch {
    return null
  }
}

/**
 * 等待 ProbeResult 可用（onComplete 已触发）。
 */
export async function waitForProbeResult(timeout = 120_000): Promise<ProbeResult> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const result = getProbeResult()
    if (result) return result
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for ProbeResult')
}

/**
 * 截图 — 保存到当前运行目录的 screenshots/ 下，供 HTML 报告内嵌显示。
 */
declare const __BROWSER_TEST_RUN_DIR__: string
export async function takeProbeScreenshot(name: string) {
  const locator = page.getByTestId('chat-probe-harness')
  const dir = typeof __BROWSER_TEST_RUN_DIR__ === 'string' ? __BROWSER_TEST_RUN_DIR__ : '.'
  return locator.screenshot({ path: `${dir}/screenshots/${name}.png` })
}

/**
 * 等待工具审批卡片出现。
 */
export async function waitForToolApproval(timeout = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = document.querySelector('[data-testid="tool-approval-actions"]')
    if (el) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for tool approval actions')
}

/**
 * 等待 AI 回复文本包含指定内容。
 */
export async function waitForAssistantTextContains(
  text: string,
  timeout = 120_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const elements = page.getByTestId('probe-message-assistant').all()
    for (const el of elements) {
      const content = el.element().textContent
      if (content?.includes(text)) return
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Timeout waiting for assistant text containing: "${text}"`)
}

// ── AI Judge ──
// 调用服务端辅助模型进行语义评判，替代硬编码的正则断言。

export type AiJudgment = {
  /** 是否通过 */
  pass: boolean
  /** 判断理由 */
  reason: string
  /** 0-100 评分 */
  score: number
  /** 辅助模型返回的原始文本（调试用） */
  raw?: string
}

const AI_JUDGE_SYSTEM_PROMPT = `You are a test evaluator for an AI assistant. Given an AI response and evaluation criteria, judge whether the response meets the criteria.

Output ONLY a JSON object (no markdown, no extra text):
{
  "pass": true/false,
  "score": 0-100,
  "reason": "brief explanation in the same language as the criteria"
}

Scoring guide:
- 90-100: Fully meets all criteria
- 70-89: Meets most criteria with minor gaps
- 50-69: Partially meets criteria
- 0-49: Does not meet criteria

"pass" should be true when score >= 70.`

/**
 * 调用服务端辅助模型，对 AI 回复进行语义评判。
 *
 * 用法：
 * ```ts
 * const judgment = await aiJudge({
 *   serverUrl: SERVER_URL,
 *   criteria: 'AI 应该识别出这是一份 PDF 分镜脚本，提到镜头数量和景别类型',
 *   aiResponse: result.textPreview,
 *   toolCalls: result.toolCalls,
 * })
 * expect(judgment.pass).toBe(true)
 * ```
 */
export async function aiJudge(options: {
  /** 后端地址 */
  serverUrl: string
  /** 评判标准（自然语言描述） */
  criteria: string
  /** AI 的回复文本 */
  aiResponse: string
  /** AI 使用的工具列表 */
  toolCalls?: string[]
  /** 用户原始 prompt（可选，提供更多上下文） */
  userPrompt?: string
  /** 超时毫秒数（默认 30s） */
  timeout?: number
}): Promise<AiJudgment> {
  const { serverUrl, criteria, aiResponse, toolCalls, userPrompt, timeout = 30_000 } = options

  const contextParts = []
  if (userPrompt) contextParts.push(`## User Prompt\n${userPrompt}`)
  contextParts.push(`## AI Response\n${aiResponse || '(empty response)'}`)
  if (toolCalls?.length) contextParts.push(`## Tool Calls Used\n${toolCalls.join(', ')}`)
  contextParts.push(`## Evaluation Criteria\n${criteria}`)
  const context = contextParts.join('\n\n')

  const body = JSON.stringify({
    json: {
      capabilityKey: 'text.translate',
      context,
      customPrompt: AI_JUDGE_SYSTEM_PROMPT,
    },
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${serverUrl}/trpc/settings.testAuxiliaryCapability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { pass: false, score: 0, reason: `auxiliary model HTTP error: ${res.status} ${text.slice(0, 200)}` }
    }

    const json = await res.json()
    // tRPC single response format: { result: { data: { json: { ok, result, ... } } } }
    const data = json?.result?.data?.json
    if (!data?.ok) {
      return { pass: false, score: 0, reason: `auxiliary model error: ${data?.error ?? 'unknown'}` }
    }

    const raw = typeof data.result === 'string' ? data.result : JSON.stringify(data.result)
    const judgment = parseJudgment(raw)
    console.log('[aiJudge] criteria:', criteria)
    console.log('[aiJudge] aiResponse (first 300):', (aiResponse || '').slice(0, 300))
    console.log('[aiJudge] result:', JSON.stringify(judgment))
    return judgment
  } catch (err: any) {
    clearTimeout(timer)
    const reason = err?.name === 'AbortError'
      ? `auxiliary model timeout (${timeout}ms)`
      : `auxiliary model call failed: ${err?.message ?? err}`
    console.error('[aiJudge] error:', reason)
    return { pass: false, score: 0, reason }
  }
}

function parseJudgment(raw: string): AiJudgment {
  // 尝试从文本中提取 JSON
  const jsonMatch = raw.match(/\{[\s\S]*?"pass"[\s\S]*?\}/)
  if (!jsonMatch) {
    return { pass: false, score: 0, reason: `failed to parse judgment JSON from: ${raw.slice(0, 200)}`, raw }
  }
  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      pass: Boolean(parsed.pass),
      score: typeof parsed.score === 'number' ? parsed.score : (parsed.pass ? 80 : 30),
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'no reason provided',
      raw,
    }
  } catch {
    return { pass: false, score: 0, reason: `invalid JSON in judgment: ${jsonMatch[0].slice(0, 200)}`, raw }
  }
}

// ── Interactive Actions ──
// 以下函数用于 AI 介入式测试：approvalStrategy="manual" 时，
// AI agent 可以通过这些函数观察页面状态并决定操作。

export type InteractionState = {
  /** 当前 probe 状态 */
  probeStatus: string
  /** 消息数量 */
  messageCount: number
  /** 是否有待审批的工具调用 */
  hasPendingApproval: boolean
  /** 待审批工具数量 */
  pendingApprovalCount: number
  /** 页面可见文本摘要（前 1000 字符） */
  visibleTextSummary: string
  /** 是否有 AI 提问输入框 */
  hasQuestionInput: boolean
}

/**
 * 获取当前页面交互状态摘要。
 * AI agent 用这个来决定下一步操作。
 */
export function getInteractionState(): InteractionState {
  const harness = page.getByTestId('chat-probe-harness').element()
  const probeStatus = harness.getAttribute('data-probe-status') ?? 'unknown'
  const messageCount = Number.parseInt(
    harness.getAttribute('data-probe-message-count') ?? '0', 10,
  )

  // 检查待审批工具
  const approvalButtons = document.querySelectorAll('[data-testid="tool-approval-approve"]')
  const enabledApprovals = Array.from(approvalButtons).filter(
    btn => !(btn as HTMLButtonElement).disabled,
  )

  // 检查 AskUserQuestion 工具
  const questionInputs = document.querySelectorAll('[data-testid="user-input-tool"]')

  // 获取可见文本摘要
  const contentEl = harness.querySelector('[style*="flex: 1"]') ?? harness
  const visibleTextSummary = (contentEl.textContent ?? '').slice(0, 1000)

  return {
    probeStatus,
    messageCount,
    hasPendingApproval: enabledApprovals.length > 0,
    pendingApprovalCount: enabledApprovals.length,
    visibleTextSummary,
    hasQuestionInput: questionInputs.length > 0,
  }
}

/**
 * 等待出现需要交互的状态（审批弹窗或 AI 提问），或聊天完成（无待审批）。
 *
 * 注意：AI SDK 流式完成后 chat.status 变为 ready（probeStatus=complete），
 * 但此时可能仍有 pending approval（工具等待审批）。
 * 所以"有 pending approval"优先于"status complete"。
 */
export async function waitForInteraction(timeout = 120_000): Promise<InteractionState> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const state = getInteractionState()
    // 优先检查交互需求
    if (state.hasPendingApproval || state.hasQuestionInput) {
      return state
    }
    // 无交互需求且已完成/出错 → 真正结束
    if (state.probeStatus === 'complete' || state.probeStatus === 'error') {
      return state
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for interaction point')
}

/**
 * 点击第 N 个审批弹窗的「允许」按钮（默认第一个）。
 */
export async function approveCurrentTool(index = 0) {
  const buttons = document.querySelectorAll('[data-testid="tool-approval-approve"]')
  const btn = buttons[index] as HTMLButtonElement | undefined
  if (!btn) throw new Error(`No approve button found at index ${index}`)
  if (btn.disabled) throw new Error('Approve button is disabled')
  btn.click()
  // 等待一帧让 React 处理状态更新
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击第 N 个审批弹窗的「拒绝」按钮（默认第一个）。
 */
export async function rejectCurrentTool(index = 0) {
  const buttons = document.querySelectorAll('[data-testid="tool-approval-reject"]')
  const btn = buttons[index] as HTMLButtonElement | undefined
  if (!btn) throw new Error(`No reject button found at index ${index}`)
  if (btn.disabled) throw new Error('Reject button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击第 N 个审批弹窗的「始终允许」按钮。
 */
export async function alwaysAllowCurrentTool(index = 0) {
  const buttons = document.querySelectorAll('[data-testid="tool-approval-always-allow"]')
  const btn = buttons[index] as HTMLButtonElement | undefined
  if (!btn) throw new Error(`No always-allow button found at index ${index}`)
  if (btn.disabled) throw new Error('Always-allow button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 通过 CSS 选择器点击元素。
 */
export async function clickElement(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) throw new Error(`Element not found: ${selector}`)
  el.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 通过 data-testid 点击元素。
 */
export async function clickByTestId(testId: string) {
  await clickElement(`[data-testid="${testId}"]`)
}

// ── AskUserQuestion / RequestUserInput 交互 ──

export type QuestionInfo = {
  /** 工具标题 */
  title: string
  /** 模式：form（表单字段）或 choice（选项卡） */
  mode: 'form' | 'choice' | 'unknown'
  /** 表单字段列表（form 模式） */
  fields: Array<{ key: string, label: string, type: string, placeholder: string }>
  /** 选项列表（choice 模式） */
  choices: Array<{ index: number, label: string, description: string, selected: boolean }>
  /** 可见文本摘要 */
  visibleText: string
}

/**
 * 提取 RequestUserInputTool 的问题信息（标题、字段、选项等）。
 * AI agent 用这个来理解问题内容并决定答案。
 */
export function getQuestionInfo(): QuestionInfo | null {
  const tool = document.querySelector('[data-testid="user-input-tool"]')
  if (!tool) return null

  const title = tool.querySelector('[class*="muted-foreground"]')?.textContent?.trim() ?? ''

  // 检测 form 字段
  const fields: QuestionInfo['fields'] = []
  const inputs = tool.querySelectorAll('[data-testid^="user-input-field-"]')
  for (const input of inputs) {
    const testId = input.getAttribute('data-testid') ?? ''
    const key = testId.replace('user-input-field-', '')
    const label = input.closest('div')?.querySelector('label')?.textContent?.trim() ?? key
    const type = input.tagName.toLowerCase() === 'select' ? 'select'
      : input.tagName.toLowerCase() === 'textarea' ? 'textarea'
      : (input as HTMLInputElement).type ?? 'text'
    const placeholder = (input as HTMLInputElement).placeholder ?? ''
    fields.push({ key, label, type, placeholder })
  }

  // 检测 choice 选项
  const choices: QuestionInfo['choices'] = []
  const choiceBtns = tool.querySelectorAll('[data-testid^="user-input-choice-"]')
  for (const btn of choiceBtns) {
    const idx = Number.parseInt(
      (btn.getAttribute('data-testid') ?? '').replace('user-input-choice-', ''), 10,
    )
    const label = btn.getAttribute('data-choice-label') ?? btn.textContent?.trim() ?? ''
    const description = btn.querySelector('[class*="muted-foreground"]')?.textContent?.trim() ?? ''
    const selected = btn.classList.contains('selected') || btn.getAttribute('aria-selected') === 'true'
    choices.push({ index: idx, label, description, selected })
  }

  const mode = choices.length > 0 ? 'choice' : fields.length > 0 ? 'form' : 'unknown'
  const visibleText = (tool.textContent ?? '').slice(0, 500)

  return { title, mode, fields, choices, visibleText }
}

/**
 * 等待 RequestUserInputTool 出现。
 */
export async function waitForQuestionInput(timeout = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (document.querySelector('[data-testid="user-input-tool"]')) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for user input tool')
}

/**
 * 填写表单字段值（form 模式）。
 * 通过 React 的 onChange 事件触发。
 */
export async function fillFormField(key: string, value: string) {
  const input = document.querySelector(`[data-testid="user-input-field-${key}"]`) as
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!input) throw new Error(`Form field not found: ${key}`)

  // 触发 React 的 onChange（需要用 native setter）
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : input.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype,
    'value',
  )?.set
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value)
  } else {
    input.value = value
  }
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 100))
}

/**
 * 选择一个 choice 选项（choice 模式）。
 * @param labelOrIndex 选项的 label 文本或索引
 */
export async function selectChoiceOption(labelOrIndex: string | number) {
  let btn: HTMLElement | null = null
  if (typeof labelOrIndex === 'number') {
    btn = document.querySelector(`[data-testid="user-input-choice-${labelOrIndex}"]`)
  } else {
    btn = document.querySelector(`[data-choice-label="${labelOrIndex}"]`)
  }
  if (!btn) throw new Error(`Choice option not found: ${labelOrIndex}`)
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击「确认」提交表单/选项。
 */
export async function submitQuestionForm() {
  const btn = document.querySelector('[data-testid="user-input-confirm"]') as HTMLButtonElement | null
  if (!btn) throw new Error('Confirm button not found')
  if (btn.disabled) throw new Error('Confirm button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}

/**
 * 点击「跳过」。
 */
export async function skipQuestion() {
  const btn = document.querySelector('[data-testid="user-input-skip"]') as HTMLButtonElement | null
  if (!btn) throw new Error('Skip button not found')
  if (btn.disabled) throw new Error('Skip button is disabled')
  btn.click()
  await new Promise(r => setTimeout(r, 200))
}
