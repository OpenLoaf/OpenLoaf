/**
 * Test-case 路径约定：
 *   - testCase slug 格式：`<suite>-<seq>-<short-name>`
 *   - yaml 存放位置：`.agents/skills/ai-browser-test/test-cases/<suite>/<slug>.yaml`
 *   - .browser.tsx 存放位置：`apps/web/src/test/browser/__tests__/<suite>/<seq>-<short-name>.browser.tsx`
 *
 * SUITES 常量用于从 slug 前缀解析 suite，因为 suite 名本身可以含 `-`
 * （如 file-read、office-create），不能简单按第一个 `-` split。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const SUITES = [
  'basic',
  'file-read',
  'office-create',
  'cloud',
  'media-process',
  'multimodal',
  'approval',
  'chat-ui',
  'memory',
  'skill-market',
]

/** 从 slug 解析 suite。找不到返回 null。 */
export function resolveSuite(testCase) {
  if (!testCase) return null
  for (const s of SUITES) {
    if (testCase === s || testCase.startsWith(s + '-')) return s
  }
  return null
}

/** 给定 testCase slug，返回预期的 yaml 绝对路径（不校验是否存在）。 */
export function getYamlPath(testCasesDir, testCase) {
  const suite = resolveSuite(testCase)
  if (!suite) return join(testCasesDir, `${testCase}.yaml`)
  return join(testCasesDir, suite, `${testCase}.yaml`)
}

/** 递归扫描 test-cases 目录，返回 { [name]: absolutePath } 索引。 */
export function collectAllYamls(testCasesDir) {
  const out = {}
  if (!existsSync(testCasesDir)) return out
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) { walk(abs); continue }
      if (!entry.name.endsWith('.yaml')) continue
      try {
        const raw = readFileSync(abs, 'utf-8')
        const m = raw.match(/^name:\s*(\S+)/m)
        const name = m ? m[1] : entry.name.replace(/\.yaml$/, '')
        out[name] = abs
      } catch {}
    }
  }
  walk(testCasesDir)
  return out
}
