/**
 * Browser-mode setup file. Runs inside the Chromium worker before each test.
 *
 * 把当前测试名挂到 `window.__probeTestName`，ChatProbeHarness 用它作为
 * session title 的默认值 —— 这样 OpenLoaf 历史记录里看到的标题就和测试报告一致，
 * 不用每个 .browser.tsx 都手工传 title prop。
 *
 * 标题格式：`<suite>-<task.name>`（如 "office-create-011 — PDF 创建：生成英文发票 PDF"），
 * suite 从 `__tests__/<suite>/` 目录名取；拿不到 suite 则回退为纯 task.name。
 */
import { beforeEach } from 'vitest'

declare global {
  interface Window {
    __probeTestName?: string
    /**
     * `document.documentElement.outerHTML` snapshot taken by ChatProbeHarness right
     * before it fires `onComplete`. probe-helpers.waitForProbeResult attaches it to
     * the result as `_domSnapshot`, and the saveTestData browser command writes it
     * to `data/<testCase>.dom.html` so generate-report can render it in an iframe.
     */
    __probeDomSnapshot?: string
  }
}

function extractSuite(filepath: string | undefined): string {
  if (typeof filepath !== 'string' || filepath.length === 0) return ''
  const m = filepath.match(/__tests__\/([^/]+)\//)
  return m ? m[1] : ''
}

beforeEach((ctx) => {
  try {
    const rawName = typeof ctx?.task?.name === 'string' ? ctx.task.name.trim() : ''
    const suite = extractSuite(ctx?.task?.file?.filepath)
    const composed =
      suite && rawName && !rawName.startsWith(`${suite}-`) && !rawName.startsWith(`${suite} `)
        ? `${suite}-${rawName}`
        : rawName
    if (typeof window !== 'undefined') {
      window.__probeTestName = composed || undefined
    }
  } catch {
    // 保底：拿不到也不影响测试本体执行
  }
})
