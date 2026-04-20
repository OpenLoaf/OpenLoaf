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
import { beforeEach, afterEach } from 'vitest'
import { commands } from '@vitest/browser/context'

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
    /**
     * Map of `<sha1>.<ext>` filename → base64 string for blob: URLs that
     * appeared in the DOM at capture time. saveTestData decodes and writes
     * each to `data/assets/<filename>` so the dom.html iframe can reference
     * them via relative `src="assets/<filename>"`.
     */
    __probeBlobAssets?: Record<string, string>
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

/**
 * 从 `.browser.tsx` 文件路径派生 testCase slug（与 generate-report 的 deriveSlugFromFile / saveTestData
 * 端命名约定一致）：`__tests__/<suite>/<basename>.browser.tsx` → `<suite>-<basename>`。
 */
function deriveTestCaseSlug(filepath: string | undefined): string | null {
  if (typeof filepath !== 'string') return null
  const m = filepath.match(/__tests__\/(.+)\.browser\.tsx?$/)
  return m ? m[1].replace(/\//g, '-') : null
}

/**
 * 兜底落盘：即使测试代码里的 `saveTestData` 因为 `waitForProbeResult` 抛错 / 中途 throw
 * 而没执行到，这里也会把 harness 里现成的 probe result + prompt 抓下来写进 data/<slug>.json。
 *
 * 这样失败用例的 cases/<slug>.html 也能看到 DOM 快照 / 工具调用 / 网络请求，
 * 而不只是"失败信息"一行。
 *
 * - 幂等：测试本身也调了 saveTestData → 覆盖同名文件，字段一致，无副作用
 * - 前置：检测到 `[data-testid="chat-probe-harness"]` 才兜底（非 harness 测试跳过）
 * - 读 result：`#probe-result-json` textContent（onComplete 或 onError 都写进来）
 * - 读 prompt：harness 元素上的 `data-probe-prompt` 属性
 */
afterEach(async (ctx) => {
  try {
    if (typeof document === 'undefined') return
    const harness = document.querySelector('[data-testid="chat-probe-harness"]') as HTMLElement | null
    if (!harness) return
    const resultEl = document.getElementById('probe-result-json')
    const resultRaw = resultEl?.textContent
    if (!resultRaw || !resultRaw.trim()) return
    let result: Record<string, unknown>
    try { result = JSON.parse(resultRaw) } catch { return }

    // 把 DOM 快照 / blob assets 贴到 result 上，和 waitForProbeResult 里做的一样，
    // saveTestData 端会抽出落到 .dom.html / assets/*。
    try {
      const snap = typeof window !== 'undefined' ? window.__probeDomSnapshot : undefined
      if (typeof snap === 'string' && snap.length > 0) result._domSnapshot = snap
      const assets = typeof window !== 'undefined' ? window.__probeBlobAssets : undefined
      if (assets && typeof assets === 'object' && Object.keys(assets).length > 0) result._blobAssets = assets
    } catch { /* best-effort */ }

    const slug = deriveTestCaseSlug(ctx?.task?.file?.filepath)
    if (!slug) return
    const prompt = harness.getAttribute('data-probe-prompt') ?? ''
    const meta = {
      testCase: slug,
      prompt,
      result,
      // description / tags 留给测试里显式 saveTestData 补充；兜底时没上下文，留空即可，
      // generate-report / reviewer 可以从 test-cases/<slug>.yaml 拿到 description + purpose
      description: undefined,
      tags: [] as string[],
    }
    // 调 saveTestData + recordProbeRun —— 失败（比如 command 不存在）忽略，不影响主流程
    const cmds = commands as unknown as {
      saveTestData?: (m: unknown) => Promise<unknown>
      recordProbeRun?: (m: unknown) => Promise<unknown>
    }
    if (typeof cmds.saveTestData === 'function') {
      try { await cmds.saveTestData(meta) } catch { /* ignore */ }
    }
    if (typeof cmds.recordProbeRun === 'function') {
      try { await cmds.recordProbeRun(meta) } catch { /* ignore */ }
    }
  } catch {
    // afterEach 是最后一道兜底，任何异常都不能影响 vitest 统计
  }
})
