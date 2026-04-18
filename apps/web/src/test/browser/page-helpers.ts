/**
 * 通用页面测试辅助函数（非 chat 专用）。
 *
 * 和 probe-helpers.ts 里的 chat-only 助手互为补充：
 * - 所有状态读取基于 `[data-testid="page-probe-harness"]`
 * - 不依赖 MessageList / ChatSessionProvider 等 chat context
 * - 提供通用 DOM 查询、点击、截图、等待等原语
 */
import { page } from '@vitest/browser/context'
import type { PageProbeResult, PageProbeStatus } from './PageProbeHarness'
import { waitForDomSettle } from './probe-helpers'

declare const __BROWSER_TEST_RUN_DIR__: string

// ── 基础状态读取 ──

export function getPageProbeStatus(): PageProbeStatus | 'unknown' {
  const el = page.getByTestId('page-probe-harness').element()
  return (el.getAttribute('data-probe-status') as PageProbeStatus) ?? 'unknown'
}

export function getPageProbeResult(): PageProbeResult | null {
  const el = page.getByTestId('probe-result-json').element()
  const raw = el.textContent
  if (!raw) return null
  try {
    return JSON.parse(raw) as PageProbeResult
  } catch {
    return null
  }
}

// ── 等待 ──

export async function waitForPageStatus(
  status: PageProbeStatus,
  timeout = 30_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (getPageProbeStatus() === status) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timeout waiting for page probe status: ${status}`)
}

export async function waitForPageReady(timeout = 30_000) {
  await waitForPageStatus('ready', timeout)
}

export async function waitForPageResult(timeout = 30_000): Promise<PageProbeResult> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const result = getPageProbeResult()
    if (result && result.status !== 'loading') return result
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Timeout waiting for PageProbeResult')
}

/** 通用：等待选择器出现。 */
export async function waitForSelector(
  selector: string,
  timeout = 15_000,
): Promise<Element> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`Timeout waiting for selector: ${selector}`)
}

/** 等待至少 N 个元素出现。 */
export async function waitForSelectorCount(
  selector: string,
  minCount: number,
  timeout = 15_000,
): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const count = document.querySelectorAll(selector).length
    if (count >= minCount) return count
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(
    `Timeout waiting for ${minCount}+ elements of ${selector} (last count: ${
      document.querySelectorAll(selector).length
    })`,
  )
}

/** 等待某文本出现在 DOM 任意位置。 */
export async function waitForText(
  text: string,
  timeout = 15_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (document.body.textContent?.includes(text)) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timeout waiting for text: "${text}"`)
}

// ── 交互 ──

export async function clickSelector(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) throw new Error(`Element not found: ${selector}`)
  el.click()
  await new Promise((r) => setTimeout(r, 150))
}

export async function clickByText(text: string, tagName = 'button') {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(tagName))
  const btn = candidates.find((el) => el.textContent?.trim().includes(text))
  if (!btn) throw new Error(`No ${tagName} found with text: "${text}"`)
  btn.click()
  await new Promise((r) => setTimeout(r, 150))
}

/**
 * 填充 input/textarea 并触发 React 的 onChange。
 */
export async function fillInput(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
  if (!el) throw new Error(`Input not found: ${selector}`)
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 100))
}

// ── 截图 ──

/**
 * 截图 — 临时展开 harness 及其内部所有滚动容器到自然高度，
 * 确保拿到完整内容高度而不是 viewport 截断版本。
 *
 * 时序：先 `waitForDomSettle` 等 DOM 连续 400ms 无 mutation，
 * 防止截到 streaming / 动画中的"半成品"帧。
 */
export async function takePageScreenshot(name: string) {
  const locator = page.getByTestId('page-probe-harness')
  const harness = locator.element() as HTMLElement | null
  const dir = typeof __BROWSER_TEST_RUN_DIR__ === 'string' ? __BROWSER_TEST_RUN_DIR__ : '.'

  await waitForDomSettle(harness ?? document.body, 400, 3000)

  const snapshots: Array<{ el: HTMLElement; prop: string; prev: string; hadInline: boolean }> = []
  const setStyle = (el: HTMLElement, prop: string, value: string) => {
    snapshots.push({
      el, prop,
      prev: el.style.getPropertyValue(prop),
      hadInline: el.style.getPropertyValue(prop) !== '',
    })
    el.style.setProperty(prop, value, 'important')
  }

  if (harness) {
    setStyle(harness, 'height', 'auto')
    setStyle(harness, 'min-height', '0')
    setStyle(harness, 'max-height', 'none')
    setStyle(harness, 'width', '100vw')
    setStyle(harness, 'min-width', '100vw')
    for (const el of harness.querySelectorAll<HTMLElement>('*')) {
      const s = getComputedStyle(el)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflow === 'auto' || s.overflow === 'scroll') {
        setStyle(el, 'overflow', 'visible')
        setStyle(el, 'height', 'auto')
        setStyle(el, 'min-height', 'auto')
        setStyle(el, 'max-height', 'none')
      }
    }
    setStyle(document.documentElement, 'overflow', 'visible')
    setStyle(document.documentElement, 'height', 'auto')
    setStyle(document.body, 'overflow', 'visible')
    setStyle(document.body, 'height', 'auto')
    window.scrollTo(0, 0)
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }

  try {
    return await page.screenshot({
      path: `${dir}/screenshots/${name}.png`,
      // @ts-expect-error fullPage 未在 vitest d.ts 显式导出
      fullPage: true,
    })
  } finally {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i]
      if (s.hadInline) s.el.style.setProperty(s.prop, s.prev)
      else s.el.style.removeProperty(s.prop)
    }
  }
}

// ── 读取列表 ──

/** 读取符合选择器的所有元素的 textContent 列表。 */
export function readTextContents(selector: string): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean)
}
