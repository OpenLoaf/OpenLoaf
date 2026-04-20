/**
 * Test-case 路径约定：
 *   - testCase slug 格式：`<suite>-<seq>-<short-name>`
 *   - yaml 存放位置：`.agents/skills/ai-browser-test/test-cases/<suite>/<slug>.yaml`
 *   - .browser.tsx 存放位置：`apps/web/src/test/browser/__tests__/<suite>/<seq>-<short-name>.browser.tsx`
 *
 * suite 列表由 `test-cases/` 下的子目录自动发现，**不要再维护硬编码列表** —
 * 文件系统是单一真相，新增 suite = 新建子目录。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 从 __dirname 逐级上溯找 `.agents/skills/ai-browser-test/test-cases`。
// vitest 运行时 `import.meta.url` 可能被容器改写，node 直接跑走源码位置，
// 不要硬编码固定层级，上溯方案两种环境都能命中。
function locateTestCasesDir(startDir) {
  const rel = '.agents/skills/ai-browser-test/test-cases'
  let cur = startDir
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(cur, rel)
    if (existsSync(candidate)) return candidate
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  // 回退到「相对 commands.ts 约定」的 4 级路径，保持历史行为。
  return resolve(startDir, '../../../../.agents/skills/ai-browser-test/test-cases')
}

const DEFAULT_TEST_CASES_DIR = locateTestCasesDir(__dirname)

/** 扫描 test-cases/ 子目录，返回按「名字长度降序」排序的 suite 列表。
 *  长名字优先，避免 `file` 错误吞掉 `file-read-001`。 */
export function listSuites(testCasesDir = DEFAULT_TEST_CASES_DIR) {
  if (!existsSync(testCasesDir)) return []
  return readdirSync(testCasesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
}

/** 对外导出：相对默认目录的 suite 快照。报表用来排序。 */
export const SUITES = listSuites()

/** 从 slug 解析 suite。找不到返回 null。 */
export function resolveSuite(testCase, testCasesDir = DEFAULT_TEST_CASES_DIR) {
  if (!testCase) return null
  const suites = testCasesDir === DEFAULT_TEST_CASES_DIR ? SUITES : listSuites(testCasesDir)
  for (const s of suites) {
    if (testCase === s || testCase.startsWith(s + '-')) return s
  }
  return null
}

/** 给定 slug，返回预期 yaml 绝对路径。suite 无法解析时**抛错**，不兜底到扁平根目录。 */
export function getYamlPath(testCasesDir, testCase) {
  const suite = resolveSuite(testCase, testCasesDir)
  if (!suite) {
    const available = listSuites(testCasesDir).join(', ') || '(none)'
    throw new Error(
      `[test-case-paths] 无法为 "${testCase}" 解析 suite。` +
        `先在 ${testCasesDir}/ 下建好对应子目录（现有 suite: ${available}），` +
        `或修正 testCase slug 前缀。`,
    )
  }
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
