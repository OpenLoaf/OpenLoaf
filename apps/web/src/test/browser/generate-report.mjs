#!/usr/bin/env node
/**
 * 生成自包含 HTML 测试报告（双击即可打开，无需 HTTP server）。
 *
 * 两个产物：
 *   1. browser-test-runs/<ts>/index.html  — 本次 run 的完整报告（screenshot base64 内嵌）
 *   2. browser-test-runs/index.html       — 所有 run 的索引主页（按时间倒序）
 *
 * 数据源：
 *   - browser-test-runs/<ts>/results.json  (vitest json reporter)
 *   - browser-test-runs/<ts>/data/*.json   (saveTestData 写入的 ProbeResult)
 *   - browser-test-runs/<ts>/screenshots/*.png
 *   - browser-test-runs/<ts>/evaluations/<testCase>/*.json (critic 子 agent 填的评审)
 *   - .agents/skills/ai-browser-test/runs.jsonl (跨 run 的事实日志)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import YAML from 'yaml'
import { SUITES, resolveSuite, collectAllYamls } from './test-case-paths.mjs'
import { buildDiagnosePromptText } from './lib/build-diagnose-prompt.mjs'
import { extractCaseSummary, SUMMARY_SCHEMA_VERSION } from './lib/case-summary.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsRoot = join(webRoot, 'browser-test-runs')
const runsJsonl = join(monoRoot, '.agents/skills/ai-browser-test/runs.jsonl')

// 目录名三种历史格式共存：
//   1. 纯 timestamp           `20260417_150958`            （老）
//   2. seq + timestamp        `0042_20260417_150958`       （过渡）
//   3. 纯 seq                 `0028`                       （现在）
// 统一按 seq 数值降序取"最新"：seq 优先取目录名前导数字段，无前导数字回落到 run-meta.json.seq，
// 再不行就当作 0 排到最后，让带 seq 的新 run 总是胜出。
const RUN_DIR_RE = /^(?:\d{4,}|\d{8}_\d{6}|\d+_\d{8}_\d{6})$/

function getRunSeq(runsRoot, dir) {
  const leading = dir.match(/^(\d+)/)
  if (leading) {
    const n = Number.parseInt(leading[1], 10)
    // 老的纯 timestamp 以 `2026...` 开头，数值极大但并不代表 seq；用 run-meta 兜底
    if (n < 1_000_000) return n
  }
  try {
    const meta = JSON.parse(readFileSync(join(runsRoot, dir, 'run-meta.json'), 'utf-8'))
    if (typeof meta?.seq === 'number') return meta.seq
  } catch { /* ignore */ }
  return 0
}

function listRunDirsBySeqDesc(opts = { requireResults: false }) {
  if (!existsSync(runsRoot)) return []
  return readdirSync(runsRoot)
    .filter(d => RUN_DIR_RE.test(d) && statSync(join(runsRoot, d)).isDirectory())
    .filter(d => !opts.requireResults || existsSync(join(runsRoot, d, 'results.json')))
    .map(d => ({ name: d, seq: getRunSeq(runsRoot, d) }))
    .sort((a, b) => b.seq - a.seq || b.name.localeCompare(a.name))
    .map(x => x.name)
}

function findLatestRunDir() {
  // 空壳目录（只有 run-meta.json、无 results.json）被 vitest import 副作用创建，不算真实 run
  const dirs = listRunDirsBySeqDesc({ requireResults: true })
  return dirs.length ? join(runsRoot, dirs[0]) : null
}

const RUN_ARG = process.argv[2]
const runDir = RUN_ARG
  ? resolve(RUN_ARG)
  : process.env.BROWSER_TEST_RUN_DIR
    ? process.env.BROWSER_TEST_RUN_DIR
    : findLatestRunDir()
if (!runDir || !existsSync(runDir)) {
  console.log('No run dir found.')
  process.exit(0)
}
const runTs = basename(runDir)

// 当前 run 的 meta（含 batch / note / modelOverride 等 runner 注入字段）
const runMetaPath = join(runDir, 'run-meta.json')
const runMeta = existsSync(runMetaPath) ? safeJson(readFileSync(runMetaPath, 'utf-8'), {}) : {}

// ── 读数据 ──
const resultsJsonPath = join(runDir, 'results.json')
const vitestData = existsSync(resultsJsonPath)
  ? safeJson(readFileSync(resultsJsonPath, 'utf-8'), {})
  : {}

const dataDir = join(runDir, 'data')
const probeByTestCase = new Map()
const domHtmlByTestCase = new Map()
if (existsSync(dataDir)) {
  for (const f of readdirSync(dataDir)) {
    if (f.endsWith('.json')) {
      const d = safeJson(readFileSync(join(dataDir, f), 'utf-8'))
      if (d?.testCase) probeByTestCase.set(d.testCase, d)
    } else if (f.endsWith('.dom.html')) {
      // saveTestData 落盘时把 `result._domSnapshot` 抽出来单独写到 sibling .dom.html。
      // 文件名格式 `<sanitized testCase>.dom.html`，要与 probeByTestCase 的 key 对齐：
      // saveTestData 用 `(input.testCase||'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')`
      // 做 sanitize，这里反向用 sanitize 后的 stem 当 key 即可（findProbe 命中后再
      // 用 probe.testCase 原值查 dom 时也走同一个 sanitize 路径）。
      const stem = f.replace(/\.dom\.html$/, '')
      try {
        domHtmlByTestCase.set(stem, readFileSync(join(dataDir, f), 'utf-8'))
      } catch { /* ignore */ }
    }
  }
}

function lookupDomSnapshot(testCase) {
  if (!testCase) return null
  const sanitized = String(testCase).replace(/[^a-zA-Z0-9_-]/g, '_')
  return domHtmlByTestCase.get(sanitized) ?? domHtmlByTestCase.get(testCase) ?? null
}

// screenshots/*.png 索引：按文件名前缀匹配 testCase。
// 报告里只显示文件名 + 点击 lightbox 预览，PNG 走相对路径不内嵌（避免 index.html 撑爆）。
const screenshotsByTestCase = new Map()
const screenshotsRoot = join(runDir, 'screenshots')
if (existsSync(screenshotsRoot)) {
  for (const f of readdirSync(screenshotsRoot)) {
    if (!/\.(png|jpe?g|webp)$/i.test(f)) continue
    // 文件名形如 `<testCase>.png` 或 `<testCase>__<step>.png`，取首个 `__` 之前的段当 key
    const stem = f.replace(/\.(png|jpe?g|webp)$/i, '')
    const key = stem.split('__')[0]
    if (!screenshotsByTestCase.has(key)) screenshotsByTestCase.set(key, [])
    screenshotsByTestCase.get(key).push(f)
  }
}
function lookupScreenshots(testCase) {
  if (!testCase) return []
  const sanitized = String(testCase).replace(/[^a-zA-Z0-9_-]/g, '_')
  return (screenshotsByTestCase.get(sanitized) ?? screenshotsByTestCase.get(testCase) ?? []).slice().sort()
}

// 评审扫描：优先新格式 review.json（aggregate + evaluators[]），否则降级老格式 <critic>-critic.json
const evalsByTestCase = new Map()
const aggByTestCase = new Map()
const evalRoot = join(runDir, 'evaluations')
if (existsSync(evalRoot)) {
  for (const dirent of readdirSync(evalRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('_')) continue
    const tc = dirent.name
    const tcDir = join(evalRoot, tc)
    const files = readdirSync(tcDir)

    if (files.includes('review.json')) {
      const review = safeJson(readFileSync(join(tcDir, 'review.json'), 'utf-8'))
      if (review?.evaluators?.length) {
        evalsByTestCase.set(tc, review.evaluators.map(ev => ({
          critic: `${ev.name}-critic`,
          data: {
            verdict: ev.verdict,
            score: ev.score,
            pros: ev.pros ?? [],
            cons: ev.cons ?? [],
            summary: '',
          },
        })))
        if (review.aggregate) {
          aggByTestCase.set(tc, {
            verdict: review.aggregate.verdict,
            score: review.aggregate.score,
            summary: review.aggregate.summary,
          })
        }
        continue
      }
    }

    const list = []
    for (const f of files) {
      if (!f.endsWith('.json') || f === 'input.json' || f === 'review.json') continue
      const d = safeJson(readFileSync(join(tcDir, f), 'utf-8'))
      if (d && (d.verdict || d.score != null)) {
        list.push({ critic: f.replace(/\.json$/, ''), data: d })
      }
    }
    if (list.length) evalsByTestCase.set(tc, list)
  }
}

// 同 testCase 历史 nav 的权威信息来自 vitest results.json：
//   - status: assertion 是否通过（probe status 只是 "stream 正常完成"，server 把
//     "请求失败：模型未在服务商配置中启用" 这种错误作为 assistant text 返回时
//     不会触发 chat.error，probe 会错记成 ok）
//   - duration: vitest it() 整体耗时（probe elapsedMs 只是 sendMessage → stream done，
//     错误路径上会比 vitest duration 小很多，看上去和卡片顶部数字对不上）
// 按 seq 懒加载 + 缓存，匹配逻辑和 findProbe ① 一致：用测试文件 basename endsWith。
const vitestInfoCacheBySeq = new Map()
function getVitestInfoForRun(seq, testCase) {
  if (!seq || !testCase) return null
  if (!vitestInfoCacheBySeq.has(seq)) {
    const p = join(runsRoot, seq, 'results.json')
    const byBase = new Map()
    if (existsSync(p)) {
      const data = safeJson(readFileSync(p, 'utf-8'), {})
      for (const file of data?.testResults ?? []) {
        const filePath = file?.name ?? ''
        const base = String(filePath).split('/').pop()?.replace(/\.browser\.tsx?$/, '') ?? ''
        if (!base) continue
        // 聚合该文件内所有 assertion：任一 fail → 该文件 fail；duration 取最大值
        let fails = false
        let maxDur = 0
        for (const a of file.assertionResults ?? []) {
          if (a.status === 'failed') fails = true
          const d = Number(a.duration) || 0
          if (d > maxDur) maxDur = d
        }
        byBase.set(base, { status: fails ? 'failed' : 'passed', durationMs: maxDur })
      }
    }
    vitestInfoCacheBySeq.set(seq, byBase)
  }
  const byBase = vitestInfoCacheBySeq.get(seq)
  if (!byBase || byBase.size === 0) return null
  for (const [base, info] of byBase) {
    if (testCase === base || testCase.endsWith(`-${base}`) || testCase.endsWith(base)) {
      return info
    }
  }
  return null
}

// runs.jsonl 当前 run 的行 + 全量按 testCase 索引（按时间倒序）。
// 全量索引用于：
//   1) 复制 prompt 时附"上次同 testCase run"对比段
//   2) 左侧 sidebar 后续渲染同 testCase 历史 nav（待加）
const runRecordByTestCase = new Map()
const allRunsByTestCase = new Map() // testCase → [r, r, ...]（按 runAt 倒序，最新在前）
if (existsSync(runsJsonl)) {
  const allRows = []
  for (const line of readFileSync(runsJsonl, 'utf-8').split('\n').filter(Boolean)) {
    const r = safeJson(line)
    if (!r?.testCase) continue
    allRows.push(r)
    if (typeof r.screenshotsDir === 'string' && r.screenshotsDir.includes(runTs)) {
      runRecordByTestCase.set(r.testCase, r)
    }
  }
  // 按 testCase 分组，每组按 runAt 降序（最新在前）
  const grouped = new Map()
  for (const r of allRows) {
    const arr = grouped.get(r.testCase) || []
    arr.push(r)
    grouped.set(r.testCase, arr)
  }
  for (const [tc, arr] of grouped) {
    arr.sort((a, b) => String(b.runAt || '').localeCompare(String(a.runAt || '')))
    allRunsByTestCase.set(tc, arr)
  }
}

// 提取出 "上次同 testCase 的不同 run"（按 runAt 排在当前之前的最近一条）。
// 若 historyPath 不同就算不同 run。
function findPreviousRun(testCase, currentRun) {
  const arr = allRunsByTestCase.get(testCase)
  if (!arr || arr.length < 2) return null
  const currKey = currentRun?.historyPath || currentRun?.runAt || ''
  for (const r of arr) {
    const key = r.historyPath || r.runAt || ''
    if (key !== currKey) return r
  }
  return null
}

// test-cases/*.yaml 档案索引 —— 失败用例往往 data/*.json 没写入，
// purpose/description 要从这里 fallback 出来，避免报告显示空。
//
// 正规路径：`test-cases/<suite>/<slug>.yaml`（source-of-truth，含手写 purpose）。
// 根目录下的 `test-cases/<slug>.yaml` 只在 suite 无法解析时兜底出现，不应当作
// 第二份 source；重名冲突时优先取 purpose 完整的版本，否则取后扫描到的。
const testCasesDir = join(monoRoot, '.agents/skills/ai-browser-test/test-cases')
const testCaseBySlug = new Map()
const testCaseByPrefix = new Map()
function* walkYamlPaths(dir) {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walkYamlPaths(p)
    else if (e.isFile() && e.name.endsWith('.yaml')) yield p
  }
}
// 并行索引 yaml 文件路径，供复制 prompt 给接收方 AI 找到 yaml 改 expect / purpose
const testCaseYamlPathBySlug = new Map()
for (const yamlPath of walkYamlPaths(testCasesDir)) {
  try {
    const doc = YAML.parse(readFileSync(yamlPath, 'utf-8'))
    if (!doc || typeof doc !== 'object') continue
    const slug = basename(yamlPath).replace(/\.yaml$/, '')
    const existing = testCaseBySlug.get(slug)
    // 优先保留有 purpose 字段的版本；都有/都没则后扫覆盖前扫
    const newHasPurpose = typeof doc.purpose === 'string' && doc.purpose.trim().length > 0
    const oldHasPurpose = existing && typeof existing.purpose === 'string' && existing.purpose.trim().length > 0
    if (!existing || newHasPurpose || !oldHasPurpose) {
      testCaseBySlug.set(slug, doc)
      testCaseYamlPathBySlug.set(slug, yamlPath)
    }
    if (!testCaseYamlPathBySlug.has(slug)) testCaseYamlPathBySlug.set(slug, yamlPath)
    const pm = slug.match(/^(\d{3})/)
    if (pm && !testCaseByPrefix.has(pm[1])) testCaseByPrefix.set(pm[1], doc)
  } catch { /* skip malformed yaml */ }
}

/** 按 probeKey（完整 slug）/ 测试文件路径 / 测试名前缀 查 yaml 档案。
 * 失败用例 probe 缺失时 probeKey=null，只能靠测试文件 basename（如 `001-interactive-approval`）
 * 匹配 yaml 文件名，或者按 `NNN` 前缀在 suite 目录里兜底。 */
function findTestCaseYaml(probeKey, testName, fullName, filePath) {
  if (probeKey && testCaseBySlug.has(probeKey)) return testCaseBySlug.get(probeKey)
  // 用 .browser.tsx 文件路径推导 suite-basename（同 saveTestData 的 testCase key 约定）
  // 例 __tests__/approval/001-interactive-approval.browser.tsx → approval-001-interactive-approval
  if (filePath) {
    const m = String(filePath).match(/__tests__\/(.+)\.browser\.tsx?$/)
    if (m) {
      const fullSlug = m[1].replace(/\//g, '-')
      if (testCaseBySlug.has(fullSlug)) return testCaseBySlug.get(fullSlug)
    }
    const base = String(filePath).split('/').pop()?.replace(/\.browser\.tsx?$/, '') ?? ''
    if (base && testCaseBySlug.has(base)) return testCaseBySlug.get(base)
  }
  const prefix = extractTestCasePrefix(testName ?? fullName)
  if (prefix && testCaseByPrefix.has(prefix)) return testCaseByPrefix.get(prefix)
  return null
}

// ── 辅助 ──
function safeJson(s, fallback = null) { try { return JSON.parse(s) } catch { return fallback } }
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 把 JSON 字符串美化（缩进 2 空格）。如果不是合法 JSON，原样返回。
 * 入参可能是 object/array（直接 stringify）或 string（先 parse 再 stringify）。
 */
function prettyJsonText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
    try { return JSON.stringify(JSON.parse(trimmed), null, 2) } catch { return value }
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }
  return String(value)
}

/**
 * 给 JSON 文本套上 syntax highlight span（key/string/number/bool/null）。
 * 调用者保证传入的是已格式化的 JSON 文本（或退化的纯字符串）。
 * 输出是 HTML 字符串，已 escape 危险字符；可直接 innerHTML。
 */
function colorizeJson(raw) {
  if (raw === null || raw === undefined) return ''
  let s = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // 1) string（含 key 与 value）— key 后面紧跟 `:`，没跟则视为 value
  // 用经典线性"unrolled"模式：`[^"\\]*(?:\\.[^"\\]*)*` 不会 catastrophic backtracking。
  // 之前用 `(?:\\u[a-fA-F0-9]{4}|\\.|[^"\\])*` 在不完整/截断的 JSON（含未闭合 `"` 的
  // tool output）上会指数级回溯，单 case 卡死 10 分钟以上。
  s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)?/g, (_m, body, colon) => {
    const cls = colon ? 'j-key' : 'j-str'
    return `<span class="${cls}">"${body}"</span>` + (colon || '')
  })
  // 2) boolean / null
  s = s.replace(/\b(true|false)\b/g, '<span class="j-bool">$1</span>')
  s = s.replace(/\bnull\b/g, '<span class="j-null">null</span>')
  // 3) number — 必须紧跟在 `:` `,` `[` 或行首/空白后，避免误匹配 string 内数字（已被 span 包过的不再被命中）
  s = s.replace(/(^|[\s:,\[\(])(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)(?=[\s,\]\)\}\n]|$)/g, (_m, prefix, num) => {
    return `${prefix}<span class="j-num">${num}</span>`
  })
  return s
}

/**
 * 把 PROMPT.md / PREFACE.md 转成可在 dialog 内 innerHTML 渲染的 HTML：
 *   - 用 marked 解析标准 markdown 语法（标题、列表、代码块、表格、强调…）
 *   - 但 PROMPT.md 里大量使用 `<system-tag>` / `<system-reminder>` 等自定义标签，
 *     marked 默认会把它们当 raw HTML 透传，浏览器把 unknown element 静默渲染掉，
 *     用户就看不到这些标签了。后处理：把所有非"标准 HTML 标签"的 `<` `>` 转义成
 *     entity，让它们以字面量形式显示出来。
 */
const SAFE_HTML_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'del',
  'details', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'input', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'samp', 'small',
  'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul', 'var', 'wbr',
])
/**
 * 把 PROMPT.md 里的 `<system-tag ...>...</system-tag>` / `<system-reminder>` 等
 * "类 XML" 标签包装成 markdown code block / inline code，让 marked 当代码渲染：
 *   - multi-line（标签体含换行） → ```xml … ``` 代码块（保留换行/缩进）
 *   - 单行 paired                 → 反引号 inline code
 *   - self-closing                → 反引号 inline code
 * 这样既保留了原始格式，又不会被浏览器当 unknown element 静默消化。
 */
function preprocessSystemTags(md) {
  const wrapPaired = (tag, attrs, body) => {
    const full = `<${tag}${attrs}>${body}</${tag}>`
    if (full.includes('\n')) return `\n\n\`\`\`xml\n${full}\n\`\`\`\n\n`
    return '`' + full + '`'
  }
  const tagNames = ['system-tag', 'system-reminder']
  let out = String(md ?? '')
  for (const t of tagNames) {
    const paired = new RegExp(`<${t}([^>]*)>([\\s\\S]*?)</${t}>`, 'g')
    out = out.replace(paired, (_, attrs, body) => wrapPaired(t, attrs, body))
    const selfClose = new RegExp(`<${t}([^>]*)/>`, 'g')
    out = out.replace(selfClose, (m) => '`' + m + '`')
  }
  return out
}

function renderMdForDialog(raw) {
  let html = ''
  try {
    const preprocessed = preprocessSystemTags(raw)
    html = marked.parse(preprocessed, { gfm: true, breaks: false, mangle: false, headerIds: false })
  } catch {
    html = `<pre>${esc(raw ?? '')}</pre>`
  }
  // 兜底：把所有非白名单 HTML 标签也转义成 &lt;tag&gt; 字面量（防止其它 unknown element 消失）
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (m, tag) => {
    return SAFE_HTML_TAGS.has(tag.toLowerCase()) ? m : esc(m)
  })
}
function parseRunDirName(name) {
  // 匹配 `[<seq>_]YYYYMMDD_HHMMSS`，返回 { seq, ts } 或 null
  const m = String(name ?? '').match(/^(?:(\d+)_)?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  const [, seq, y, mo, d, h, mi, se] = m
  return { seq: seq ? Number.parseInt(seq, 10) : null, y, mo, d, h, mi, se }
}

function fmtUtcMsToShanghai(ms) {
  if (!Number.isFinite(ms)) return null
  const sh = new Date(ms + 8 * 3600 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${sh.getUTCFullYear()}-${pad(sh.getUTCMonth() + 1)}-${pad(sh.getUTCDate())} ${pad(sh.getUTCHours())}:${pad(sh.getUTCMinutes())}:${pad(sh.getUTCSeconds())}`
}

function fmtTs(ts) {
  // v3 纯 seq：读 run-meta.json / results.json 拿起始时间
  if (/^\d+$/.test(String(ts ?? ''))) {
    const seq = Number.parseInt(String(ts), 10)
    const metaPath = join(runsRoot, String(ts), 'run-meta.json')
    const resultsPath = join(runsRoot, String(ts), 'results.json')
    let startMs = null
    if (existsSync(metaPath)) {
      const meta = safeJson(readFileSync(metaPath, 'utf-8'))
      if (meta?.startedAt) {
        const t = Date.parse(meta.startedAt)
        if (Number.isFinite(t)) startMs = t
      }
    }
    if (startMs == null && existsSync(resultsPath)) {
      const rj = safeJson(readFileSync(resultsPath, 'utf-8'))
      if (Number.isFinite(rj?.startTime)) startMs = rj.startTime
    }
    const tsLabel = fmtUtcMsToShanghai(startMs) ?? ''
    return tsLabel ? `#${seq} · ${tsLabel}` : `#${seq}`
  }
  // v1 / v2 兼容：从目录名解析
  const parsed = parseRunDirName(ts)
  if (!parsed) return ts
  const { seq, y, mo, d, h, mi, se } = parsed
  const utc = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`)
  const tsLabel = isNaN(utc.getTime())
    ? `${y}-${mo}-${d} ${h}:${mi}:${se}`
    : fmtUtcMsToShanghai(utc.getTime())
  return seq != null ? `#${seq} · ${tsLabel}` : tsLabel
}
function fmtMs(n) {
  if (n == null || Number.isNaN(Number(n))) return ''
  const ms = Math.round(Number(n))
  if (ms < 1000) return `${ms}毫秒`
  const s = Math.floor(ms / 1000)
  const rem = ms % 1000
  return rem === 0 ? `${s}秒` : `${s}秒${rem}毫秒`
}
function fmtMinSec(n) {
  if (n == null || Number.isNaN(Number(n))) return ''
  const totalSec = Math.max(0, Math.round(Number(n) / 1000))
  if (totalSec < 60) return `${totalSec}秒`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return s === 0 ? `${m}分` : `${m}分${s}秒`
}
/** 紧凑数字：1234 → "1.2k"，1_234_567 → "1.2M"；<1000 直接给数字。 */
function fmtCompact(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  if (v < 1000) return String(v)
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`
  return `${(v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0)}M`
}
function extractTestCasePrefix(fullName) {
  const m = fullName?.match(/(\d{3}[\w-]*)/)
  return m ? m[1] : null
}
function findProbe(fullName, itName, filePath) {
  // ① 最稳：按 vitest test 文件 basename（如 `003-docpreview-pdf`）在 key 里 endsWith 匹配。
  //    data 文件名就是 `<suite>-<basename>.json`（如 `file-read-003-docpreview-pdf.json`），
  //    用 endsWith 即可跨 suite 命名差异稳定对齐，且不受 vitest it title 编号漂移影响。
  if (filePath) {
    const base = String(filePath).split('/').pop()?.replace(/\.browser\.tsx?$/, '') ?? ''
    if (base) {
      for (const [key, val] of probeByTestCase) {
        if (key.endsWith(base) || key === base) return { key, val }
      }
    }
  }
  // ② 兼容旧数据：testCase 完整 slug 出现在 fullName / itName 里
  for (const [key, val] of probeByTestCase) {
    if ((fullName && fullName.includes(key)) || (itName && itName.includes(key))) return { key, val }
  }
  // ③ 最后兜底：按三位数字前缀匹配（历史老 data 的 key 就是 NNN-...）
  const prefix = extractTestCasePrefix(itName ?? fullName)
  if (prefix) {
    for (const [key, val] of probeByTestCase) {
      if (key.startsWith(prefix)) return { key, val }
    }
  }
  return null
}
// extractTokens / tokenMatch 已移除：原本是给 computeShotsByIdx 做截图按测试名兜底
// 匹配的，DOM 快照取代截图后没有其它消费方。

function aggregateScore(evals) {
  if (!evals?.length) return null
  const scores = evals.map(e => Number(e.data.score)).filter(n => !Number.isNaN(n))
  const verdicts = evals.map(e => e.data.verdict)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  let verdict = 'PASS'
  if (verdicts.includes('FAIL')) verdict = 'FAIL'
  else if (verdicts.includes('PARTIAL')) verdict = 'PARTIAL'
  return { verdict, score: avg }
}

// ── 附件/媒体 ──
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|aac)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i
const MAX_EMBED_BYTES = 8 * 1024 * 1024 // 8MB 上限，超了走下载链接

function mediaKind(url) {
  if (!url) return null
  if (IMG_EXT.test(url)) return 'image'
  if (AUDIO_EXT.test(url)) return 'audio'
  if (VIDEO_EXT.test(url)) return 'video'
  return null
}

function mimeFromExt(path) {
  const m = path.match(/\.([a-zA-Z0-9]+)$/)
  if (!m) return 'application/octet-stream'
  const ext = m[1].toLowerCase()
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** Read a local file and inline it as data URL; returns null if too big or missing. */
function readLocalAsDataUrl(absPath) {
  try {
    if (!existsSync(absPath)) return null
    const st = statSync(absPath)
    if (!st.isFile() || st.size > MAX_EMBED_BYTES) return null
    const buf = readFileSync(absPath)
    return `data:${mimeFromExt(absPath)};base64,${buf.toString('base64')}`
  } catch { return null }
}

/**
 * 从 tool part 的 output 里提取附件条目。
 * 支持形态：
 *   - output.files[]: { sourceUrl, absolutePath, fileName, filePath, fileSize }
 *   - output.url / output.sourceUrl 顶层单附件
 *   - output.attachments[]
 *   - output.audioFile / output.videoFile
 */
// extractAttachmentsFromOutput / renderAttachment 已移除 —— 它们只服务于消息时间线
// 里的 tool output 缩略图。DOM 快照取代时间线后，这两个函数失去消费方。
// inline `<system-tag attachment/>` 缩略图（renderInlineAttachment 一族）仍由
// markdownWithAttachments / escWithAttachments 在 prompt / spec purpose 渲染处使用，保留。

// ── <system-tag type="attachment" path="..." /> inline 缩略图 ──
// path 支持 `${CURRENT_CHAT_DIR}/xxx.jpg` 占位符；占位符下的同名文件在
// fixtures 目录里（测试 harness 的预置资源）。纯绝对路径也直接读。
const fixturesDir = join(monoRoot, '.agents/skills/ai-browser-test/fixtures')
const ATTACHMENT_TAG_RE = /<system-tag\s+type=["']attachment["']\s+path=["']([^"']+)["']\s*\/?>(?:<\/system-tag>)?/g

function resolveAttachmentAbsPath(rawPath) {
  if (!rawPath) return null
  // ${CURRENT_CHAT_DIR}/<file> / ${CURRENT_BOARD_DIR}/<file> → fallback 到 fixtures 目录下同名文件
  if (/^\$\{(CURRENT_CHAT_DIR|CURRENT_BOARD_DIR|CURRENT_PROJECT_ROOT)\}\//.test(rawPath)) {
    const fileName = rawPath.split('/').pop()
    if (fileName) {
      const fx = join(fixturesDir, fileName)
      if (existsSync(fx)) return fx
    }
    return null
  }
  return existsSync(rawPath) ? rawPath : null
}

function renderInlineAttachment(rawPath) {
  const abs = resolveAttachmentAbsPath(rawPath)
  const fileName = (rawPath ?? '').split('/').pop() ?? ''
  const kind = mediaKind(fileName) ?? mediaKind(rawPath ?? '')
  if (abs) {
    const src = readLocalAsDataUrl(abs)
    if (src) {
      if (kind === 'image') {
        return `<img class="inline-att inline-att-img" src="${src}" alt="${esc(fileName)}" title="${esc(fileName)}" data-lightbox data-caption="${esc(fileName)}"/>`
      }
      if (kind === 'audio') return `<audio class="inline-att" controls preload="none" src="${src}" title="${esc(fileName)}"></audio>`
      if (kind === 'video') return `<video class="inline-att inline-att-video" controls preload="none" src="${src}" title="${esc(fileName)}"></video>`
    }
  }
  return `<span class="inline-att-miss" title="${esc(rawPath)}">📎 ${esc(fileName || rawPath || 'attachment')}</span>`
}

/** Markdown 渲染 + <system-tag attachment/> inline 缩略图。 */
function markdownWithAttachments(text) {
  if (!text) return ''
  const tokens = []
  ATTACHMENT_TAG_RE.lastIndex = 0
  const masked = String(text).replace(ATTACHMENT_TAG_RE, (_, p) => {
    const idx = tokens.length
    tokens.push(p)
    return `@@OLATT${idx}@@`
  })
  let html
  try {
    html = marked.parse(masked, { breaks: true, gfm: true, async: false })
  } catch {
    html = `<pre>${esc(masked)}</pre>`
  }
  return String(html).replace(/@@OLATT(\d+)@@/g, (_, i) => renderInlineAttachment(tokens[Number(i)]))
}

// truncateJson / toolStateBadge 已移除：消息时间线被 DOM 快照取代后没有其它消费方。

/** 从 message.metadata 提取后端打到 openloaf / totalUsage 的成本相关字段 */
function extractMessageCost(msg) {
  const meta = msg?.metadata
  if (!meta || typeof meta !== 'object') return null
  const openloaf = (meta.openloaf && typeof meta.openloaf === 'object') ? meta.openloaf : null
  const usage = (meta.totalUsage && typeof meta.totalUsage === 'object') ? meta.totalUsage : null
  const credits = openloaf && typeof openloaf.creditsConsumed === 'number' ? openloaf.creditsConsumed : null
  const elapsedMs = openloaf && typeof openloaf.assistantElapsedMs === 'number' ? openloaf.assistantElapsedMs : null
  const inputTokens = usage && typeof usage.inputTokens === 'number' ? usage.inputTokens : null
  const outputTokens = usage && typeof usage.outputTokens === 'number' ? usage.outputTokens : null
  const totalTokens = usage && typeof usage.totalTokens === 'number' ? usage.totalTokens : null
  const cachedInputTokens = usage && typeof usage.cachedInputTokens === 'number' ? usage.cachedInputTokens : null
  const reasoningTokens = usage && typeof usage.reasoningTokens === 'number' ? usage.reasoningTokens : null
  if (credits == null && totalTokens == null && inputTokens == null && outputTokens == null && elapsedMs == null) return null
  return { credits, elapsedMs, inputTokens, outputTokens, totalTokens, cachedInputTokens, reasoningTokens }
}

// renderPart / renderMessageCostBadges / renderMessageTimeline 已移除：
// DOM 快照（onComplete 时刻的 outerHTML）已经覆盖了"看完整对话"这一需求，
// 自维护的时间线 UI 是多余的可视化层。`extractMessageCost` 仍由 panel-header 的
// 总成本聚合使用，保留。

// ── 渲染单用例：sidebar nav + detail panel ──
function renderTestSplit(test, idx) {
  const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '?'
  const cls = test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip'
  const dur = test.duration != null ? fmtMs(test.duration) : ''
  const fullName = test.fullName ?? test.name ?? ''
  const shortName = test.name ?? fullName

  const probeMatch = findProbe(fullName, test.name, test.__filePath)
  const probeKey = probeMatch?.key
  const probe = probeMatch?.val
  const run = probeKey ? runRecordByTestCase.get(probeKey) : null
  const evals = probeKey ? evalsByTestCase.get(probeKey) : null
  // 新格式 review.json 直接带 aggregate；老格式降级用 aggregateScore 合成
  const agg = (probeKey ? aggByTestCase.get(probeKey) : null) ?? aggregateScore(evals)

  // pngs / shotsByIdx 已移除：DOM 快照取代 PNG 截图，nav-sub 不再显示 📸 计数。

  const toolCallDetails = probe?.result?.toolCallDetails ?? run?.toolCallDetails ?? []
  const consoleLogs = probe?.result?.consoleLogs ?? []
  const networkRequests = probe?.result?.networkRequests ?? []
  const historyPath = run?.historyPath
  const sessionId = probe?.result?.sessionId ?? run?.sessionId

  // ── 一键复制 Prompt：任务说明 + 基本信息 + purpose + 文件路径 + messages.jsonl 全文 ──
  // 实际文本构建在 lib/build-diagnose-prompt.mjs（CLI `pnpm test:browser:diagnose-prompt`
  // 也复用这同一个 builder，保证 HTML 报告的「复制 Prompt」和命令行输出完全一致）。
  // 这里只做 ctx 组装：把已经在 generate-report 上下文里解出的 locals（probe / run /
  // test / credits / tokenTotals / purpose ...）喂给 builder。
  const buildCopyPromptText = () => {
    const prevRun = run ? findPreviousRun(probeKey || run.testCase, run) : null
    let prevRunMeta = null
    if (prevRun?.screenshotsDir) {
      const m = prevRun.screenshotsDir.match(/browser-test-runs\/([^/]+)\/screenshots$/)
      if (m) {
        const prevMetaPath = join(runsRoot, m[1], 'run-meta.json')
        if (existsSync(prevMetaPath)) {
          prevRunMeta = safeJson(readFileSync(prevMetaPath, 'utf-8'), null)
        }
      }
    }
    return buildDiagnosePromptText({
      testCase: probeKey || fullName || '',
      runMeta,
      run,
      probe,
      vitestResult: {
        status: test.status,
        failureMessages: Array.isArray(test.failureMessages) ? test.failureMessages : [],
        filePath: test.__filePath,
        fullName: test.fullName ?? test.name ?? '',
        name: test.name ?? '',
        duration: test.duration,
      },
      purpose,
      yamlPath: probeKey ? testCaseYamlPathBySlug.get(probeKey) : null,
      tsxPath: test.__filePath,
      credits,
      tokenTotals,
      prevRun,
      prevRunMeta,
      monoRoot,
    })
  }
  // 注意：buildCopyPromptText 引用了下方才定义的 purpose / credits 等，必须等它们赋值后再调用。
  // 真正调用挪到 historyHeaderHtml 附近（见下方"复制 Prompt 按钮"标记）。

  // ── 成本聚合（credits + tokens）──
  // credits：runs.jsonl 记录的 creditsConsumed → ProbeResult.creditsConsumed → messages.metadata 兜底累加。
  // tokens：runs.jsonl 记录的 tokenUsage → ProbeResult.tokenUsage → messages.metadata.totalUsage 兜底累加。
  const probeMessages = Array.isArray(probe?.result?.messages) ? probe.result.messages : []
  let credits = run?.creditsConsumed ?? probe?.result?.creditsConsumed
  const aggTokenUsage = run?.tokenUsage ?? probe?.result?.tokenUsage ?? null
  let tokenTotals = aggTokenUsage
    ? {
      input: Number(aggTokenUsage.inputTokens) || 0,
      output: Number(aggTokenUsage.outputTokens) || 0,
      total: Number(aggTokenUsage.totalTokens) || 0,
      reasoning: Number(aggTokenUsage.reasoningTokens) || 0,
      cached: Number(aggTokenUsage.cachedInputTokens) || 0,
      any: (Number(aggTokenUsage.totalTokens) || 0) > 0
        || (Number(aggTokenUsage.inputTokens) || 0) > 0
        || (Number(aggTokenUsage.outputTokens) || 0) > 0,
    }
    : { input: 0, output: 0, total: 0, reasoning: 0, cached: 0, any: false }
  let creditsFromMessages = 0
  for (const m of probeMessages) {
    if (m?.role !== 'assistant') continue
    const cost = extractMessageCost(m)
    if (!cost) continue
    if (cost.credits != null && cost.credits > 0) creditsFromMessages += cost.credits
    // tokens：只在 aggTokenUsage 缺失时才从消息累加，避免重复计数
    if (!aggTokenUsage) {
      if (cost.inputTokens != null) { tokenTotals.input += cost.inputTokens; tokenTotals.any = true }
      if (cost.outputTokens != null) { tokenTotals.output += cost.outputTokens; tokenTotals.any = true }
      if (cost.totalTokens != null) { tokenTotals.total += cost.totalTokens; tokenTotals.any = true }
      if (cost.reasoningTokens != null) tokenTotals.reasoning += cost.reasoningTokens
      if (cost.cachedInputTokens != null) tokenTotals.cached += cost.cachedInputTokens
    }
  }
  if ((typeof credits !== 'number' || credits === 0) && creditsFromMessages > 0) {
    credits = creditsFromMessages
  }
  // totalTokens 若缺失则用 input+output 兜底（个别 provider 只回其中一个字段）
  if (tokenTotals.any && tokenTotals.total === 0 && (tokenTotals.input > 0 || tokenTotals.output > 0)) {
    tokenTotals.total = tokenTotals.input + tokenTotals.output
  }

  // ── 工具指标 ──
  const totalCalls = toolCallDetails.length
  const failedCalls = toolCallDetails.filter(t => t.hasError).length
  const successRate = totalCalls ? Math.round(((totalCalls - failedCalls) / totalCalls) * 100) : null
  const hasCredits = typeof credits === 'number' && credits > 0
  const hasTokens = tokenTotals.any && (tokenTotals.total > 0 || tokenTotals.input > 0 || tokenTotals.output > 0)

  // ── metric pills（耗时/积分/tokens/工具调用统计）──
  // 从 panel-header 移到 DOM 快照 sec-head 右侧，所以前置定义。
  const metricParts = []
  if (dur) metricParts.push(`<span class="metric"><span class="metric-icon">⏱</span>${esc(dur)}</span>`)
  // 模型 pill：优先级 runner --model override > messages.metadata.agent 实际运行时模型 > run.model 测试声明。
  // chatModelId 为 null（auto）的测试在 runs.jsonl 里 model=null，只有 messages.metadata.agent 能拿到实际用的模型。
  {
    // 从 messages[].metadata.agent 取：name（"Qwen Flash"）+ modelId（"OL-TX-008"）+ chatModelId（"qwen:OL-TX-008"）
    let actualModel = null     // chatModelId 机器格式，用作 fallback + tip
    let actualModelName = null // 友好名 "Qwen Flash"
    let actualModelId = null   // 短 id "OL-TX-008"
    for (const m of probeMessages) {
      if (m?.role !== 'assistant') continue
      const ag = m?.metadata?.agent
      if (!ag) continue
      if (ag.chatModelId) actualModel = String(ag.chatModelId)
      if (ag?.model?.modelId) actualModelId = String(ag.model.modelId)
      if (ag?.model?.name) actualModelName = String(ag.model.name)
      if (actualModel || actualModelId) break
    }
    // 展示格式："Qwen Flash（OL-TX-008）" — name 为主，短 id 在括号里补充，失去 name 时用 chatModelId 顶上
    const displayModel = actualModelName && actualModelId
      ? `${actualModelName}（${actualModelId}）`
      : actualModelName || actualModel || actualModelId || null
    const mo = typeof runMeta?.modelOverride === 'string' ? runMeta.modelOverride.trim() : ''
    if (mo) {
      const intentNote = run?.model ? `（测试声明：${run.model}）` : (actualModel ? `（运行时：${actualModel}）` : '')
      metricParts.push(`<span class="metric metric-model-override" title="runner --model 覆盖${intentNote}"><span class="metric-icon">🤖</span>${esc(mo)} [override]</span>`)
    } else if (displayModel) {
      const tipBits = []
      if (actualModel) tipBits.push(actualModel)
      if (run?.model && run.model !== actualModel) tipBits.push(`测试声明：${run.model}`)
      const tip = tipBits.length ? ` title="${esc(tipBits.join(' · '))}"` : ''
      metricParts.push(`<span class="metric metric-model"${tip}><span class="metric-icon">🤖</span>${esc(displayModel)}</span>`)
    } else if (run?.model) {
      metricParts.push(`<span class="metric metric-model" title="本用例测试声明的模型（实际运行模型未知）"><span class="metric-icon">🤖</span>${esc(run.model)}</span>`)
    }
  }
  if (hasCredits) metricParts.push(`<span class="metric metric-credits"><span class="metric-icon">💎</span>${credits.toFixed(2)} 积分</span>`)
  if (hasTokens) {
    const tokenVal = tokenTotals.total > 0 ? tokenTotals.total : (tokenTotals.input + tokenTotals.output)
    const tipBits = []
    if (tokenTotals.input > 0) tipBits.push(`in ${tokenTotals.input}`)
    if (tokenTotals.output > 0) tipBits.push(`out ${tokenTotals.output}`)
    if (tokenTotals.reasoning > 0) tipBits.push(`reason ${tokenTotals.reasoning}`)
    if (tokenTotals.cached > 0) tipBits.push(`cached ${tokenTotals.cached}`)
    const tip = tipBits.length ? ` title="${tipBits.join(' · ')}"` : ''
    metricParts.push(`<span class="metric metric-tokens"${tip}><span class="metric-icon">🔢</span>${tokenVal} tokens</span>`)
  }
  if (totalCalls) {
    const rateCls = successRate === 100 ? 'metric-ok' : successRate >= 50 ? 'metric-warn' : 'metric-err'
    const failSpan = failedCalls ? `<span class="metric-fail">· ✗ ${failedCalls} 失败</span>` : ''
    metricParts.push(`<span class="metric ${rateCls}"><span class="metric-icon">🔧</span>${totalCalls} 轮 · ${successRate}% 成功 ${failSpan}</span>`)
  }

  // ── sidebar nav item ──
  const navAggCls = agg
    ? (agg.verdict === 'PASS' ? 'nav-agg-ok' : agg.verdict === 'PARTIAL' ? 'nav-agg-warn' : 'nav-agg-err')
    : ''
  const navAgg = agg ? `<span class="nav-agg ${navAggCls}">${esc(agg.verdict)}${agg.score != null ? ` ${agg.score}` : ''}</span>` : ''
  const navSubParts = []
  if (dur) navSubParts.push(`⏱ ${esc(dur)}`)
  if (hasCredits) navSubParts.push(`💎 ${credits.toFixed(2)}`)
  if (hasTokens) {
    const tokenVal = tokenTotals.total > 0 ? tokenTotals.total : (tokenTotals.input + tokenTotals.output)
    navSubParts.push(`🔢 ${fmtCompact(tokenVal)}`)
  }
  if (totalCalls) navSubParts.push(`🔧 ${totalCalls - failedCalls}/${totalCalls}${failedCalls ? ` <span class="nav-fail-mark">✗${failedCalls}</span>` : ''}`)
  const nav = `<button class="nav-item nav-${cls}" data-idx="${idx}" data-status="${esc(test.status)}">
    <span class="nav-icon">${icon}</span>
    <span class="nav-text">
      <span class="nav-name">${esc(shortName)}</span>
      <span class="nav-sub">${navSubParts.join(' · ')}</span>
    </span>
    ${navAgg}
  </button>`

  // ── 中间详情 content badges（避免跟 header 重复，只保留聚合裁判） ──
  let badges = ''
  if (agg) {
    const aggCls = agg.verdict === 'PASS' ? 'b-ok' : agg.verdict === 'PARTIAL' ? 'b-warn' : 'b-err'
    badges += `<span class="b ${aggCls}">裁判 ${agg.verdict} ${agg.score ?? ''}</span>`
  }

  let body = ''

  // 测试目的 —— 从 yaml 的 purpose block scalar 读，既给 evaluator 也给人看。
  // 失败用例 probe/run 常缺失，fallback 到 test-cases/<slug>.yaml（含失败也一定能显示目的）。
  // 该区块不再渲染到主 body —— 已搬到右侧 aside 顶部（见 purposeAsideHtml）。
  const yamlDoc = findTestCaseYaml(probeKey, test.name, fullName, test.__filePath)
  const purpose = probe?.purpose ?? run?.purpose ?? yamlDoc?.purpose
  const specDescription = probe?.specDescription ?? run?.specDescription ?? probe?.description ?? yamlDoc?.description

  // 失败信息放最上
  if (test.status === 'failed' && test.failureMessages?.length) {
    body += `<details open class="sec"><summary>❌ 失败信息</summary><div class="sec-body"><pre class="err">${esc(test.failureMessages.join('\n'))}</pre></div></details>`
  }

  // AI 裁判（aiJudge）打分数据 —— 不再渲染到主 body，统一搬到右侧 aside 顶部
  //（与 critic 评审合并展示，因为"AI 裁判"本质就是评审，左侧主区不再重复一份）。
  const aiJudges = Array.isArray(probe?.aiJudges) ? probe.aiJudges : []

  // ── 主 body sections 顺序 ──
  //   失败信息 → DOM 快照 → 工具调用 → 网络请求 → 截图 → console
  // "回复摘要" / "Prompt" / "消息时间线" 已被 DOM 快照取代。

  // ── DOM 快照（onComplete 时刻的 documentElement.outerHTML）──
  // 始终展开（不再 <details>）。iframe 从 srcdoc 改为 src="data/<sanitized>.dom.html"：
  //   - saveTestData 写 dom.html 时已把 <style> 抽到 shared-styles/<hash>.css，iframe
  //     文档用相对路径 ../../shared-styles/<hash>.css 引用，srcdoc 场景下 baseURI
  //     是 about:srcdoc 无法解析，所以必须改成真实文件 src
  //   - sandbox="allow-same-origin" 放开 same-origin（让 link 可加载），仍不加
  //     allow-scripts，旧 React handler 无法执行，安全
  // sec-head 右侧加 PROMPT.md / PREFACE.md 按钮（仅当 historyPath 下文件存在）→ 点击弹 dialog
  const domHtml = lookupDomSnapshot(probeKey ?? probe?.testCase ?? null)
  let mdTemplatesHtml = ''
  let mdButtonsHtml = ''
  if (historyPath) {
    const tryLoadMd = (basenameMd, kind, label, icon, btnText) => {
      const p = join(historyPath, basenameMd)
      if (!existsSync(p)) return
      try {
        const txt = readFileSync(p, 'utf-8')
        if (!txt) return
        const sizeKb = (txt.length / 1024).toFixed(1)
        const tplId = `md-${idx}-${kind}`
        // 输出两个 template：
        //   - <tplId>-html: marked 渲染后的 HTML（用于 dialog body innerHTML）
        //     渲染前后 escape `<system-tag>` / `<system-reminder>` 等非标准标签，
        //     避免浏览器把它们当 unknown element 静默消化掉
        //   - <tplId>-raw:  原 md 文本（用于复制按钮）
        const html = renderMdForDialog(txt)
        mdTemplatesHtml += `<template id="${tplId}-html">${esc(html)}</template>`
        mdTemplatesHtml += `<template id="${tplId}-raw">${esc(txt)}</template>`
        mdButtonsHtml += `<button type="button" class="md-btn" data-md-target="${tplId}-html" data-md-raw="${tplId}-raw" data-md-title="${esc(label)} (${sizeKb} KB)" title="${esc(label)}（${esc(basenameMd)}）">${icon} ${esc(btnText)}</button>`
      } catch { /* ignore */ }
    }
    tryLoadMd('PROMPT.md', 'prompt', '系统 Prompt', '📜', '查看 Prompt')
    tryLoadMd('PREFACE.md', 'preface', '会话前言', '📑', '查看前言')
  }
  if (domHtml) {
    const sizeKb = (domHtml.length / 1024).toFixed(0)
    const sanitized = String(probeKey ?? probe?.testCase ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')
    // metric pills（耗时/积分/tokens/工具调用统计）和 PROMPT/PREFACE 按钮统一塞到 DOM 快照标题栏右侧
    const headMetricsHtml = metricParts.length ? `<span class="snapshot-foot-metrics">${metricParts.join('')}</span>` : ''
    const headActions = mdButtonsHtml ? `<span class="snapshot-foot-actions">${mdButtonsHtml}</span>` : ''
    const headExtra = (headMetricsHtml || headActions)
      ? `<span class="sec-head-meta">${headMetricsHtml}${headActions}</span>`
      : ''
    body += `<section class="sec sec-always sec-dom-snapshot"><div class="sec-head sec-head-row"><span class="sec-head-title">🌐 DOM 快照（${sizeKb} KB）</span>${headExtra}</div>
      <div class="sec-body">
        <div class="dom-snapshot-wrap">
          <div class="dom-snapshot-loading"><div class="dom-snapshot-spinner"></div><div class="dom-snapshot-loading-text">加载 DOM 快照中…</div></div>
          <iframe class="dom-snapshot-frame" sandbox="allow-same-origin" src="data/${esc(sanitized)}.dom.html" onload="var w=this.closest('.dom-snapshot-wrap');setTimeout(function(){w.classList.add('loaded')}, 700)"></iframe>
        </div>
      </div></section>`
  }
  // PROMPT/PREFACE template 始终输出到 panel（即便 domHtml 缺失也能让按钮工作；
  // 不过当 domHtml 缺失时按钮也没地方显示，干脆只在 domHtml 存在时输出 template）
  if (domHtml && mdTemplatesHtml) body += mdTemplatesHtml

  // 工具调用明细 —— 移到 DOM 快照下方，默认展开。
  // 每行点击可展开 input/output JSON 预览。轮次列重命名为"第 N 轮回复"（1-based 显示）。
  if (toolCallDetails.length) {
    body += `<section class="sec sec-always"><div class="sec-head sec-head-row"><span class="sec-head-title">🔧 工具调用明细（${toolCallDetails.length}）</span></div><div class="sec-body"><div class="tool-list">`
    for (let i = 0; i < toolCallDetails.length; i++) {
      const t = toolCallDetails[i]
      const cc = t.hasError ? 'v-err' : 'v-ok'
      const turnLabel = typeof t.turnIndex === 'number' ? `第 ${t.turnIndex + 1} 轮回复` : ''
      const statusLabel = t.hasError ? 'ERROR' : 'ok'
      const errSummary = t.errorSummary ? `<span class="tool-err">${esc(t.errorSummary)}</span>` : ''
      const stateBadge = t.state ? `<span class="tool-state">${esc(t.state)}</span>` : ''
      const inputStr = prettyJsonText(t.input)
      const outputStr = prettyJsonText(t.output)
      const inputBlock = inputStr
        ? `<div class="tool-kv"><div class="tool-k-row"><span class="tool-k">📥 input</span><button type="button" class="net-copy-btn" title="复制">📋</button></div><pre class="tool-v json-pre">${colorizeJson(inputStr)}</pre></div>`
        : ''
      const outputBlock = outputStr
        ? `<div class="tool-kv"><div class="tool-k-row"><span class="tool-k">📤 output</span><button type="button" class="net-copy-btn" title="复制">📋</button></div><pre class="tool-v json-pre ${t.hasError ? 'tool-v-err' : ''}">${colorizeJson(outputStr)}</pre></div>`
        : ''
      const hasBody = inputBlock || outputBlock || errSummary
      const summary = `<summary class="tool-row">
          <span class="tool-name">${esc(t.name)}</span>
          <span class="tool-turn">${esc(turnLabel)}</span>
          <span class="tool-status ${cc}">${esc(statusLabel)}</span>
          ${stateBadge}
        </summary>`
      if (hasBody) {
        const errorRow = errSummary ? `<div class="tool-kv"><div class="tool-k-row"><span class="tool-k">❌ error</span></div><pre class="tool-v tool-v-err">${esc(t.errorSummary ?? '')}</pre></div>` : ''
        body += `<details class="tool-item">${summary}<div class="tool-body">${errorRow}${inputBlock}${outputBlock}</div></details>`
      } else {
        body += `<div class="tool-item tool-item-static">${summary.replace('<summary', '<div').replace('</summary>', '</div>')}</div>`
      }
    }
    body += `</div></div></section>`
  }

  if (consoleLogs.length) {
    body += `<details class="sec"><summary>🖥 浏览器 Console（${consoleLogs.length}）</summary><div class="sec-body"><pre class="log">`
    for (const c of consoleLogs.slice(0, 100)) {
      body += `<span class="lvl lvl-${c.level}">[${c.level}]</span> +${c.ts}ms ${esc(c.text.slice(0, 200))}\n`
    }
    body += `</pre></div></details>`
  }

  if (networkRequests.length) {
    body += `<section class="sec sec-always"><div class="sec-head">🌐 网络请求（${networkRequests.length}）</div><div class="sec-body net-list">`
    for (let i = 0; i < Math.min(networkRequests.length, 100); i++) {
      const n = networkRequests[i]
      const ok = n.ok ? 'v-ok' : 'v-err'
      const statusLabel = n.status ?? (n.error ? 'ERR' : '—')
      const dur = n.durationMs != null ? `${n.durationMs}ms` : ''
      // URL 显示去掉 query string，完整 URL 留在 title 里供 hover
      const fullUrl = String(n.url ?? '')
      const qIdx = fullUrl.indexOf('?')
      const displayUrl = qIdx >= 0 ? fullUrl.slice(0, qIdx) : fullUrl
      const reqBody = typeof n.requestBody === 'string' ? prettyJsonText(n.requestBody) : ''
      const respBody = typeof n.responseBody === 'string' ? prettyJsonText(n.responseBody) : ''
      const reqIsJson = reqBody && (reqBody.trimStart().startsWith('{') || reqBody.trimStart().startsWith('['))
      const respIsJson = respBody && (respBody.trimStart().startsWith('{') || respBody.trimStart().startsWith('['))
      const hasBody = reqBody || respBody || n.error
      const bodyBlocks = []
      if (n.error) bodyBlocks.push(`<div class="net-kv"><div class="net-k-row"><span class="net-k">❌ error</span></div><pre class="net-v net-v-err">${esc(n.error)}</pre></div>`)
      if (reqBody) {
        const label = `📤 request body${n.requestBodyTruncated ? '（已截断 512KB）' : ''}`
        const html = reqIsJson ? colorizeJson(reqBody) : esc(reqBody)
        bodyBlocks.push(`<div class="net-kv"><div class="net-k-row"><span class="net-k">${label}</span><button type="button" class="net-copy-btn" title="复制">📋</button></div><pre class="net-v ${reqIsJson ? 'json-pre' : ''}">${html}</pre></div>`)
      }
      if (respBody) {
        const label = `📥 response body${n.responseBodyTruncated ? '（已截断 512KB）' : ''}`
        const html = respIsJson ? colorizeJson(respBody) : esc(respBody)
        bodyBlocks.push(`<div class="net-kv"><div class="net-k-row"><span class="net-k">${label}</span><button type="button" class="net-copy-btn" title="复制">📋</button></div><pre class="net-v ${respIsJson ? 'json-pre' : ''}">${html}</pre></div>`)
      }
      const summary = `<summary class="net-row">
          <span class="net-method">${esc(n.method)}</span>
          <span class="net-status ${ok}">${esc(statusLabel)}</span>
          <span class="net-url" title="${esc(fullUrl)}">${esc(displayUrl)}</span>
          <span class="net-dur">${esc(dur)}</span>
          <button type="button" class="net-row-copy-btn" title="复制 URL + 请求体 + 响应体">📋</button>
        </summary>`
      if (hasBody) {
        body += `<details class="net-item">${summary}<div class="net-body">${bodyBlocks.join('')}</div></details>`
      } else {
        // 没 body 的 row 渲染成纯显示行，不给展开图标
        body += `<div class="net-item net-item-static">${summary.replace('<summary', '<div').replace('</summary>', '</div>')}</div>`
      }
    }
    if (networkRequests.length > 100) {
      body += `<div class="net-more">（共 ${networkRequests.length} 条，仅显示前 100）</div>`
    }
    body += `</div></section>`
  }

  // ── 截图列表 ──
  // 不内嵌 PNG（base64 后单张能 1-5MB，会撑爆 index.html）；只显示文件名按钮，
  // 点击触发已有的 lightbox。隐藏的 <img data-lightbox/> 让 lightbox JS 自动
  // 把同一组的 img 收齐做左右切换。
  const screenshots = lookupScreenshots(probeKey ?? probe?.testCase ?? null)
  if (screenshots.length) {
    body += `<section class="sec sec-always"><div class="sec-head">📸 截图（${screenshots.length}）</div><div class="sec-body shot-list" data-lightbox-group>`
    for (const f of screenshots) {
      body += `<button type="button" class="shot-btn" data-shot-name="${esc(f)}">📎 ${esc(f)}</button>`
      body += `<img class="shot-hidden-img" src="screenshots/${esc(f)}" data-lightbox data-caption="${esc(f)}" alt="${esc(f)}"/>`
    }
    body += `</div></section>`
  }

  // 评审区（右侧 aside）── critic 评审 + AI 裁判统一展示。
  // 顺序：critic evaluations 在上方（聚合分 + 各维卡片 + 问题汇总），
  //       aiJudges 卡片在下方（来自每次 aiJudge() 调用）。
  // 标题统一为 ⚖️ 裁判 ——"评审"和"AI 裁判"语义重复，去掉历史债。
  let evalsAsideInner = ''
  let evalsCountLabel = '未裁判'

  if (evals?.length) {
    evalsCountLabel = `${evals.length} 维`
    let evalsHtml = ''
    const allCons = []
    for (const e of evals) {
      const d = e.data
      const name = e.critic.replace('-critic', '')
      const vCls = d.verdict === 'PASS' ? 'v-ok' : d.verdict === 'PARTIAL' ? 'v-warn' : 'v-err'
      const prosList = Array.isArray(d.pros) && d.pros.length
        ? `<div class="eval-sub"><div class="eval-sub-h">✓ pros</div><ul>${d.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''
      const consList = Array.isArray(d.cons) && d.cons.length
        ? `<div class="eval-sub eval-sub-cons"><div class="eval-sub-h">✗ cons</div><ul>${d.cons.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''
      const scoreTag = d.score != null ? `<span class="eval-score">${esc(d.score)}</span>` : ''
      const summary = d.summary ? `<div class="eval-summary">${esc(d.summary)}</div>` : ''
      const hasDetails = prosList || consList
      evalsHtml += `<details class="eval-card"${d.verdict === 'FAIL' ? ' open' : ''}>
        <summary class="eval-card-head">
          <span class="eval-name">${esc(name)}</span>
          <span class="eval-verdict ${vCls}">${esc(d.verdict ?? '-')}</span>
          ${scoreTag}
        </summary>
        <div class="eval-card-body">${summary}${hasDetails ? `<div class="eval-grid">${prosList}${consList}</div>` : ''}</div>
      </details>`
      for (const c of (d.cons ?? [])) {
        allCons.push({ level: d.verdict === 'FAIL' ? 'error' : 'warning', critic: name, text: c })
      }
    }
    allCons.sort((a, b) => (a.level === 'error' ? -1 : 1) - (b.level === 'error' ? -1 : 1))
    if (allCons.length) {
      evalsHtml += `<div class="eval-allcons"><div class="eval-allcons-h">⚠ 问题汇总</div><ul>`
      for (const c of allCons.slice(0, 10)) {
        evalsHtml += `<li class="issue-${c.level}"><em>${esc(c.critic)}</em> · ${esc(c.text)}</li>`
      }
      evalsHtml += `</ul></div>`
    }
    if (agg) {
      const aggCls = agg.verdict === 'PASS' ? 'v-ok' : agg.verdict === 'PARTIAL' ? 'v-warn' : 'v-err'
      evalsHtml = `<div class="eval-agg"><span class="eval-agg-label">聚合</span><span class="eval-verdict ${aggCls}">${esc(agg.verdict)}</span>${agg.score != null ? `<span class="eval-score">${agg.score}</span>` : ''}</div>` + evalsHtml
    }
    evalsAsideInner += evalsHtml
  }

  // aiJudges 卡片（aside 下方）—— judge-card 自身去掉边框/背景，
  // 整个 aside-evals section 按聚合 verdict 染色（见 evalsSectionCls）。
  if (aiJudges.length) {
    const passCount = aiJudges.filter(j => j && j.pass === true).length
    evalsCountLabel = evals?.length
      ? `${evals.length} 维 · ${passCount}/${aiJudges.length} 裁判`
      : `${passCount}/${aiJudges.length} 裁判`
    let judgeBody = ''
    for (let i = 0; i < aiJudges.length; i++) {
      const j = aiJudges[i] ?? {}
      const pass = j.pass === true
      const score = typeof j.score === 'number' ? j.score : null
      const scoreCls = pass ? 'v-ok' : score != null && score >= 50 ? 'v-warn' : 'v-err'
      const passLabel = pass ? 'PASS' : 'FAIL'
      const passCls = pass ? 'v-ok' : 'v-err'
      const criteria = typeof j.criteria === 'string' ? j.criteria : ''
      const reason = typeof j.reason === 'string' ? j.reason : ''
      const aiResp = typeof j.aiResponse === 'string' ? j.aiResponse : ''
      const toolCalls = Array.isArray(j.toolCalls) ? j.toolCalls : []
      judgeBody += `<div class="judge-card">`
      judgeBody += `<div class="judge-head">`
      judgeBody += `<span class="judge-idx">#${i + 1}</span>`
      judgeBody += `<span class="judge-verdict ${passCls}">${passLabel}</span>`
      if (score != null) judgeBody += `<span class="judge-score ${scoreCls}">score ${score}</span>`
      if (toolCalls.length) judgeBody += `<span class="judge-tools">工具：${esc(toolCalls.join(', '))}</span>`
      judgeBody += `</div>`
      if (criteria) judgeBody += `<div class="judge-kv"><span class="judge-k">🎯 评判标准</span><div class="judge-v">${esc(criteria)}</div></div>`
      if (reason) judgeBody += `<div class="judge-kv"><span class="judge-k">💡 裁判理由</span><div class="judge-v judge-reason">${esc(reason)}</div></div>`
      if (aiResp) {
        // AI 回复用 markdown 渲染（含 system-tag 预处理 + 标签白名单 escape，与 dialog 同款）。
        // 截到 3000 字防止 aside 太长。
        const truncated = aiResp.length > 3000 ? aiResp.slice(0, 3000) + '\n\n…（已截断 ' + (aiResp.length - 3000) + ' 字）' : aiResp
        judgeBody += `<div class="judge-kv"><span class="judge-k">📝 AI 回复</span><div class="judge-resp md">${renderMdForDialog(truncated)}</div></div>`
      }
      judgeBody += `</div>`
    }
    // 与上方 critic evals 之间加一条分隔线，标识"AI 裁判"子区块
    const sep = evals?.length
      ? `<div class="aside-subhead">⚖️ AI 裁判（${passCount}/${aiJudges.length} 通过）</div>`
      : ''
    evalsAsideInner += sep + `<div class="judge-list">${judgeBody}</div>`
  }

  // 两者都没数据时才显示 empty CTA
  if (!aiJudges.length && !(evals?.length)) {
    evalsAsideInner = `<div class="eval-empty">
      <div class="eval-empty-title">还没有裁判</div>
      <div class="eval-empty-hint">用 <code>aiJudge()</code> 让 AI 判定测试结果，或让 critic 子 agent 写 <code>evaluations/&lt;testCase&gt;/*.json</code>，再 <code>pnpm test:browser:report</code> 刷新即可。</div>
    </div>`
  }

  // ── 整个 aside-evals section 染色（按 aiJudges 聚合 verdict）──
  // 全 PASS → 绿；全 FAIL → 红；混合 → 中性（不染）。仅当存在 aiJudges 时染色，
  // 让 head + body 都有同一种背景，去掉以前每张 judge-card 自带的二层卡片包装。
  let evalsSectionCls = ''
  let evalsHeadVerdictHtml = ''
  if (aiJudges.length) {
    const passCnt = aiJudges.filter(j => j && j.pass === true).length
    let aggLabel = 'MIXED', aggCls = 'v-warn'
    if (passCnt === aiJudges.length) { evalsSectionCls = ' aside-evals-pass'; aggLabel = 'PASS'; aggCls = 'v-ok' }
    else if (passCnt === 0) { evalsSectionCls = ' aside-evals-fail'; aggLabel = 'FAIL'; aggCls = 'v-err' }
    else { evalsSectionCls = ' aside-evals-mixed' }
    const scores = aiJudges.map(j => typeof j?.score === 'number' ? j.score : null).filter(s => s != null)
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
    const scoreHtml = avgScore != null ? `<span class="judge-head-score">${avgScore}</span>` : ''
    evalsHeadVerdictHtml = `<span class="judge-head-verdict ${aggCls}">${aggLabel}</span>${scoreHtml}`
  }

  // 对话历史 / sessionId —— 直接挂到 panel-title 右侧，作为复制按钮（不再展示完整路径）。
  // 同时给 sessionId 提供独立的复制按钮（替代 ChatProbeHarness 内 Session: xxx 文字）。
  let historyHeaderHtml = ''
  if (historyPath || sessionId) {
    const parts = []
    if (historyPath) {
      const fileUrl = 'file://' + historyPath.split('/').map(encodeURIComponent).join('/')
      parts.push(`<a class="head-icon-btn" href="${esc(fileUrl)}" title="打开聊天目录：${esc(historyPath)}" target="_blank" rel="noopener">📂</a>`)
      parts.push(`<button class="head-icon-btn hist-copy-btn" type="button" data-copy="${esc(historyPath)}" title="复制聊天目录路径：${esc(historyPath)}">💾</button>`)
    }
    if (sessionId) {
      parts.push(`<button class="head-icon-btn hist-copy-btn" type="button" data-copy="${esc(sessionId)}" title="复制 SessionID：${esc(sessionId)}">🔑</button>`)
    }
    historyHeaderHtml = `<div class="panel-header-history">${parts.join('')}</div>`
  }

  // ── 同 testCase 历史 run nav（左侧 sidebar 下半部分用，select(idx) 时填入） ──
  // 拿全量 runs.jsonl 里同 testCase 的所有 run（最新在前，含本次），按 seq 倒序展示。
  // 渲染成隐藏 <template id="history-${idx}">，点击 sidebar nav 时由 JS 填到 #tc-history。
  let historyTemplateHtml = ''
  if (probeKey) {
    const histAll = allRunsByTestCase.get(probeKey) || []
    if (histAll.length) {
      const histItems = histAll.slice(0, 30).map(r => {
        const sd = r.screenshotsDir || ''
        const m = sd.match(/browser-test-runs\/(\d+)\/screenshots$/)
        const seq = m ? m[1] : ''
        const isCurrent = seq === runTs.replace(/^0+/, '').padStart(4, '0') || sd.includes(`/${runTs}/`)
        // vitest 信息（assertion 是否通过 + it 整体耗时）优先于 probe；读不到时 fallback 到 probe
        const vitestInfo = getVitestInfoForRun(seq, r.testCase)
        const effectiveOk = vitestInfo ? vitestInfo.status === 'passed' : r.status === 'ok'
        const statusIcon = effectiveOk ? '✓' : '✗'
        const statusCls = effectiveOk ? 'th-ok' : 'th-err'
        const tools = Array.isArray(r.toolCalls) ? r.toolCalls.length : 0
        // duration 优先 vitest it() 耗时（跟顶部卡片一致），fallback 到 probe elapsedMs
        const durMs = vitestInfo?.durationMs || r.elapsedMs
        const dur = durMs != null ? `${(durMs / 1000).toFixed(1)}s` : ''
        const date = r.runAt ? new Date(r.runAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
        // 读上次 run 的 note（如果有）
        let noteSnippet = ''
        if (seq) {
          const metaPath = join(runsRoot, seq, 'run-meta.json')
          if (existsSync(metaPath)) {
            const meta = safeJson(readFileSync(metaPath, 'utf-8'), {})
            if (meta?.note) noteSnippet = String(meta.note).slice(0, 80)
          }
        }
        const href = seq ? `../${seq}/index.html` : '#'
        const currentBadge = isCurrent ? '<span class="th-current">当前</span>' : ''
        const noteHtml = noteSnippet ? `<div class="th-note" title="${esc(noteSnippet)}">📝 ${esc(noteSnippet)}</div>` : ''
        return `<a class="th-item" href="${esc(href)}" target="${isCurrent ? '_self' : '_blank'}" rel="noopener">
          <span class="th-status ${statusCls}">${statusIcon}</span>
          <span class="th-meta">
            <span class="th-row1"><span class="th-seq">#${esc(seq || '?')}</span><span class="th-date">${esc(date)}</span>${currentBadge}</span>
            <span class="th-row2">🔧 ${tools} ${dur ? `· ⏱ ${esc(dur)}` : ''}</span>
            ${noteHtml}
          </span>
        </a>`
      }).join('')
      historyTemplateHtml = `<template class="history-template" data-for-idx="${idx}">${histItems}</template>`
    }
  }

  // ── 复制 Prompt 按钮 —— 此时 purpose / credits 等都已赋值，安全调用 builder ──
  const promptCopyTextRaw = buildCopyPromptText()
  // 防止 `</script` 把外层 <script type="text/plain"> 截断
  const promptCopyTextEsc = promptCopyTextRaw.replace(/<\/script/gi, '<\\/script')
  const promptCopyBtnHtml = `<button class="head-icon-btn prompt-copy-btn" type="button" data-prompt-target="prompt-${idx}" title="复制完整 Prompt（任务说明 + 上下文 + messages.jsonl 全文）">📋</button>`
  // 把按钮拼到现有 historyHeaderHtml 末尾；如果 historyHeaderHtml 为空（既无 historyPath 也无 sessionId），单独包一层
  if (historyHeaderHtml) {
    historyHeaderHtml = historyHeaderHtml.replace('</div>', `${promptCopyBtnHtml}</div>`)
  } else {
    historyHeaderHtml = `<div class="panel-header-history">${promptCopyBtnHtml}</div>`
  }

  const hasContent = body.trim().length > 0 || badges.trim().length > 0
  const contentHtml = hasContent
    ? `<div class="badges">${badges}</div>${body}`
    : `<div class="panel-empty">这个测试没有 probe 数据可展示<br><small>（未调用 saveTestData / recordProbeRun）</small></div>`

  // ── yaml meta（tags / maxSteps / createdAt / updatedAt）──
  // probe/run 都不带这些字段，统一从 yamlDoc 取。createdAt/updatedAt 显示日期即可，不秀全 ISO。
  const yamlTags = Array.isArray(yamlDoc?.tags) ? yamlDoc.tags : []
  const yamlMaxSteps = typeof yamlDoc?.maxSteps === 'number' ? yamlDoc.maxSteps : null
  const fmtYamlDate = (v) => {
    if (!v) return null
    const s = String(v)
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const yamlCreatedAt = fmtYamlDate(yamlDoc?.createdAt)
  const yamlUpdatedAt = fmtYamlDate(yamlDoc?.updatedAt)
  const headerMetaParts = []
  if (yamlTags.length) {
    headerMetaParts.push(yamlTags.map(t => `<span class="header-tag">${esc(t)}</span>`).join(''))
  }
  if (yamlMaxSteps != null) headerMetaParts.push(`<span class="header-meta-item" title="maxSteps">↳ ${yamlMaxSteps}</span>`)
  if (yamlCreatedAt) headerMetaParts.push(`<span class="header-meta-item" title="createdAt">📅 ${esc(yamlCreatedAt)}</span>`)
  if (yamlUpdatedAt && yamlUpdatedAt !== yamlCreatedAt) headerMetaParts.push(`<span class="header-meta-item" title="updatedAt">✎ ${esc(yamlUpdatedAt)}</span>`)
  const headerMetaHtml = headerMetaParts.length
    ? `<div class="panel-header-meta">${headerMetaParts.join('')}</div>`
    : ''

  // 右侧 aside 顶部：测试目的（specDescription 一行 + purpose markdown 块）。
  // purpose 是 yaml 维护的长文本，跨 run 稳定，放在评审上方让人一眼看到测什么。
  let purposeAsideHtml = ''
  if (purpose || specDescription) {
    const specPart = specDescription ? `<div class="aside-spec-desc">${esc(specDescription)}</div>` : ''
    const purposePart = purpose ? `<div class="aside-spec-purpose md">${markdownWithAttachments(purpose)}</div>` : ''
    purposeAsideHtml = `<section class="aside-section aside-purpose">
      <div class="aside-head">🎯 测试目的</div>
      <div class="aside-body aside-purpose-body">${specPart}${purposePart}</div>
    </section>`
  }

  // panel-header 单行：icon + title + (tags + 日期) + (聊天路径/sessionId 复制按钮)
  const panel = `<section class="detail-panel" data-idx="${idx}" hidden>
    <div class="panel-header">
      <div class="panel-header-top">
        <span class="panel-icon ${cls}">${icon}</span>
        <div class="panel-title">${esc(fullName)}</div>
        ${headerMetaHtml}
        ${historyHeaderHtml}
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-content">${contentHtml}</div>
      <aside class="panel-aside">
        ${purposeAsideHtml}
        <section class="aside-section aside-evals${evalsSectionCls}">
          <div class="aside-head aside-head-row"><span class="aside-head-title">⚖️ 裁判（${evalsCountLabel}）</span><span class="aside-head-verdict-wrap">${evalsHeadVerdictHtml}</span></div>
          <div class="aside-body aside-evals-body">${evalsAsideInner}</div>
        </section>
      </aside>
    </div>
    <script type="text/plain" id="prompt-${idx}">${promptCopyTextEsc}</script>
    ${historyTemplateHtml}
  </section>`

  // Stage 2：每个 case 单独写一份 HTML，slug 是文件名。优先级：
  //   1) probeKey（saveTestData 写入的 testCase key）— 与 data/*.json / yaml 完全对齐
  //   2) 测试文件路径派生的 suite-basename（失败用例 probe 缺失时唯一稳定 key）
  //      例 __tests__/approval/001-interactive-approval.browser.tsx → approval-001-interactive-approval
  //   3) 测试名 / idx 兜底
  let slug = probeKey
  if (!slug && test.__filePath) {
    const m = String(test.__filePath).match(/__tests__\/(.+)\.browser\.tsx?$/)
    if (m) slug = m[1].replace(/\//g, '-')
  }
  if (!slug) slug = fullName || `case-${idx}`
  slug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '_')
  return { nav, panel, slug, idx, status: test.status }
}

// 截图分配函数已移除：DOM 快照取代 PNG 截图后，aside-shots 区不再渲染。
// screenshots/*.png 仍由 takeProbeScreenshot 落盘（测试代码可能依赖该 helper），
// 但 report 不再消费它们。

// ── 渲染单 run 报告 ──
const allTests = []
for (const file of vitestData.testResults ?? []) {
  const filePath = file.name ?? ''
  for (const t of file.assertionResults ?? []) allTests.push({ ...t, __filePath: filePath })
}
const passed = allTests.filter(t => t.status === 'passed').length
const failed = allTests.filter(t => t.status === 'failed').length
const total = vitestData.numTotalTests ?? allTests.length
const gitCommit = [...runRecordByTestCase.values()][0]?.gitCommit ?? ''
const gitBranch = [...runRecordByTestCase.values()][0]?.gitBranch ?? ''
const totalCredits = [...runRecordByTestCase.values()]
  .map(r => r.creditsConsumed ?? 0)
  .reduce((a, b) => a + b, 0)
// 聚合所有用例的 tokenUsage（按 totalTokens 求和，其他字段同步累加用于 tooltip）。
// runs.jsonl 没记 tokenUsage 的老记录直接忽略，不从 probeData 回读（太重）。
const totalTokens = [...runRecordByTestCase.values()].reduce(
  (acc, r) => {
    const u = r?.tokenUsage
    if (!u) return acc
    acc.input += Number(u.inputTokens) || 0
    acc.output += Number(u.outputTokens) || 0
    acc.total += Number(u.totalTokens) || 0
    acc.reasoning += Number(u.reasoningTokens) || 0
    acc.cached += Number(u.cachedInputTokens) || 0
    return acc
  },
  { input: 0, output: 0, total: 0, reasoning: 0, cached: 0 },
)
// total 缺失兜底：走 in+out
if (totalTokens.total === 0 && (totalTokens.input > 0 || totalTokens.output > 0)) {
  totalTokens.total = totalTokens.input + totalTokens.output
}
const hasTotalTokens = totalTokens.total > 0

const statusCls = failed > 0 ? 'fail' : 'pass'
const statusIcon = failed > 0 ? '✗' : '✓'

const styles = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#1a1a1a;padding:0;margin:0;max-width:none}
.app{display:grid;grid-template-columns:300px 1fr;height:100vh;overflow:hidden}
.sidebar{overflow:hidden;border-right:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column}
.sidebar-head{padding:12px 14px 10px;border-bottom:1px solid #f0f0f0;flex-shrink:0}
.sidebar-head .back{display:inline-block;margin-bottom:8px;font-size:11px;color:#2563eb;text-decoration:none}
.sidebar-head .back:hover{text-decoration:underline}
.sidebar-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.sidebar-head h1{font-size:15px;font-weight:600;line-height:1.3;margin:0}
.sidebar-head .summary{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:10px;flex-shrink:0}
.summary.pass{background:#dcfce7;color:#166534}
.summary.fail{background:#fee2e2;color:#991b1b}
.sidebar-meta-pills{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.sidebar-note{margin-top:8px;padding:8px 10px;background:#fef9c3;border:1px solid #fde68a;border-radius:6px;font-size:11.5px;line-height:1.5;color:#713f12}
.sidebar-note-label{display:block;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#a16207;margin-bottom:3px}
.sidebar-note-body{white-space:pre-wrap;word-break:break-word}
.tc-history{margin-top:auto;border-top:1px solid #e5e7eb;background:#fafafa;max-height:42%;display:flex;flex-direction:column;flex-shrink:0}
.tc-history-head{padding:8px 12px 4px;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0}
.tc-history-list{overflow-y:auto;padding:0 6px 8px;display:flex;flex-direction:column;gap:2px;flex:1}
.th-item{display:flex;gap:6px;padding:6px 8px;border-radius:6px;text-decoration:none;color:#1f2937;font-size:11px;line-height:1.35;transition:background 0.12s}
.th-item:hover{background:#e5e7eb}
.th-status{flex-shrink:0;width:14px;text-align:center;font-weight:700}
.th-status.th-ok{color:#16a34a}
.th-status.th-err{color:#dc2626}
.th-meta{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.th-row1{display:flex;gap:5px;align-items:center}
.th-seq{font-family:Menlo,Monaco,monospace;font-weight:600;color:#1d4ed8}
.th-date{color:#64748b;font-size:10px}
.th-current{margin-left:auto;background:#dcfce7;color:#15803d;padding:0 5px;border-radius:8px;font-size:9px;font-weight:600}
.th-row2{color:#64748b;font-size:10px;font-variant-numeric:tabular-nums}
.th-note{color:#a16207;font-size:10px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.sb-pill{display:inline-flex;align-items:center;font-size:10.5px;color:#475569;background:#f1f5f9;padding:2px 7px;border-radius:10px;line-height:1.45;font-variant-numeric:tabular-nums;white-space:nowrap}
.sb-pill-date{background:#eff6ff;color:#1d4ed8}
.sb-pill-credits{background:#fef3c7;color:#92400e}
.sb-pill-tokens{background:#e0f2fe;color:#075985;font-variant-numeric:tabular-nums}
.sb-pill-git{background:#f5f3ff;color:#5b21b6;font-family:Menlo,Monaco,monospace;font-size:10px}
.nav-list{display:flex;flex-direction:column;padding:6px 0;overflow-y:auto;flex:1}
.nav-item{display:flex;align-items:center;gap:8px;padding:8px 14px;border:none;background:transparent;cursor:pointer;text-align:left;border-left:3px solid transparent;font:inherit;color:inherit;width:100%}
.nav-item:hover{background:#f8fafc}
.nav-item.active{background:#eff6ff;border-left-color:#2563eb}
.nav-item.nav-pass{color:#1a1a1a}
.nav-item.nav-fail{color:#991b1b}
.nav-item.nav-skip{color:#6b7280}
.nav-icon{font-weight:700;font-size:14px;width:14px;flex-shrink:0}
.nav-item.nav-pass .nav-icon{color:#16a34a}
.nav-item.nav-fail .nav-icon{color:#dc2626}
.nav-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.nav-name{font-size:12px;font-weight:500;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-sub{font-size:10px;color:#94a3b8;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-agg{font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;flex-shrink:0}
.nav-agg-ok{background:#dcfce7;color:#166534}
.nav-agg-warn{background:#fef3c7;color:#92400e}
.nav-agg-err{background:#fee2e2;color:#991b1b}
.detail-host{overflow:hidden;display:flex;flex-direction:column;height:100%;background:#fafafa}
.detail-empty{padding:40px;color:#94a3b8;text-align:center;font-size:13px}
.detail-panel{display:flex;flex-direction:column;height:100%;overflow:hidden}
.detail-panel[hidden]{display:none}
.panel-header{padding:10px 16px;background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0}
.panel-header-top{display:flex;gap:10px;align-items:center}
.panel-icon{font-weight:700;font-size:15px;line-height:1.4;flex-shrink:0}
.panel-icon.pass{color:#16a34a}
.panel-icon.fail{color:#dc2626}
.panel-title{flex:1;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
/* tags + 日期 紧贴 title 右侧（不再独占第二行） */
.panel-header-meta{display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center;flex-shrink:0}
.panel-header-meta .header-tag{display:inline-flex;align-items:center;font-size:10px;font-weight:500;padding:1px 7px;border-radius:10px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;line-height:1.5}
.panel-header-meta .header-meta-item{display:inline-flex;align-items:center;font-size:10.5px;color:#64748b;background:#f1f5f9;padding:1px 7px;border-radius:3px;line-height:1.5;font-variant-numeric:tabular-nums}
/* 聊天路径 / sessionId — icon-only 圆形按钮 */
.panel-header-history{display:inline-flex;align-items:center;gap:4px;flex-shrink:0}
.head-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;border-radius:5px;font-size:13px;color:#475569;text-decoration:none;transition:background 0.15s,border-color 0.15s,color 0.15s}
.head-icon-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
.head-icon-btn.copied{background:#dcfce7;border-color:#86efac;color:#166534}
.panel-metrics{display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center}
.metric{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#475569;font-variant-numeric:tabular-nums;background:#f1f5f9;padding:3px 8px;border-radius:4px;white-space:nowrap}
.metric-icon{font-size:12px}
.metric.metric-credits{background:#fef3c7;color:#92400e}
.metric.metric-tokens{background:#ede9fe;color:#5b21b6}
.metric.metric-model{background:#e0e7ff;color:#3730a3;font-family:Menlo,Monaco,monospace}
.metric.metric-model-override{background:#ffedd5;color:#9a3412;border:1px solid #fed7aa;font-family:Menlo,Monaco,monospace;font-weight:500}
.metric.metric-ok{background:#dcfce7;color:#166534}
.metric.metric-warn{background:#fef3c7;color:#92400e}
.metric.metric-err{background:#fee2e2;color:#991b1b}
.metric-fail{margin-left:4px;color:#991b1b;font-weight:600}
.nav-fail-mark{color:#dc2626;font-weight:600}
.panel-body{flex:1;display:grid;grid-template-columns:1fr 380px;overflow:hidden;min-height:0}
.panel-content{overflow-y:auto;padding:0}
.panel-aside{border-left:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.aside-section{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.aside-section + .aside-section{border-top:1px solid #e5e7eb}
.aside-purpose{flex:0 0 auto;max-height:42%}
.aside-evals{flex:1 1 auto;min-height:200px}
/* aside-evals 整体按 aiJudges 聚合 verdict 染色（覆盖 head + body） */
.aside-evals.aside-evals-pass .aside-head{background:#dcfce7;color:#14532d;border-bottom-color:#86efac}
.aside-evals.aside-evals-pass .aside-body{background:#f0fdf4}
.aside-evals.aside-evals-fail .aside-head{background:#fee2e2;color:#7f1d1d;border-bottom-color:#fca5a5}
.aside-evals.aside-evals-fail .aside-body{background:#fef2f2}
.aside-evals.aside-evals-mixed .aside-head{background:#fef3c7;color:#78350f;border-bottom-color:#fcd34d}
.aside-evals.aside-evals-mixed .aside-body{background:#fffbeb}
.aside-head{padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:600;color:#475569;background:#fafafa;flex-shrink:0;display:flex;align-items:center;gap:6px}
.aside-head.aside-head-row{justify-content:space-between}
.aside-head-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aside-head-verdict-wrap{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.judge-head-verdict{font-weight:700;font-size:10.5px;padding:2px 8px;border-radius:10px;letter-spacing:0.3px}
.judge-head-verdict.v-ok{background:#16a34a;color:#fff}
.judge-head-verdict.v-err{background:#dc2626;color:#fff}
.judge-head-verdict.v-warn{background:#d97706;color:#fff}
.judge-head-score{font-size:11px;font-variant-numeric:tabular-nums;background:rgba(255,255,255,0.85);color:#1f2937;padding:1px 7px;border-radius:10px;font-weight:600}
.aside-body{overflow-y:auto;flex:1;min-height:0}
.aside-evals-body{padding:10px;display:flex;flex-direction:column;gap:8px;min-height:0}
/* AI 回复占满 aside 剩余高度（仅当 aside 内只有 aiJudges 时生效更明显） */
.aside-evals-body .judge-list{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0}
.aside-evals-body .judge-card{display:flex;flex-direction:column;min-height:0;flex:1}
.aside-evals-body .judge-card .judge-kv:last-child{display:flex;flex-direction:column;flex:1;min-height:0}
.aside-evals-body .judge-card .judge-kv:last-child .judge-resp{flex:1;max-height:none;min-height:120px}
.aside-purpose-body{padding:10px 12px;font-size:11.5px;line-height:1.55;color:#1f2937}
.aside-spec-desc{font-size:12px;font-weight:500;color:#1e3a8a;margin-bottom:8px;padding:5px 9px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:3px;line-height:1.5}
.aside-spec-purpose.md p{margin:5px 0}
.aside-spec-purpose.md h1,.aside-spec-purpose.md h2,.aside-spec-purpose.md h3,.aside-spec-purpose.md h4{margin:8px 0 3px;font-weight:600;color:#0f172a}
.aside-spec-purpose.md h1{font-size:13px}
.aside-spec-purpose.md h2{font-size:12.5px}
.aside-spec-purpose.md h3,.aside-spec-purpose.md h4{font-size:12px}
.aside-spec-purpose.md ul,.aside-spec-purpose.md ol{margin:3px 0;padding-left:18px}
.aside-spec-purpose.md li{margin:1px 0}
.aside-spec-purpose.md code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-family:Menlo,Monaco,monospace;font-size:10.5px}
.aside-spec-purpose.md pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:4px;padding:5px 7px;overflow-x:auto;margin:5px 0}
.aside-spec-purpose.md pre code{background:transparent;padding:0}
.aside-spec-purpose.md blockquote{border-left:3px solid #cbd5e1;margin:4px 0;padding:2px 9px;color:#475569;background:#f8fafc}
.aside-spec-purpose.md a{color:#2563eb;text-decoration:underline}
.eval-agg{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#f1f5f9;border-radius:6px;font-size:11px;margin-bottom:2px}
.eval-agg-label{color:#64748b;font-weight:500}
.eval-card{background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
.eval-card[open]{border-color:#cbd5e1;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.eval-card-head{padding:7px 10px;display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-size:12px;user-select:none}
.eval-card-head::-webkit-details-marker{display:none}
.eval-card-head::before{content:'▸';font-size:9px;color:#94a3b8;width:8px;display:inline-block;transition:transform 0.15s}
.eval-card[open] .eval-card-head::before{content:'▾'}
.eval-name{font-weight:500;color:#334155;flex:1}
.eval-verdict{font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;letter-spacing:0.3px}
.eval-verdict.v-ok{background:#dcfce7;color:#166534}
.eval-verdict.v-warn{background:#fef3c7;color:#92400e}
.eval-verdict.v-err{background:#fee2e2;color:#991b1b}
.eval-score{font-size:11px;font-variant-numeric:tabular-nums;color:#475569;background:#f1f5f9;padding:1px 6px;border-radius:3px}
.eval-card-body{padding:8px 10px;background:#fafbfc;border-top:1px solid #f0f0f0;font-size:11.5px;line-height:1.55}
.eval-summary{color:#1f2937;margin-bottom:6px}
.eval-grid{display:flex;flex-direction:column;gap:6px}
.eval-sub .eval-sub-h{font-size:10px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px}
.eval-sub.eval-sub-cons .eval-sub-h{color:#dc2626}
.eval-sub ul{list-style:none;padding-left:0;margin:0}
.eval-sub li{padding:2px 0 2px 14px;position:relative;color:#475569}
.eval-sub li::before{content:'·';position:absolute;left:4px;color:#94a3b8}
.eval-allcons{background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;font-size:11px;margin-top:4px}
.eval-allcons-h{font-weight:600;color:#92400e;margin-bottom:4px;font-size:10px;text-transform:uppercase;letter-spacing:0.3px}
.eval-allcons ul{list-style:none;padding-left:0;margin:0}
.eval-allcons li{padding:2px 0;line-height:1.4}
.eval-allcons li.issue-error{color:#991b1b}
.eval-allcons li.issue-warning{color:#92400e}
.eval-allcons li em{font-style:normal;font-weight:600;margin-right:2px}
.eval-empty{padding:18px 12px;text-align:center;color:#64748b}
.eval-empty-title{font-size:12px;font-weight:500;margin-bottom:6px}
.eval-empty-hint{font-size:11px;line-height:1.5;color:#94a3b8}
.eval-empty-hint code{background:#f1f5f9;padding:1px 4px;border-radius:2px;font-size:10px;color:#475569}
.panel-empty{padding:40px 20px;color:#94a3b8;text-align:center;font-size:13px;line-height:1.6}
.panel-empty small{font-size:11px;color:#cbd5e1}
@media (max-width:960px){.panel-body{grid-template-columns:1fr}.panel-aside{border-left:none;border-top:1px solid #e5e7eb}}
@media (max-width:640px){.app{grid-template-columns:1fr;grid-template-rows:auto 1fr}.sidebar{max-height:40vh}}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.b{background:#f1f5f9;color:#475569;padding:3px 9px;border-radius:4px;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}
.b-ok{background:#dcfce7;color:#166534}
.b-warn{background:#fef3c7;color:#92400e}
.b-err{background:#fee2e2;color:#991b1b}
details.sec{border-top:1px solid #f0f0f0}
details.sec > summary{padding:8px 14px;cursor:pointer;font-size:12px;font-weight:500;color:#475569;list-style:none;user-select:none}
details.sec > summary::-webkit-details-marker{display:none}
details.sec > summary:before{content:'▸ ';color:#94a3b8;display:inline-block;transition:transform 0.15s}
details.sec[open] > summary:before{content:'▾ '}
details.sec > summary:hover{background:#f8fafc}
.sec-body{padding:10px 14px 14px;font-size:12px}
/* Always-expanded section: 不用 <details>，给一个固定 head + body */
section.sec.sec-always{border-top:1px solid #f0f0f0}
section.sec.sec-always > .sec-head{padding:8px 14px;font-size:12px;font-weight:500;color:#475569;background:#f8fafc;border-bottom:1px solid #f0f0f0}
section.sec.sec-always > .sec-head-row{display:flex;align-items:center;gap:10px}
.sec-head-title{flex:0 0 auto}
/* DOM 快照下方的工具行：metric pills + PROMPT/PREFACE 按钮 */
.sec-head-meta{display:inline-flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.snapshot-foot-metrics{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center}
.snapshot-foot-actions{display:inline-flex;gap:6px;align-items:center}
.sec-head-meta .metric{font-size:10.5px;padding:2px 7px}
.md-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;font-size:11px;line-height:1.4;background:#fff;border:1px solid #cbd5e1;border-radius:4px;color:#334155;cursor:pointer;font-family:inherit;transition:background 0.15s,border-color 0.15s,color 0.15s}
.md-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
.md-btn:active{background:#dbeafe}
/* MD Dialog —— 复用全局 #md-dialog */
.md-dialog{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:30px}
.md-dialog[hidden]{display:none}
.md-dialog-box{width:min(1280px,95vw);max-height:100%;background:#fff;border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden}
.md-dialog-head{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#f8fafc;flex-shrink:0}
.md-dialog-title{flex:1;font-size:13px;font-weight:600;color:#1e293b}
.md-dialog-actions{display:flex;gap:6px}
.md-dialog-actions .md-btn{padding:3px 10px}
.md-dialog-close{border:1px solid #cbd5e1;background:#fff;cursor:pointer;width:26px;height:26px;border-radius:4px;font-size:14px;color:#475569;display:flex;align-items:center;justify-content:center}
.md-dialog-close:hover{background:#fee2e2;border-color:#fca5a5;color:#991b1b}
.md-dialog-body{flex:1;overflow:auto;padding:16px 20px;background:#fff}
.md-dialog-pre{display:none}
/* dialog 内 markdown 渲染样式 */
.md-dialog-content{font-size:13px;line-height:1.6;color:#1f2937}
.md-dialog-content p{margin:8px 0}
.md-dialog-content h1,.md-dialog-content h2,.md-dialog-content h3,.md-dialog-content h4{margin:14px 0 6px;font-weight:600;color:#0f172a;line-height:1.3}
.md-dialog-content h1{font-size:18px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}
.md-dialog-content h2{font-size:15px}
.md-dialog-content h3{font-size:13.5px}
.md-dialog-content h4{font-size:13px}
.md-dialog-content ul,.md-dialog-content ol{margin:6px 0;padding-left:24px}
.md-dialog-content li{margin:3px 0}
.md-dialog-content code{background:#f1f5f9;padding:1px 5px;border-radius:3px;font-family:Menlo,Monaco,monospace;font-size:11.5px;color:#be185d}
.md-dialog-content pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:4px;padding:8px 10px;overflow-x:auto;margin:8px 0}
.md-dialog-content pre code{background:transparent;padding:0;color:#1f2937}
.md-dialog-content blockquote{border-left:3px solid #cbd5e1;margin:6px 0;padding:4px 12px;color:#475569;background:#f8fafc}
.md-dialog-content a{color:#2563eb;text-decoration:underline}
.md-dialog-content table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
.md-dialog-content table th,.md-dialog-content table td{padding:5px 10px;border:1px solid #e5e7eb;text-align:left}
.md-dialog-content table th{background:#f8fafc;font-weight:600}
.md-dialog-content hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0}
.md-dialog-content strong{font-weight:600;color:#0f172a}
.md-dialog-content em{font-style:italic}
/* 工具调用明细 —— 列表 + 每行可展开 */
.tool-list{display:flex;flex-direction:column;gap:3px}
.tool-item{border:1px solid #e5e7eb;border-radius:4px;background:#fff;overflow:hidden}
.tool-item[open]{border-color:#cbd5e1;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.tool-item > summary{cursor:pointer;list-style:none;user-select:none}
.tool-item > summary::-webkit-details-marker{display:none}
.tool-item-static .tool-row{cursor:default}
.tool-row{display:grid;grid-template-columns:14px minmax(0,1fr) 110px 60px auto;gap:10px;align-items:center;padding:6px 10px;font-size:11.5px}
.tool-item > summary.tool-row::before{content:'▸';color:#94a3b8;font-size:9px;justify-self:center;transition:transform 0.15s}
.tool-item[open] > summary.tool-row::before{content:'▾'}
.tool-item-static > .tool-row::before{content:'';display:block}
.tool-name{font-family:Menlo,Monaco,monospace;font-size:11.5px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tool-turn{font-size:10.5px;color:#64748b;font-variant-numeric:tabular-nums;text-align:right;font-family:Menlo,Monaco,monospace}
.tool-status{font-family:Menlo,Monaco,monospace;font-size:10.5px;font-weight:600;text-align:center;padding:1px 6px;border-radius:3px}
.tool-status.v-ok{background:#dcfce7;color:#166534}
.tool-status.v-err{background:#fee2e2;color:#991b1b}
.tool-state{font-size:10px;color:#64748b;background:#f1f5f9;padding:1px 6px;border-radius:3px;font-family:Menlo,Monaco,monospace}
.tool-body{padding:8px 12px 10px;border-top:1px solid #f0f0f0;background:#fafbfc;display:flex;flex-direction:column;gap:8px}
.tool-kv{display:flex;flex-direction:column;gap:4px}
.tool-k-row{display:flex;align-items:center;gap:8px}
.tool-k{font-size:10.5px;color:#64748b;font-weight:500;flex:1}
.tool-v{background:#fff;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;margin:0;font-family:Menlo,Monaco,monospace;font-size:10.5px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:360px;overflow-y:auto;color:#1f2937}
.tool-v-err{background:#fef2f2;border-color:#fecaca;color:#991b1b}
/* JSON syntax highlight（colorizeJson 输出的 span，pre 上挂 .json-pre）*/
.json-pre{color:#475569}
.json-pre .j-key{color:#0e7490;font-weight:500}
.json-pre .j-str{color:#16a34a}
.json-pre .j-num{color:#b45309}
.json-pre .j-bool{color:#7c3aed;font-weight:500}
.json-pre .j-null{color:#6b7280;font-style:italic}
/* aside 子区分隔 */
.aside-subhead{font-size:10.5px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;padding:6px 0 4px;border-top:1px solid #e5e7eb;margin-top:6px}
.judge-list{display:flex;flex-direction:column;gap:8px}
/* DOM 快照专属 sec-body：去掉所有 padding，让 iframe 紧贴 sec-head */
section.sec.sec-dom-snapshot > .sec-body{padding:0}
.dom-snapshot-wrap{position:relative;width:100%;height:690px;background:#fff;border-top:1px solid #e5e7eb}
.dom-snapshot-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;display:block;opacity:0;transition:opacity 0.25s ease-out;z-index:1}
.dom-snapshot-wrap.loaded .dom-snapshot-frame{opacity:1}
/* loading 必须高于 iframe（z-index:2），否则 iframe 在 DOM 顺序后会盖住 loading 视觉层 */
.dom-snapshot-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#f8fafc;color:#64748b;font-size:11px;pointer-events:none;transition:opacity 0.3s ease-out;z-index:2;opacity:1}
.dom-snapshot-wrap.loaded .dom-snapshot-loading{opacity:0;visibility:hidden}
.dom-snapshot-spinner{width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:dom-spin 0.8s linear infinite}
.dom-snapshot-loading-text{font-size:12px;color:#64748b;font-weight:500}
@keyframes dom-spin{to{transform:rotate(360deg)}}
/* 网络请求列表：每条一行，可展开 req/resp body */
.net-list{display:flex;flex-direction:column;gap:2px;font-size:11.5px}
.net-item{border:1px solid #e5e7eb;border-radius:4px;background:#fff;overflow:hidden}
.net-item[open]{border-color:#cbd5e1;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.net-item > summary{cursor:pointer;list-style:none;user-select:none}
.net-item > summary::-webkit-details-marker{display:none}
.net-item-static .net-row{cursor:default}
/* method 60 / status 56（固定，含 4xx/5xx 也不会换行）/ url 弹性 / duration 60 右对齐 / copy 按钮 26 */
.net-row{display:grid;grid-template-columns:14px 56px 56px minmax(0,1fr) 60px 26px;gap:10px;align-items:center;padding:6px 10px;font-size:11px}
.net-item > summary.net-row::before{content:'▸';color:#94a3b8;font-size:9px;justify-self:center;transition:transform 0.15s}
.net-item[open] > summary.net-row::before{content:'▾'}
.net-item-static > .net-row::before{content:'';display:block}
.net-method{font-family:Menlo,Monaco,monospace;font-size:10.5px;font-weight:600;color:#475569;background:#f1f5f9;padding:1px 6px;border-radius:3px;text-align:center}
.net-status{font-family:Menlo,Monaco,monospace;font-size:10.5px;font-weight:600;text-align:center;padding:1px 6px;border-radius:3px;min-width:56px}
.net-status.v-ok{background:#dcfce7;color:#166534}
.net-status.v-err{background:#fee2e2;color:#991b1b}
.net-url{font-family:Menlo,Monaco,monospace;font-size:10.5px;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.net-dur{font-variant-numeric:tabular-nums;color:#64748b;font-size:10.5px;text-align:right;justify-self:end}
.net-body{padding:8px 12px 10px;border-top:1px solid #f0f0f0;background:#fafbfc;display:flex;flex-direction:column;gap:8px}
.net-kv{display:flex;flex-direction:column;gap:4px}
.net-k-row{display:flex;align-items:center;gap:8px}
.net-k{font-size:10.5px;color:#64748b;font-weight:500;flex:1}
.net-copy-btn{border:1px solid #e2e8f0;background:#fff;cursor:pointer;padding:1px 6px;border-radius:3px;font-size:10px;line-height:1.5;color:#475569}
.net-copy-btn:hover{background:#eff6ff;border-color:#93c5fd}
.net-copy-btn.copied{background:#dcfce7;border-color:#86efac;color:#166534}
.net-row-copy-btn{border:1px solid #e2e8f0;background:#fff;cursor:pointer;padding:0;border-radius:3px;font-size:11px;line-height:1;color:#475569;width:24px;height:20px;display:inline-flex;align-items:center;justify-content:center;justify-self:end}
.net-row-copy-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
.net-row-copy-btn.copied{background:#dcfce7;border-color:#86efac;color:#166534}
.net-v{background:#fff;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;margin:0;font-family:Menlo,Monaco,monospace;font-size:10.5px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:360px;overflow-y:auto;color:#1f2937}
.net-v-err{background:#fef2f2;border-color:#fecaca;color:#991b1b}
.net-more{font-size:11px;color:#94a3b8;padding:4px 0;text-align:center;font-style:italic}
/* 截图列表：纯文本按钮，触发隐藏的 <img data-lightbox> 走 lightbox 预览 */
.shot-list{display:flex;flex-direction:column;gap:4px}
.shot-btn{display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px 10px;cursor:pointer;font-family:Menlo,Monaco,monospace;font-size:11px;color:#334155;text-align:left;transition:background 0.15s,border-color 0.15s}
.shot-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
.shot-hidden-img{display:none}
.sec-spec > summary{background:#eff6ff;color:#1d4ed8}
.sec-spec[open] > summary{background:#dbeafe}
.sec-judge > summary{background:#fff7ed;color:#9a3412}
.sec-judge[open] > summary{background:#ffedd5}
/* judge-card：自身透明（不再二层卡片包装），由外层 aside-evals 整体染色 */
.judge-card{padding:0;margin-bottom:14px;background:transparent;border:none;font-size:11.5px;line-height:1.55}
.judge-card:last-child{margin-bottom:0}
.judge-card + .judge-card{padding-top:14px;border-top:1px dashed rgba(0,0,0,0.12)}
.judge-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.judge-idx{color:#475569;font-size:10px;font-weight:500;background:rgba(255,255,255,0.7);padding:1px 6px;border-radius:10px}
.judge-verdict{font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px}
.judge-verdict.v-ok{background:#16a34a;color:#fff}
.judge-verdict.v-err{background:#dc2626;color:#fff}
.judge-score{font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.7);color:#475569}
.judge-score.v-ok{background:rgba(255,255,255,0.85);color:#166534}
.judge-score.v-warn{background:rgba(255,255,255,0.85);color:#92400e}
.judge-score.v-err{background:rgba(255,255,255,0.85);color:#991b1b}
.judge-tools{font-size:10.5px;color:#475569;margin-left:auto}
.judge-kv{margin-top:6px}
.judge-k{display:block;font-size:10.5px;color:#475569;font-weight:500;margin-bottom:3px}
.judge-v{color:#1f2937;background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06);border-radius:4px;padding:6px 8px;white-space:pre-wrap;word-break:break-word}
.judge-reason{/* 不再单独配色：与 judge-v 一致，避免与卡片背景冲突 */}
.judge-resp{background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06);border-radius:4px;padding:6px 8px;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;line-height:1.5;word-break:break-word;max-height:280px;overflow-y:auto;color:#1f2937}
.judge-resp.md{white-space:normal}
.judge-resp.md p{margin:4px 0}
.judge-resp.md h1,.judge-resp.md h2,.judge-resp.md h3,.judge-resp.md h4{margin:8px 0 3px;font-weight:600;color:#0f172a}
.judge-resp.md h1{font-size:13px}
.judge-resp.md h2{font-size:12.5px}
.judge-resp.md h3,.judge-resp.md h4{font-size:12px}
.judge-resp.md ul,.judge-resp.md ol{margin:3px 0;padding-left:18px}
.judge-resp.md li{margin:1px 0}
.judge-resp.md code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-family:Menlo,Monaco,monospace;font-size:10.5px;color:#be185d}
.judge-resp.md pre{background:#0f172a;color:#e2e8f0;border-radius:4px;padding:6px 8px;overflow-x:auto;margin:5px 0}
.judge-resp.md pre code{background:transparent;padding:0;color:inherit}
.judge-resp.md table{width:100%;border-collapse:collapse;margin:5px 0;font-size:10.5px}
.judge-resp.md table th,.judge-resp.md table td{padding:3px 6px;border:1px solid #cbd5e1;text-align:left}
.judge-resp.md table th{background:rgba(255,255,255,0.6);font-weight:600}
.judge-resp.md blockquote{border-left:3px solid #cbd5e1;margin:4px 0;padding:2px 8px;color:#475569}
.judge-resp.md strong{font-weight:600;color:#0f172a}
.spec-desc{font-size:13px;font-weight:500;color:#1e3a8a;margin-bottom:8px;padding:6px 10px;background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:3px}
.spec-purpose{background:#fdfdfd;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.65;white-space:pre-wrap;word-break:break-word;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-height:400px;overflow-y:auto}
/* markdown 渲染后的 purpose：取消 pre-wrap，让 marked 的 block 元素自己排版 */
.spec-purpose.md{white-space:normal}
.spec-purpose.md p{margin:6px 0}
.spec-purpose.md h1,.spec-purpose.md h2,.spec-purpose.md h3,.spec-purpose.md h4{margin:10px 0 4px;font-weight:600;color:#0f172a}
.spec-purpose.md h1{font-size:14px}
.spec-purpose.md h2{font-size:13px}
.spec-purpose.md h3,.spec-purpose.md h4{font-size:12.5px}
.spec-purpose.md ul,.spec-purpose.md ol{margin:4px 0;padding-left:20px}
.spec-purpose.md li{margin:2px 0}
.spec-purpose.md code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-family:Menlo,Monaco,'Courier New',monospace;font-size:11px}
.spec-purpose.md pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;overflow-x:auto;margin:6px 0}
.spec-purpose.md pre code{background:transparent;padding:0}
.spec-purpose.md blockquote{border-left:3px solid #cbd5e1;margin:4px 0;padding:2px 10px;color:#475569;background:#f8fafc}
.spec-purpose.md a{color:#2563eb;text-decoration:underline}
/* <system-tag attachment/> 渲染成的 inline 缩略图（图片/音频/视频） */
.inline-att{display:inline-block;vertical-align:middle;margin:0 4px;border:1px solid #e5e7eb;border-radius:4px;background:#fff}
.inline-att-img{max-height:80px;max-width:160px;object-fit:cover;cursor:zoom-in}
.inline-att-video{max-height:100px;max-width:200px}
.inline-att-miss{display:inline-block;padding:1px 6px;margin:0 3px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:3px;color:#64748b;font-size:11px}
.prompt-val{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin-top:4px;font-size:11px;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
.reply-val{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin-top:4px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
.kv{margin-bottom:8px}
.k{color:#888;font-size:11px;font-weight:500}
.kv pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin-top:4px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:11px;background:#fff}
table th,table td{padding:5px 10px;text-align:left;border-bottom:1px solid #f0f0f0}
table th{background:#f8fafc;color:#475569;font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:0.3px}
.eval-table .c-name{font-weight:500}
.v-ok{color:#166534;font-weight:500}
.v-warn{color:#92400e;font-weight:500}
.v-err{color:#991b1b;font-weight:500}
.issues{margin-top:8px;padding:8px 10px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px}
.issues ul{list-style:none;padding-left:0}
.issue-error{color:#991b1b;margin:4px 0}
.issue-warning{color:#92400e;margin:4px 0}
.log{background:#1a1a1a;color:#e5e7eb;padding:10px;border-radius:6px;font-family:Menlo,Monaco,'Courier New',monospace;font-size:11px;line-height:1.5;max-height:300px;overflow:auto;white-space:pre-wrap}
.lvl{font-weight:500;margin-right:4px}
.lvl-error{color:#f87171}
.lvl-warn{color:#fbbf24}
.lvl-info{color:#60a5fa}
.lvl-log{color:#9ca3af}
.url{font-family:Menlo,Monaco,monospace;font-size:10px;word-break:break-all;max-width:500px}
.err{background:#1a1a1a;color:#f87171;padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:400px}
/* Lightbox (图片预览，仅 inline-att 缩略图使用) */
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;user-select:none}
.lightbox[hidden]{display:none}
.lightbox-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.lightbox-img{max-width:92vw;max-height:88vh;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,0.5);background:#0a0a0a}
.lightbox-btn{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;border:none;border-radius:50%;background:rgba(255,255,255,0.12);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);transition:background 0.15s}
.lightbox-btn:hover{background:rgba(255,255,255,0.22)}
.lightbox-btn:disabled{opacity:0.3;cursor:not-allowed}
.lightbox-prev{left:24px}
.lightbox-next{right:24px}
.lightbox-close{position:absolute;top:20px;right:20px;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,0.12);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s}
.lightbox-close:hover{background:rgba(255,255,255,0.22)}
.lightbox-caption{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.9);font-size:12px;font-family:Menlo,Monaco,monospace;background:rgba(0,0,0,0.4);padding:6px 12px;border-radius:4px;max-width:80vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lightbox-counter{position:absolute;top:20px;left:20px;color:rgba(255,255,255,0.7);font-size:12px;font-family:Menlo,Monaco,monospace;background:rgba(0,0,0,0.4);padding:6px 10px;border-radius:4px}
.lightbox-single .lightbox-prev,.lightbox-single .lightbox-next,.lightbox-single .lightbox-counter{display:none}
`

// Stage 2 流式：边渲染边落盘，让 51 case 的大 run 可以看到实时进度。
// 之前 split.map 一次跑完 51 case 才进入写盘环节，没有任何中间产出。
// 默认就开 progress 日志 —— 让 `pnpm test:browser:report` 跑起来用户能看到进度，
// 不用再依赖环境变量；卡住时一眼能看出卡在哪个 case 上。
const split = []
for (let i = 0; i < allTests.length; i++) {
  const t = allTests[i]
  process.stdout.write(`[gen ${String(i + 1).padStart(2)}/${allTests.length}] ${(t.fullName ?? t.name ?? t.title ?? '?').slice(0, 60)}\n`)
  const t0 = Date.now()
  const s = renderTestSplit(t, i)
  split.push(s)
  const dt = Date.now() - t0
  if (dt > 100) process.stdout.write(`             ↳ ${s.slug}  ${dt}ms\n`)
}

// Stage 2：把原本一个 button 的 nav 转成 anchor，指向 cases/<slug>.html。
// 同 slug 在多个 nav item 中只取首个（理论上不会重复，但 fullName 兜底可能撞）。
// activeSlug 命中的 anchor 加 active 类，让 case 页打开时左侧高亮当前 case。
//
// pageContext='index' → href = `cases/<slug>.html`
// pageContext='case'  → href = `<slug>.html`（同目录兄弟链接）
function buildNavHtml(pageContext, activeSlug) {
  return split.map(s => {
    const href = pageContext === 'case' ? `${s.slug}.html` : `cases/${s.slug}.html`
    const isActive = activeSlug === s.slug
    // 把 renderTestSplit 输出的 <button class="nav-item ..." data-idx data-status> ... </button>
    // 整体替换 button → a，加 href / 可选 active 类。属性不破坏 data-idx/data-status，
    // 历史 nav 脚本仍能用 data-status 找首个 failed。
    return s.nav
      .replace(/^<button class="(nav-item[^"]*)"/, `<a class="$1${isActive ? ' active' : ''}" href="${href}"`)
      .replace(/<\/button>$/, '</a>')
  }).join('')
}

// 主页 sidebar 的 back 链接：
//   - 主 index.html 在 <runDir>/index.html → ../index.html
//   - 单 case 在 <runDir>/cases/<slug>.html → ../../index.html
function backHrefFor(pageContext) {
  return pageContext === 'case' ? '../../index.html' : '../index.html'
}

// detail-host 内容：case 页放当前 panel（去掉 hidden），index 页放概览
function buildOverviewMain() {
  if (split.length === 0) return '<div class="detail-empty">没有测试数据</div>'
  // 简单概览：列出所有 case 的标题 + 状态，提示用户从左侧 nav 点开
  const items = split.map(s => {
    const cls = s.status === 'passed' ? 'pass' : s.status === 'failed' ? 'fail' : 'skip'
    const icon = s.status === 'passed' ? '✓' : s.status === 'failed' ? '✗' : '?'
    return `<li class="ov-item ov-${cls}"><a href="cases/${s.slug}.html"><span class="ov-icon">${icon}</span><span class="ov-slug">${esc(s.slug)}</span></a></li>`
  }).join('')
  return `<div class="overview">
    <div class="overview-head"><h2>📋 ${split.length} 个测试用例</h2><p class="overview-hint">点左侧 nav 或下方列表查看单个用例详情</p></div>
    <ul class="overview-list">${items}</ul>
  </div>`
}

const overviewStyles = `
.overview{padding:20px 24px;max-width:780px}
.overview-head{margin-bottom:16px}
.overview-head h2{font-size:16px;font-weight:600;margin-bottom:4px}
.overview-hint{font-size:12px;color:#64748b}
.overview-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px}
.ov-item a{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;text-decoration:none;color:#1a1a1a;background:#fff}
.ov-item a:hover{background:#f8fafc;border-color:#cbd5e1}
.ov-item.ov-pass{border-left:3px solid #16a34a}
.ov-item.ov-fail{border-left:3px solid #dc2626}
.ov-item.ov-skip{border-left:3px solid #cbd5e1}
.ov-icon{width:14px;font-weight:700;font-family:Menlo,Monaco,monospace}
.ov-pass .ov-icon{color:#16a34a}
.ov-fail .ov-icon{color:#dc2626}
.ov-slug{font-family:Menlo,Monaco,monospace;font-size:12px}
`

function buildPage({ pageContext, activeSlug, mainHtml }) {
  const navHtml = buildNavHtml(pageContext, activeSlug)
  const back = backHrefFor(pageContext)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Test Report ${fmtTs(runTs)}${activeSlug ? ' — ' + esc(activeSlug) : ''}</title>
<style>${styles}${overviewStyles}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-head">
      <a class="back" href="${back}">← All Runs</a>
      <div class="sidebar-title-row">
        <h1>测试报告</h1>
        <span class="summary ${statusCls}">${statusIcon} ${passed}/${total}${failed ? ` · ${failed} 失败` : ''}</span>
      </div>
      <div class="sidebar-meta-pills">
        <span class="sb-pill sb-pill-date" title="${esc(runTs)}">📅 ${fmtTs(runTs)}</span>
        <span class="sb-pill" title="${total} 个测试">🧪 ${total} tests</span>
        ${domHtmlByTestCase.size ? `<span class="sb-pill" title="${domHtmlByTestCase.size} 份 DOM 快照">🌐 ${domHtmlByTestCase.size}</span>` : ''}
        ${totalCredits > 0 ? `<span class="sb-pill sb-pill-credits" title="SaaS 积分总消耗">💎 ${totalCredits.toFixed(2)}</span>` : ''}
        ${hasTotalTokens ? (() => {
          const bits = []
          if (totalTokens.input > 0) bits.push(`in ${totalTokens.input}`)
          if (totalTokens.output > 0) bits.push(`out ${totalTokens.output}`)
          if (totalTokens.reasoning > 0) bits.push(`reason ${totalTokens.reasoning}`)
          if (totalTokens.cached > 0) bits.push(`cached ${totalTokens.cached}`)
          return `<span class="sb-pill sb-pill-tokens" title="Token 总消耗 — ${bits.join(' · ')}">🔢 ${fmtCompact(totalTokens.total)}</span>`
        })() : ''}
        ${gitCommit ? `<span class="sb-pill sb-pill-git" title="git ${esc(gitBranch)}@${esc(gitCommit)}">🔗 ${esc(gitBranch)}@${esc(gitCommit.slice(0, 7))}</span>` : ''}
        ${runMeta?.batch ? `<span class="sb-pill" title="批次">🏷 ${esc(runMeta.batch)}</span>` : ''}
      </div>
      ${runMeta?.note ? `<div class="sidebar-note" title="本次 run 之前调用方 AI 用 --note 写的改动描述"><span class="sidebar-note-label">📝 本次改动</span><div class="sidebar-note-body">${esc(runMeta.note)}</div></div>` : ''}
    </div>
    <nav class="nav-list" id="nav-list">${navHtml}</nav>
    <section class="tc-history" id="tc-history" hidden>
      <div class="tc-history-head">📜 当前 testCase 历史</div>
      <div class="tc-history-list" id="tc-history-list"></div>
    </section>
  </aside>
  <main class="detail-host" id="detail-host">
    ${mainHtml || '<div class="detail-empty">没有测试数据</div>'}
  </main>
</div>
<div class="lightbox" id="lightbox" hidden>
  <div class="lightbox-stage">
    <div class="lightbox-counter" id="lightbox-counter"></div>
    <button type="button" class="lightbox-close" id="lightbox-close" aria-label="关闭">✕</button>
    <button type="button" class="lightbox-btn lightbox-prev" id="lightbox-prev" aria-label="上一张">‹</button>
    <img class="lightbox-img" id="lightbox-img" alt=""/>
    <button type="button" class="lightbox-btn lightbox-next" id="lightbox-next" aria-label="下一张">›</button>
    <div class="lightbox-caption" id="lightbox-caption"></div>
  </div>
</div>
<div class="md-dialog" id="md-dialog" hidden>
  <div class="md-dialog-box">
    <div class="md-dialog-head">
      <span class="md-dialog-title" id="md-dialog-title">Markdown</span>
      <div class="md-dialog-actions">
        <button type="button" class="md-btn" id="md-dialog-copy" title="复制内容">📋 复制</button>
      </div>
      <button type="button" class="md-dialog-close" id="md-dialog-close" aria-label="关闭">✕</button>
    </div>
    <div class="md-dialog-body"><div class="md-dialog-content md" id="md-dialog-content"></div></div>
    <pre class="md-dialog-pre" id="md-dialog-pre" hidden></pre>
  </div>
</div>
<script>
(function(){
  var items = document.querySelectorAll('.nav-item')
  var panels = document.querySelectorAll('.detail-panel')
  // 同 testCase 历史 nav 区（左侧 sidebar 底部）：select(idx) 时找对应 panel 内的
  // <template class="history-template" data-for-idx>，把内容塞进 #tc-history-list。
  var tcHistoryWrap = document.getElementById('tc-history')
  var tcHistoryList = document.getElementById('tc-history-list')
  function refreshHistory(idx){
    if (!tcHistoryWrap || !tcHistoryList) return
    var tpl = document.querySelector('.history-template[data-for-idx="' + idx + '"]')
    if (tpl && tpl.innerHTML.trim()) {
      tcHistoryList.innerHTML = tpl.innerHTML
      tcHistoryWrap.removeAttribute('hidden')
    } else {
      tcHistoryList.innerHTML = ''
      tcHistoryWrap.setAttribute('hidden', '')
    }
  }
  function select(idx){
    items.forEach(function(el){
      el.classList.toggle('active', el.dataset.idx === String(idx))
    })
    panels.forEach(function(el){
      var match = el.dataset.idx === String(idx)
      if (match) el.removeAttribute('hidden'); else el.setAttribute('hidden', '')
    })
    refreshHistory(idx)
    if (history.replaceState) history.replaceState(null, '', '#' + idx)
  }
  items.forEach(function(el){
    el.addEventListener('click', function(){ select(el.dataset.idx) })
  })
  var initial = 0
  if (location.hash) {
    var h = parseInt(location.hash.slice(1), 10)
    if (!isNaN(h) && h >= 0 && h < items.length) initial = h
  }
  // 优先展开第一个 failed
  if (!location.hash) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].dataset.status === 'failed') { initial = i; break }
    }
  }
  // Stage 2：单 case 页只有 1 个 panel（已默认可见），跳过 select 防止把它意外隐藏。
  // nav 现在是 <a>，点击直接跳转新 case 页，不依赖此处 toggle 逻辑。
  if (items.length && panels.length > 1) select(initial)

  // Lightbox：图片点击预览 + 多张时左右切换
  var lb = document.getElementById('lightbox')
  var lbImg = document.getElementById('lightbox-img')
  var lbCap = document.getElementById('lightbox-caption')
  var lbCounter = document.getElementById('lightbox-counter')
  var lbPrev = document.getElementById('lightbox-prev')
  var lbNext = document.getElementById('lightbox-next')
  var lbClose = document.getElementById('lightbox-close')
  var lbState = { group: [], idx: 0 }
  function lbRender(){
    if (!lbState.group.length) return
    var it = lbState.group[lbState.idx]
    lbImg.src = it.src
    lbImg.alt = it.caption || ''
    lbCap.textContent = it.caption || ''
    lbCounter.textContent = (lbState.idx + 1) + ' / ' + lbState.group.length
    lb.classList.toggle('lightbox-single', lbState.group.length <= 1)
    lbPrev.disabled = lbState.idx === 0
    lbNext.disabled = lbState.idx === lbState.group.length - 1
  }
  function lbOpen(clickedImg){
    var container = clickedImg.closest('[data-lightbox-group]')
    var group = container
      ? Array.prototype.slice.call(container.querySelectorAll('img[data-lightbox]'))
      : [clickedImg]
    if (!group.length) group = [clickedImg]
    lbState.group = group.map(function(im){ return { src: im.src, caption: im.getAttribute('data-caption') || im.alt || '' } })
    lbState.idx = Math.max(0, group.indexOf(clickedImg))
    lb.removeAttribute('hidden')
    document.body.style.overflow = 'hidden'
    lbRender()
  }
  function lbCloseFn(){
    lb.setAttribute('hidden', '')
    document.body.style.overflow = ''
    lbImg.src = ''
  }
  function lbNav(delta){
    if (!lbState.group.length) return
    var next = lbState.idx + delta
    if (next < 0 || next >= lbState.group.length) return
    lbState.idx = next
    lbRender()
  }
  document.addEventListener('click', function(e){
    var t = e.target
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-lightbox')) {
      e.preventDefault()
      lbOpen(t)
    }
  })
  lbPrev.addEventListener('click', function(){ lbNav(-1) })
  lbNext.addEventListener('click', function(){ lbNav(1) })
  lbClose.addEventListener('click', lbCloseFn)
  lb.addEventListener('click', function(e){
    // 点击背景（非控件/图片）时关闭
    if (e.target === lb || e.target.classList.contains('lightbox-stage')) lbCloseFn()
  })
  document.addEventListener('keydown', function(e){
    if (lb.hasAttribute('hidden')) return
    if (e.key === 'Escape') { lbCloseFn(); return }
    if (e.key === 'ArrowLeft') { lbNav(-1); return }
    if (e.key === 'ArrowRight') { lbNav(1); return }
  })

  // DOM 快照 iframe load 完成 → wrap 加 loaded class，spinner 淡出 + iframe 淡入
  // 用 capture 阶段监听整文档，避免每个 iframe 单独绑（节省脚本重复）。
  // 已经在缓存里的 iframe（已完成）直接补一次状态。
  function markIframeLoaded(iframe){
    var wrap = iframe.closest('.dom-snapshot-wrap')
    if (wrap) wrap.classList.add('loaded')
  }
  document.addEventListener('load', function(e){
    var t = e.target
    if (t && t.classList && t.classList.contains('dom-snapshot-frame')) markIframeLoaded(t)
  }, true)
  // 兜底：DOMContentLoaded 时已加载完的 iframe 不会再触发 load 事件
  Array.prototype.forEach.call(document.querySelectorAll('.dom-snapshot-frame'), function(f){
    try {
      // contentDocument.readyState 是最稳的判定，但跨 origin / sandbox 可能 throw
      if (f.contentDocument && f.contentDocument.readyState === 'complete') markIframeLoaded(f)
    } catch { /* ignore */ }
  })

  // 截图按钮 → 找紧邻的 hidden <img data-lightbox>，触发 lightbox 预览
  document.addEventListener('click', function(e){
    var t = e.target
    if (!t || !t.classList || !t.classList.contains('shot-btn')) return
    e.preventDefault()
    // 优先取 button 紧邻的 img；找不到则按文件名匹配同 group 内任一 img
    var img = t.nextElementSibling
    if (!img || img.tagName !== 'IMG') {
      var name = t.dataset.shotName
      var group = t.closest('[data-lightbox-group]')
      if (group && name) {
        var imgs = group.querySelectorAll('img[data-lightbox]')
        for (var i = 0; i < imgs.length; i++) {
          if (imgs[i].getAttribute('data-caption') === name) { img = imgs[i]; break }
        }
      }
    }
    if (img && img.tagName === 'IMG') lbOpen(img)
  })

  // 通用复制按钮：统一行为，支持
  //   data-copy="<literal>"           直接复制属性值（hist 路径 / sessionId）
  //   .net-copy-btn                  复制紧邻 .net-v <pre> 的 textContent
  function copyToClipboard(text, btn){
    var done = function(){
      var orig = btn.textContent
      btn.textContent = '✓'
      btn.classList.add('copied')
      setTimeout(function(){ btn.textContent = orig; btn.classList.remove('copied') }, 1200)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function(){
        var ta = document.createElement('textarea')
        ta.value = text; document.body.appendChild(ta); ta.select()
        try { document.execCommand('copy'); done() } catch {}
        document.body.removeChild(ta)
      })
    } else {
      var ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch {}
      document.body.removeChild(ta)
    }
  }

  document.addEventListener('click', function(e){
    var t = e.target
    if (!t || !t.classList) return
    if (t.classList.contains('hist-copy-btn')) {
      var v = t.dataset.copy
      if (!v) return
      e.preventDefault()
      copyToClipboard(v, t)
      return
    }
    if (t.classList.contains('prompt-copy-btn')) {
      // 隐藏 <script type="text/plain" id="prompt-N"> 里存了完整 prompt 文本，按钮取它的 textContent
      var pid = t.dataset.promptTarget
      var pel = pid ? document.getElementById(pid) : null
      if (!pel) return
      e.preventDefault()
      copyToClipboard(pel.textContent || '', t)
      return
    }
    if (t.classList.contains('net-copy-btn')) {
      // 在 .net-kv 或 .tool-kv 内找 .net-v / .tool-v <pre>，取 textContent
      var kv = t.closest('.net-kv') || t.closest('.tool-kv')
      var pre = kv ? (kv.querySelector('.net-v') || kv.querySelector('.tool-v')) : null
      if (!pre) return
      e.preventDefault()
      copyToClipboard(pre.textContent || '', t)
      return
    }
    if (t.classList.contains('net-row-copy-btn')) {
      // 整条网络请求复制：URL + 请求体 + 响应体（含 error）
      e.preventDefault()
      e.stopPropagation() // 阻止 details 展开/收起
      var item = t.closest('.net-item')
      if (!item) return
      var urlEl = item.querySelector('.net-url')
      var url = urlEl ? (urlEl.getAttribute('title') || urlEl.textContent || '') : ''
      var methodEl = item.querySelector('.net-method')
      var statusEl = item.querySelector('.net-status')
      var method = methodEl ? methodEl.textContent.trim() : ''
      var status = statusEl ? statusEl.textContent.trim() : ''
      var parts = [method + ' ' + url + (status ? ' [' + status + ']' : '')]
      var kvList = item.querySelectorAll('.net-body .net-kv')
      kvList.forEach(function(kv){
        var label = kv.querySelector('.net-k')
        var pre = kv.querySelector('.net-v')
        if (label && pre) {
          parts.push('\\n--- ' + label.textContent.trim() + ' ---\\n' + (pre.textContent || ''))
        }
      })
      copyToClipboard(parts.join('\\n'), t)
      return
    }
  })

  // ── Markdown Dialog（PROMPT.md / PREFACE.md 弹窗预览）──
  // 按钮带 data-md-target=<htmlTplId>、data-md-raw=<rawTplId>、data-md-title=<显示标题>；
  //   - dialog body 用 html template 内容 set innerHTML（marked 渲染后的 markdown）
  //   - copy 按钮用 raw template 取原 md 文本，便于粘贴
  var mdDialog = document.getElementById('md-dialog')
  var mdDialogTitle = document.getElementById('md-dialog-title')
  var mdDialogContent = document.getElementById('md-dialog-content')
  var mdDialogPre = document.getElementById('md-dialog-pre')
  var mdDialogClose = document.getElementById('md-dialog-close')
  var mdDialogCopy = document.getElementById('md-dialog-copy')
  var mdDialogRawCache = ''
  function readTpl(id){
    var tpl = document.getElementById(id)
    if (!tpl) return ''
    return tpl.content ? (tpl.content.textContent || '') : (tpl.textContent || '')
  }
  function openMdDialog(title, html, raw){
    mdDialogTitle.textContent = title
    mdDialogContent.innerHTML = html
    mdDialogPre.textContent = raw || ''
    mdDialogRawCache = raw || ''
    mdDialog.removeAttribute('hidden')
    document.body.style.overflow = 'hidden'
    mdDialogContent.scrollTop = 0
  }
  function closeMdDialog(){
    mdDialog.setAttribute('hidden', '')
    document.body.style.overflow = ''
    mdDialogContent.innerHTML = '' // 释放渲染节点
    mdDialogPre.textContent = ''
    mdDialogRawCache = ''
  }
  document.addEventListener('click', function(e){
    var t = e.target
    if (!t || !t.classList || !t.classList.contains('md-btn')) return
    if (t === mdDialogCopy) return // copy 按钮自有 handler
    var tplId = t.dataset.mdTarget
    if (!tplId) return
    e.preventDefault()
    var html = readTpl(tplId)
    var raw = readTpl(t.dataset.mdRaw || '')
    openMdDialog(t.dataset.mdTitle || tplId, html, raw)
  })
  mdDialogClose.addEventListener('click', closeMdDialog)
  mdDialog.addEventListener('click', function(e){ if (e.target === mdDialog) closeMdDialog() })
  mdDialogCopy.addEventListener('click', function(){
    copyToClipboard(mdDialogRawCache || mdDialogPre.textContent || '', mdDialogCopy)
  })
  document.addEventListener('keydown', function(e){
    if (mdDialog.hasAttribute('hidden')) return
    if (e.key === 'Escape') closeMdDialog()
  })
})()
</script>
</body>
</html>`
}

// ── Stage 2 写盘：每 case 一个 cases/<slug>.html + 主 index.html 退化为概览 ──
// 之前所有 panel 内联在 index.html 里 → 51 case 的 run 生成 10 分钟、HTML 几十 MB。
// 现在每 case 独立成文件，主 index 只剩 nav + overview，大文件分摊到 51 个小文件。
const casesDir = join(runDir, 'cases')
if (!existsSync(casesDir)) mkdirSync(casesDir, { recursive: true })
process.stdout.write(`[write] 写 ${split.length} 个 cases/<slug>.html\n`)
for (let i = 0; i < split.length; i++) {
  const s = split[i]
  // panel 模板里带 hidden 属性（主 index 多 panel 切换用），单 case 页只有自己的
  // panel，需要去掉 hidden 让默认可见。data-idx 保留供 select() 脚本兜底匹配。
  // 同时 panel 里 iframe src="data/..." 和 img src="screenshots/..." 是相对 <runDir>/
  // 的路径，case 页位于 <runDir>/cases/ 下要前缀 ../。dom.html 内部的 shared-styles
  // 引用 ../../shared-styles/ 是相对 dom.html 自身位置，无需改。
  const panelVisible = s.panel
    .replace(/^<section class="detail-panel" data-idx="(\d+)" hidden>/, '<section class="detail-panel" data-idx="$1">')
    .replace(/(\bsrc=")(data\/)/g, '$1../$2')
    .replace(/(\bsrc=")(screenshots\/)/g, '$1../$2')
  const t0 = Date.now()
  const html = buildPage({ pageContext: 'case', activeSlug: s.slug, mainHtml: panelVisible })
  writeFileSync(join(casesDir, `${s.slug}.html`), html, 'utf-8')
  const dt = Date.now() - t0
  if (dt > 200) {
    process.stdout.write(`[write ${String(i + 1).padStart(2)}/${split.length}] ${s.slug}.html  ${(html.length / 1024).toFixed(0)}KB  ${dt}ms\n`)
  }
}
process.stdout.write(`[write] 写主 index.html\n`)
const indexHtml = buildPage({ pageContext: 'index', activeSlug: null, mainHtml: buildOverviewMain() })
writeFileSync(join(runDir, 'index.html'), indexHtml, 'utf-8')

// ── 主页索引：所有 run ──
// computeRunInfo: 提取单个 run 的概览数据（passed/failed/credits/tokens/models/testItems）。
//
// 三级缓存策略（Stage 1 重构）：
//   ① _run-summary.json   ← 整 run 聚合好的小 JSON（~10KB），命中直接返回
//   ② _case-summaries/*   ← 每个 case 的小摘要（~2KB）。saveTestData 落盘时同步写
//   ③ data/*.json         ← 慢路径回退。老 run（无 summary）走这里，再写回 ① ②
//
// run 一旦完成不再变更，所以 _run-summary.json 命中即用，不做 mtime 校验。
// schemaVersion 不匹配时无视 cache 走重算。
function loadRunSummaryCache(ts) {
  const p = join(runsRoot, ts, '_run-summary.json')
  if (!existsSync(p)) return null
  const cached = safeJson(readFileSync(p, 'utf-8'))
  if (!cached || cached.schemaVersion !== SUMMARY_SCHEMA_VERSION) return null
  return cached
}

function readCaseSummariesDir(ts) {
  const dir = join(runsRoot, ts, '_case-summaries')
  if (!existsSync(dir)) return null
  const out = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const s = safeJson(readFileSync(join(dir, f), 'utf-8'))
    if (s && s.testCase && s.schemaVersion === SUMMARY_SCHEMA_VERSION) out.push(s)
  }
  return out.length ? out : null
}

function readSummariesFromDataDir(ts) {
  const dir = join(runsRoot, ts, 'data')
  if (!existsSync(dir)) return []
  const out = []
  // 慢路径：每个 data/*.json 都是 MB 级（含 messages 合并内容），尽量只在老 run 走
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const d = safeJson(readFileSync(join(dir, f), 'utf-8'))
    const s = extractCaseSummary(d)
    if (s) out.push(s)
  }
  return out
}

function computeRunInfo(ts) {
  // ① 整 run cache 命中 → 直接返回
  const cached = loadRunSummaryCache(ts)
  if (cached?.payload) return cached.payload

  const rj = safeJson(
    existsSync(join(runsRoot, ts, 'results.json'))
      ? readFileSync(join(runsRoot, ts, 'results.json'), 'utf-8')
      : '{}',
    {},
  )
  let batch = null
  let modelOverride = null
  const metaPath = join(runsRoot, ts, 'run-meta.json')
  if (existsSync(metaPath)) {
    const meta = safeJson(readFileSync(metaPath, 'utf-8'))
    const b = meta?.batch
    if (typeof b === 'string' && b.trim()) batch = b.trim()
    const mo = meta?.modelOverride
    if (typeof mo === 'string' && mo.trim()) modelOverride = mo.trim()
  }
  const passed = rj.numPassedTests ?? 0
  const failed = rj.numFailedTests ?? 0
  const total = rj.numTotalTests ?? 0

  // ② 优先 _case-summaries/*；③ 回退扫 data/*.json + 写回 _case-summaries
  let summaries = readCaseSummariesDir(ts)
  if (!summaries) {
    summaries = readSummariesFromDataDir(ts)
    // 老 run backfill：把刚算出的 summary 写到 _case-summaries/，下次免扫 data
    if (summaries.length > 0) {
      try {
        const dir = join(runsRoot, ts, '_case-summaries')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        for (const s of summaries) {
          const fn = String(s.testCase).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'
          writeFileSync(join(dir, fn), JSON.stringify(s, null, 2), 'utf-8')
        }
      } catch { /* best-effort */ }
    }
  }

  const probeByTestCase = new Map()
  const probeByPrefix = new Map()
  let totalCredits = 0
  let hasCredits = false
  let totalTokensSum = 0
  let hasTokens = false
  const modelSet = new Set()
  for (const s of summaries) {
    const info = { testCase: s.testCase, description: s.description ?? '', model: s.model ?? null }
    probeByTestCase.set(s.testCase, info)
    const digitOnly = s.testCase.match(/^(\d{3})/)
    if (digitOnly && !probeByPrefix.has(digitOnly[1])) probeByPrefix.set(digitOnly[1], info)
    const namedDigit = s.testCase.match(/^([a-z][a-z0-9-]*?-\d{3})/i)
    if (namedDigit && !probeByPrefix.has(namedDigit[1])) probeByPrefix.set(namedDigit[1], info)
    if (typeof s.credits === 'number' && s.credits > 0) {
      totalCredits += s.credits
      hasCredits = true
    }
    if (typeof s.totalTokens === 'number' && s.totalTokens > 0) {
      totalTokensSum += s.totalTokens
      hasTokens = true
    }
    if (s.model) modelSet.add(s.model)
  }
  const models = [...modelSet].sort()

  function deriveSlugFromFile(filePath) {
    if (!filePath) return null
    const m = filePath.match(/__tests__\/(.+)\.browser\.tsx?$/)
    if (!m) return null
    return m[1].replace(/\//g, '-')
  }

  let totalElapsedMs = null
  const resultsForTime = Array.isArray(rj?.testResults) ? rj.testResults : []
  if (resultsForTime.length) {
    let minStart = Infinity
    let maxEnd = -Infinity
    for (const r of resultsForTime) {
      if (Number.isFinite(r?.startTime) && r.startTime < minStart) minStart = r.startTime
      if (Number.isFinite(r?.endTime) && r.endTime > maxEnd) maxEnd = r.endTime
    }
    if (Number.isFinite(minStart) && Number.isFinite(maxEnd) && maxEnd >= minStart) {
      totalElapsedMs = maxEnd - minStart
    }
  }

  const testItems = []
  for (const file of rj.testResults ?? []) {
    const fileSlug = deriveSlugFromFile(file.name)
    for (const t of file.assertionResults ?? []) {
      const tTitle = t.title ?? t.fullName ?? t.name ?? ''
      const tOk = t.status === 'passed'
      let probe = null
      if (fileSlug && probeByTestCase.has(fileSlug)) {
        probe = probeByTestCase.get(fileSlug)
      }
      if (!probe && fileSlug) {
        const prefixFromFile = fileSlug.match(/^([a-z][a-z0-9-]*?-\d{3})/i)
        if (prefixFromFile) probe = probeByPrefix.get(prefixFromFile[1]) ?? null
      }
      if (!probe) {
        const digitPrefix = tTitle.match(/(\d{3})/)
        if (digitPrefix) probe = probeByPrefix.get(digitPrefix[1]) ?? null
      }
      const caseName = probe?.testCase ?? tTitle
      const description = probe?.description ?? ''
      const model = probe?.model ?? null
      testItems.push({ caseName, title: tTitle, description, model, ok: tOk, status: t.status, hasProbe: !!probe })
    }
  }
  const payload = {
    passed, failed, total,
    testItems, batch,
    totalCredits: hasCredits ? totalCredits : null,
    totalTokens: hasTokens ? totalTokensSum : null,
    totalElapsedMs, models, modelOverride,
  }

  // 整 run cache 写回，供下次主页 rebuild 直接吃
  try {
    writeFileSync(
      join(runsRoot, ts, '_run-summary.json'),
      JSON.stringify({
        schemaVersion: SUMMARY_SCHEMA_VERSION,
        computedAt: new Date().toISOString(),
        payload,
      }, null, 2),
      'utf-8',
    )
  } catch { /* best-effort */ }

  return payload
}

function rebuildHomeIndex() {
  if (!existsSync(runsRoot)) return
  // 主页也过滤空壳目录：没 results.json 的 run 没意义
  const dirs = listRunDirsBySeqDesc({ requireResults: true })

  // 每个 run 的结构化数据（共享给两个 tab）
  const runInfos = dirs.map(ts => {
    const computed = computeRunInfo(ts)
    const hasReport = existsSync(join(runsRoot, ts, 'index.html'))
    const statusCls = computed.failed > 0 ? 'fail' : 'pass'
    const link = hasReport ? `./${ts}/index.html` : '#'
    return { ts, hasReport, statusCls, link, ...computed }
  })

  // ── Tab 1: 按批次分组（无 batch 的归到末尾"未分组"）──
  function renderRunRow(info) {
    const { ts, passed, failed, total, hasReport, statusCls, link, testItems, totalCredits, totalTokens, totalElapsedMs, models, modelOverride } = info
    const testsHtml = testItems.length
      ? testItems.map(t => {
        const cls = t.ok ? 'tn-ok' : t.status === 'failed' ? 'tn-fail' : 'tn-skip'
        const icon = t.ok ? '✓' : t.status === 'failed' ? '✗' : '?'
        const descHtml = t.description
          ? `<span class="tn-desc">— ${esc(t.description)}</span>`
          : ''
        const caseHtml = t.hasProbe
          ? `<code class="tn-case">${esc(t.caseName)}</code>`
          : `<span class="tn-title">${esc(t.caseName)}</span>`
        // 用例级模型 pill：只展示友好名（"Qwen Flash"），每个用例可能不同。
        const modelHtml = t.model
          ? `<span class="tn-model" title="本用例实际运行的模型">🤖 ${esc(t.model)}</span>`
          : ''
        return `<li class="${cls}"><span class="tn-icon">${icon}</span>${caseHtml}${descHtml}${modelHtml}</li>`
      }).join('')
      : '<li class="tn-empty">（无测试数据）</li>'
    const countHtml = failed > 0
      ? `<span class="c-pass">${passed}</span> / <span class="c-fail">${failed} 失败</span>`
      : `<span class="c-pass">${passed}/${total}</span>`
    const extraParts = []
    if (typeof totalCredits === 'number' && totalCredits > 0) {
      extraParts.push(`<span class="c-credits" title="SaaS 积分消耗">💎 ${totalCredits.toFixed(2)}</span>`)
    }
    if (typeof totalTokens === 'number' && totalTokens > 0) {
      extraParts.push(`<span class="c-tokens" title="Token 总消耗">🔢 ${fmtCompact(totalTokens)}</span>`)
    }
    if (typeof totalElapsedMs === 'number' && totalElapsedMs > 0) {
      extraParts.push(`<span class="c-dur" title="总用时（墙钟）">⏱ ${fmtMinSec(totalElapsedMs)}</span>`)
    }
    // 模型展示：
    //   - modelOverride 存在 → run 级橙色 pill 标 override（整轮统一值），title 带测试声明对比
    //   - 无 override → 不渲染 run 级模型 pill，模型信息下放到每个 testItem 的 tn-model
    //     （每个用例模型可能不同，聚合成一个"混合"标签没有实际意义）
    if (modelOverride) {
      const intentNote = models.length > 0 ? `（测试声明：${models.join(', ')}）` : ''
      extraParts.push(`<span class="c-model c-model-override" title="runner --model 覆盖${intentNote}">🤖 ${esc(modelOverride)} [override]</span>`)
    }
    const summary = extraParts.length
      ? `<div class="c-summary-count">${countHtml}</div><div class="c-summary-extra">${extraParts.join(' ')}</div>`
      : countHtml
    return `<tr class="${statusCls}">
      <td><a href="${link}">${fmtTs(ts)}</a></td>
      <td class="c-tests"><ul class="test-name-list">${testsHtml}</ul></td>
      <td class="c-summary">${summary}</td>
      <td>${hasReport ? `<a href="${link}">Open ↗</a>` : '<span class="gray">—</span>'}</td>
    </tr>`
  }

  // 按 batch 分组，同 batch 内保持 seq 降序（runInfos 已排序）。ungrouped 最后。
  const batchOrder = []
  const batchMap = new Map()
  for (const info of runInfos) {
    const key = info.batch ?? '__UNGROUPED__'
    if (!batchMap.has(key)) {
      batchMap.set(key, [])
      batchOrder.push(key)
    }
    batchMap.get(key).push(info)
  }
  // ungrouped 放最后
  batchOrder.sort((a, b) => (a === '__UNGROUPED__') - (b === '__UNGROUPED__'))

  const rowsByRun = batchOrder.map(key => {
    const infos = batchMap.get(key)
    const header = key === '__UNGROUPED__'
      ? (batchMap.size > 1
          ? `<tr class="batch-header batch-ungrouped"><td colspan="4">📄 未分组（${infos.length}）</td></tr>`
          : '')
      : `<tr class="batch-header"><td colspan="4">📦 批次: <strong>${esc(key)}</strong> <span class="batch-count">（${infos.length} runs）</span></td></tr>`
    return header + infos.map(renderRunRow).join('')
  }).join('')

  // ── Tab 2: 按测试案例 ──
  // 用 yaml 文件扫出完整 case 列表（含从未运行的），再合并 runs
  // yaml 已按 suite 分子目录存放，collectAllYamls 递归扫描按 `name` 字段建索引
  const casesIndex = new Map()
  const testCasesDir = join(monoRoot, '.agents/skills/ai-browser-test/test-cases')
  const yamlIndex = collectAllYamls(testCasesDir)
  for (const [key, absPath] of Object.entries(yamlIndex)) {
    let description = ''
    try {
      const y = YAML.parse(readFileSync(absPath, 'utf-8'))
      description = y?.description ?? ''
    } catch { /* ignore parse errors */ }
    casesIndex.set(key, { caseKey: key, description, hasYaml: true, runs: [] })
  }

  // runInfos 已按 seq 降序；runs push 顺序即 "最新在前"
  for (const info of runInfos) {
    for (const item of info.testItems) {
      const key = item.caseName
      let entry = casesIndex.get(key)
      if (!entry) {
        entry = { caseKey: key, description: item.description, hasYaml: false, runs: [] }
        casesIndex.set(key, entry)
      } else if (!entry.description && item.description) {
        entry.description = item.description
      }
      entry.runs.push({
        ts: info.ts,
        link: info.link,
        hasReport: info.hasReport,
        status: item.status,
        ok: item.ok,
      })
    }
  }

  // 排序：先按 suite 分组（按 SUITES 常量顺序），组内按 seq 升序。
  // 无法解析 suite 的 case（理论上不该有）兜底到末尾 __misc__ 分组。
  const caseSeq = (key) => {
    const m = String(key).match(/-(\d+)([a-z]?)/)
    if (!m) return { n: Number.POSITIVE_INFINITY, suffix: '' }
    return { n: Number.parseInt(m[1], 10), suffix: m[2] || '' }
  }
  const groupedCases = new Map()
  for (const entry of casesIndex.values()) {
    const suite = resolveSuite(entry.caseKey) ?? '__misc__'
    if (!groupedCases.has(suite)) groupedCases.set(suite, [])
    groupedCases.get(suite).push(entry)
  }
  for (const [, arr] of groupedCases) {
    arr.sort((a, b) => {
      const sa = caseSeq(a.caseKey)
      const sb = caseSeq(b.caseKey)
      if (sa.n !== sb.n) return sa.n - sb.n
      if (sa.suffix !== sb.suffix) return sa.suffix.localeCompare(sb.suffix)
      return a.caseKey.localeCompare(b.caseKey)
    })
  }
  // suite 的输出顺序：以 SUITES 常量为准（basic → file-read → ... → skill-market）；
  // 未在常量表里的 suite（含 __misc__）按字母序追加到末尾。
  const orderedSuites = [
    ...SUITES.filter(s => groupedCases.has(s)),
    ...[...groupedCases.keys()].filter(s => !SUITES.includes(s)).sort(),
  ]
  const caseEntries = orderedSuites.flatMap(s => groupedCases.get(s) ?? [])

  // suite 表头：展示 suite 名 + 该组案例数 + 汇总（pass / fail 次数）+ 最新通过率
  const suiteHeaderHtml = (suite, entries) => {
    const totalRuns = entries.reduce((a, e) => a + e.runs.length, 0)
    const passRuns = entries.reduce((a, e) => a + e.runs.filter(r => r.ok).length, 0)
    const failRuns = entries.reduce((a, e) => a + e.runs.filter(r => r.status === 'failed').length, 0)
    // 「最新通过率」：仅看每个有运行记录的 case 的最新一次（runs[0]，已按最新在前排序）
    const entriesWithRuns = entries.filter(e => e.runs.length > 0)
    const latestPass = entriesWithRuns.filter(e => e.runs[0].ok).length
    const latestTotal = entriesWithRuns.length
    const latestPct = latestTotal > 0 ? Math.round((latestPass / latestTotal) * 100) : null
    const latestCls = latestPct === null ? 'gray' : latestPct === 100 ? 'c-pass' : latestPct >= 50 ? 'c-warn' : 'c-fail'
    const latestHtml = latestPct === null
      ? ''
      : `<span class="suite-latest ${latestCls}" title="最新一次的通过率：${latestPass}/${latestTotal}">最新 ${latestPct}% (${latestPass}/${latestTotal})</span>`
    const label = suite === '__misc__' ? '未分组' : suite
    const summary = totalRuns === 0
      ? '<span class="gray">暂无运行</span>'
      : failRuns > 0
        ? `<span class="c-pass">${passRuns} pass</span> · <span class="c-fail">${failRuns} fail</span>`
        : `<span class="c-pass">${passRuns} pass</span>`
    return `<tr class="suite-header">
      <td colspan="3"><div class="suite-header-row"><span class="suite-header-left"><strong>${esc(label)}</strong> <span class="suite-count">· ${entries.length} 个案例 · ${summary}</span></span>${latestHtml}</div></td>
    </tr>`
  }

  const rowsByCase = orderedSuites.map(suite => {
    const entries = groupedCases.get(suite) ?? []
    const header = suiteHeaderHtml(suite, entries)
    const rows = entries.map(entry => {
    const totalRuns = entry.runs.length
    const passCount = entry.runs.filter(r => r.ok).length
    const failCount = entry.runs.filter(r => r.status === 'failed').length
    const caseClass = failCount > 0 ? 'fail' : passCount > 0 ? 'pass' : 'neutral'

    const MAX_VISIBLE = 3
    const runLi = (r, extraCls = '') => {
      const cls = r.ok ? 'tn-ok' : r.status === 'failed' ? 'tn-fail' : 'tn-skip'
      const icon = r.ok ? '✓' : r.status === 'failed' ? '✗' : '?'
      const tsLabel = fmtTs(r.ts)
      // 优先跳到 case 详情页（cases/<slug>.html），不存在再退回 run 概览 index.html
      const caseHtmlExists = existsSync(join(runsRoot, r.ts, 'cases', `${entry.caseKey}.html`))
      const targetLink = caseHtmlExists ? `./${r.ts}/cases/${entry.caseKey}.html` : r.link
      const hasLink = caseHtmlExists || r.hasReport
      const linkHtml = hasLink
        ? `<a href="${targetLink}">${esc(tsLabel)}</a>`
        : `<span>${esc(tsLabel)}</span>`
      return `<li class="${cls}${extraCls ? ' ' + extraCls : ''}"><span class="tn-icon">${icon}</span>${linkHtml}</li>`
    }
    let runsHtml
    if (totalRuns === 0) {
      runsHtml = '<li class="tn-empty">（暂无运行记录）</li>'
    } else if (totalRuns <= MAX_VISIBLE) {
      runsHtml = entry.runs.map(r => runLi(r)).join('')
    } else {
      const visible = entry.runs.slice(0, MAX_VISIBLE).map(r => runLi(r)).join('')
      const hiddenLis = entry.runs.slice(MAX_VISIBLE).map(r => runLi(r, 'tn-hidden')).join('')
      const extra = totalRuns - MAX_VISIBLE
      runsHtml = `${visible}${hiddenLis}<li class="tn-more"><button type="button" class="tn-more-btn" data-more="${extra}">… 还有 ${extra} 次</button></li>`
    }

    const summary = totalRuns === 0
      ? '<span class="gray">—</span>'
      : failCount > 0
        ? `<span class="c-pass">${passCount}</span> / <span class="c-fail">${failCount} 失败</span>`
        : `<span class="c-pass">${passCount}/${totalRuns}</span>`

    const descHtml = entry.description
      ? `<div class="case-desc">${esc(entry.description)}</div>`
      : ''
    return `<tr class="${caseClass}">
      <td class="c-case"><code class="tn-case">${esc(entry.caseKey)}</code>${descHtml}</td>
      <td class="c-tests"><ul class="test-name-list">${runsHtml}</ul></td>
      <td class="c-summary">${summary}</td>
    </tr>`
    }).join('')
    return header + rows
  }).join('')

  const caseCount = caseEntries.length
  const caseWithRuns = caseEntries.filter(e => e.runs.length > 0).length

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Browser Test — All Runs</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#1a1a1a;padding:24px;max-width:1920px;margin:0 auto}
h1{font-size:22px;font-weight:600;margin-bottom:6px}
.meta{font-size:13px;color:#666;margin-bottom:16px}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #e5e7eb}
.tab-btn{background:none;border:none;padding:8px 16px;font-size:13px;font-weight:500;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 0.15s,border-color 0.15s}
.tab-btn:hover{color:#1a1a1a}
.tab-btn.active{color:#2563eb;border-bottom-color:#2563eb}
.tab-btn .count{color:#94a3b8;font-weight:400;margin-left:4px}
.tab-btn.active .count{color:#60a5fa}
.tab-panel[hidden]{display:none}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
th,td{padding:10px 14px;text-align:left;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top}
th{background:#f8fafc;color:#475569;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
tr:last-child td{border-bottom:none}
tr.pass{border-left:3px solid #16a34a}
tr.fail{border-left:3px solid #dc2626}
tr.neutral{border-left:3px solid #cbd5e1}
tr.batch-header td{background:linear-gradient(90deg,#fef3c7,#fef9e7);border-left:3px solid #f59e0b;color:#78350f;font-size:12px;padding:8px 14px;border-bottom:1px solid #fde68a}
tr.suite-header td{background:linear-gradient(90deg,#dbeafe,#eff6ff);border-left:3px solid #3b82f6;color:#1e3a8a;font-size:12px;padding:8px 14px;border-bottom:1px solid #bfdbfe;text-transform:uppercase;letter-spacing:0.5px}
tr.suite-header strong{font-weight:600;color:#1e40af;font-family:Menlo,Monaco,monospace;text-transform:none}
tr.suite-header .suite-count{color:#3b82f6;font-weight:400;text-transform:none;letter-spacing:normal}
tr.batch-header strong{font-weight:600;color:#92400e}
tr.batch-header .batch-count{color:#b45309;font-weight:400}
tr.batch-ungrouped td{background:#f8fafc;border-left:3px solid #cbd5e1;color:#64748b;font-size:11px}
.c-summary{font-variant-numeric:tabular-nums;font-weight:500;white-space:nowrap}
.c-summary-count{font-size:13px}
.c-summary-extra{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:8px;margin-top:4px;font-size:11px;font-weight:400;color:#64748b}
.c-summary-extra .c-credits,.c-summary-extra .c-dur,.c-summary-extra .c-model,.c-summary-extra .c-tokens{display:inline-flex;align-items:center;gap:3px;line-height:1.4}
.c-summary-extra .c-tokens{color:#075985;font-variant-numeric:tabular-nums}
.c-summary-extra .c-model{font-family:Menlo,Monaco,monospace;font-size:11px}
.c-summary-extra .c-model-override{color:#b45309;background:#fef3c7;border:1px solid #fde68a;padding:1px 6px;border-radius:3px;font-weight:500}
.c-summary-extra .c-model-mixed{color:#6d28d9;background:#ede9fe;border:1px solid #ddd6fe;padding:1px 6px;border-radius:3px}
.c-pass{color:#16a34a}
.c-fail{color:#dc2626}
.c-warn{color:#d97706}
.suite-header-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}
.suite-latest{font-weight:500;text-transform:none;letter-spacing:normal;font-variant-numeric:tabular-nums;white-space:nowrap}
.c-tests{max-width:900px}
.c-case{min-width:260px}
.case-desc{font-size:12px;color:#64748b;margin-top:4px;line-height:1.4}
.test-name-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:3px;font-size:12px}
.test-name-list li{display:flex;gap:8px;align-items:center;line-height:1.4;flex-wrap:wrap}
.test-name-list .tn-icon{font-weight:700;width:12px;flex-shrink:0;font-family:Menlo,Monaco,monospace}
.test-name-list .tn-ok .tn-icon{color:#16a34a}
.test-name-list .tn-fail{color:#991b1b}
.test-name-list .tn-fail .tn-icon{color:#dc2626}
.test-name-list .tn-skip{color:#9ca3af}
.test-name-list .tn-empty{color:#9ca3af;font-style:italic}
.test-name-list .tn-case{font-family:Menlo,Monaco,monospace;font-size:11.5px;color:#334155;background:#f1f5f9;padding:1px 7px;border-radius:3px;border:1px solid #e2e8f0}
.test-name-list .tn-fail .tn-case{background:#fef2f2;color:#991b1b;border-color:#fecaca}
.test-name-list .tn-title{color:#475569}
.test-name-list .tn-desc{color:#64748b;font-size:11.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.test-name-list .tn-fail .tn-desc{color:#991b1b}
.test-name-list .tn-model{color:#3730a3;background:#e0e7ff;font-size:11px;padding:1px 7px;border-radius:3px;font-family:Menlo,Monaco,monospace;white-space:nowrap;flex-shrink:0;margin-left:auto}
.test-name-list .tn-hidden{display:none}
.test-name-list.expanded .tn-hidden{display:flex}
.test-name-list .tn-more{margin-top:2px}
.tn-more-btn{background:none;border:none;padding:0;font-size:11.5px;color:#64748b;cursor:pointer;font-family:inherit}
.tn-more-btn:hover{color:#2563eb;text-decoration:underline}
.gray{color:#9ca3af}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>Browser Test — All Runs</h1>
<div class="meta">${dirs.length} run(s)，${caseCount} 个测试案例（${caseWithRuns} 有运行记录）。点任一行打开对应 run 详情。</div>
<div class="tabs">
  <button class="tab-btn active" data-tab="by-run">按时间<span class="count">${dirs.length}</span></button>
  <button class="tab-btn" data-tab="by-case">按测试案例<span class="count">${caseCount}</span></button>
</div>
<section class="tab-panel" data-panel="by-run">
  <table>
    <thead><tr><th>Run</th><th>测试列表</th><th>结果</th><th></th></tr></thead>
    <tbody>${rowsByRun}</tbody>
  </table>
</section>
<section class="tab-panel" data-panel="by-case" hidden>
  <table>
    <thead><tr><th>测试案例</th><th>历次运行（最新在前）</th><th>结果</th></tr></thead>
    <tbody>${rowsByCase}</tbody>
  </table>
</section>
<script>
(function(){
  var btns = document.querySelectorAll('.tab-btn')
  var panels = document.querySelectorAll('.tab-panel')
  btns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var t = btn.dataset.tab
      btns.forEach(function(b){ b.classList.toggle('active', b === btn) })
      panels.forEach(function(p){
        if (p.dataset.panel === t) p.removeAttribute('hidden')
        else p.setAttribute('hidden', '')
      })
      try { history.replaceState(null, '', '#' + t) } catch {}
    })
  })
  // 支持 URL hash 直达
  var hash = (location.hash || '').replace(/^#/, '')
  if (hash === 'by-case' || hash === 'by-run') {
    var target = document.querySelector('.tab-btn[data-tab="' + hash + '"]')
    if (target) target.click()
  }
  // 展开/收起剩余运行记录
  document.addEventListener('click', function(e){
    var t = e.target
    if (!t || !t.classList || !t.classList.contains('tn-more-btn')) return
    var ul = t.closest('.test-name-list')
    if (!ul) return
    var expanded = ul.classList.toggle('expanded')
    var extra = t.dataset.more || ''
    t.textContent = expanded ? '收起' : '… 还有 ' + extra + ' 次'
  })
})()
</script>
</body>
</html>`
  writeFileSync(join(runsRoot, 'index.html'), indexHtml, 'utf-8')
}

rebuildHomeIndex()

const runReportPath = join(runDir, 'index.html')
const homeIndexPath = join(runsRoot, 'index.html')

console.log(`\n  Run report:  ${runReportPath}`)
console.log(`  All runs:    ${homeIndexPath}`)
