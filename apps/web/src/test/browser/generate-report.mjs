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
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import YAML from 'yaml'
import { SUITES, resolveSuite, collectAllYamls } from './test-case-paths.mjs'

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

// ── 读数据 ──
const resultsJsonPath = join(runDir, 'results.json')
const vitestData = existsSync(resultsJsonPath)
  ? safeJson(readFileSync(resultsJsonPath, 'utf-8'), {})
  : {}

const dataDir = join(runDir, 'data')
const probeByTestCase = new Map()
if (existsSync(dataDir)) {
  for (const f of readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
    const d = safeJson(readFileSync(join(dataDir, f), 'utf-8'))
    if (d?.testCase) probeByTestCase.set(d.testCase, d)
  }
}

const screenshotsDir = join(runDir, 'screenshots')
const screenshotsByPrefix = new Map()
if (existsSync(screenshotsDir)) {
  // 按 mtime 升序（时间顺序）插入 Map，后续 computeShotsByIdx 分组遍历会继承此顺序。
  // 文件名前缀（如 "038-before-approval" / "038-after-approval"）字母序跟时间序常常相反，
  // 按时间排更符合"先发生在前"的阅读直觉。
  const entries = readdirSync(screenshotsDir)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ f, mtimeMs: statSync(join(screenshotsDir, f)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
  for (const { f } of entries) {
    const buf = readFileSync(join(screenshotsDir, f))
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
    screenshotsByPrefix.set(f.replace(/\.png$/, ''), { name: f, dataUrl })
  }
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

// runs.jsonl 当前 run 的行
const runRecordByTestCase = new Map()
if (existsSync(runsJsonl)) {
  for (const line of readFileSync(runsJsonl, 'utf-8').split('\n').filter(Boolean)) {
    const r = safeJson(line)
    if (r?.testCase && typeof r.screenshotsDir === 'string' && r.screenshotsDir.includes(runTs)) {
      runRecordByTestCase.set(r.testCase, r)
    }
  }
}

// test-cases/*.yaml 档案索引 —— 失败用例往往 data/*.json 没写入，
// purpose/description 要从这里 fallback 出来，避免报告显示空。
// 建两层索引：完整 slug（如 `038-reject-approval-response`）+ 3 位数前缀（`038`）。
const testCasesDir = join(monoRoot, '.agents/skills/ai-browser-test/test-cases')
const testCaseBySlug = new Map()
const testCaseByPrefix = new Map()
if (existsSync(testCasesDir)) {
  for (const f of readdirSync(testCasesDir).filter(f => f.endsWith('.yaml'))) {
    try {
      const doc = YAML.parse(readFileSync(join(testCasesDir, f), 'utf-8'))
      if (!doc || typeof doc !== 'object') continue
      const slug = f.replace(/\.yaml$/, '')
      testCaseBySlug.set(slug, doc)
      const pm = slug.match(/^(\d{3})/)
      if (pm && !testCaseByPrefix.has(pm[1])) testCaseByPrefix.set(pm[1], doc)
    } catch { /* skip malformed yaml */ }
  }
}

/** 按 probeKey（完整 slug）或测试名前缀查 yaml 档案，给 purpose/description 做兜底。 */
function findTestCaseYaml(probeKey, testName, fullName) {
  if (probeKey && testCaseBySlug.has(probeKey)) return testCaseBySlug.get(probeKey)
  // 按 `NNN` 前缀兜底（单数字段前缀下 test-cases 目录里通常唯一）
  const prefix = extractTestCasePrefix(testName ?? fullName)
  if (prefix && testCaseByPrefix.has(prefix)) return testCaseByPrefix.get(prefix)
  return null
}

// ── 辅助 ──
function safeJson(s, fallback = null) { try { return JSON.parse(s) } catch { return fallback } }
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
function extractTestCasePrefix(fullName) {
  const m = fullName?.match(/(\d{3}[\w-]*)/)
  return m ? m[1] : null
}
function findProbe(fullName, itName) {
  // 优先匹配 testCase 完整 slug（含 probeByTestCase 里的 key）
  for (const [key, val] of probeByTestCase) {
    if ((fullName && fullName.includes(key)) || (itName && itName.includes(key))) return { key, val }
  }
  const prefix = extractTestCasePrefix(itName ?? fullName)
  if (prefix) {
    for (const [key, val] of probeByTestCase) {
      if (key.startsWith(prefix)) return { key, val }
    }
  }
  return null
}
function extractTokens(s) {
  return String(s ?? '').toLowerCase()
    .split(/[\s\-—·_/,.;:()（）"'`’]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2)
}
function tokenMatch(testName, stem) {
  const testTokens = new Set(extractTokens(testName))
  if (!testTokens.size) return false
  return extractTokens(stem).some(t => testTokens.has(t))
}
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
function extractAttachmentsFromOutput(output) {
  let obj = output
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return [] }
  }
  if (!obj || typeof obj !== 'object') return []
  const out = []
  const push = (raw) => {
    if (!raw) return
    if (typeof raw === 'string') {
      const kind = mediaKind(raw)
      if (kind) out.push({ url: raw, name: raw.split('/').pop() ?? raw, kind })
      return
    }
    if (typeof raw !== 'object') return
    const url = raw.sourceUrl ?? raw.url ?? raw.absolutePath ?? raw.filePath ?? ''
    const name = raw.fileName ?? raw.name ?? (typeof url === 'string' ? url.split('/').pop() : '') ?? 'file'
    const kind = mediaKind(url) ?? mediaKind(name)
    out.push({
      url: String(url),
      name: String(name),
      kind,
      absolutePath: raw.absolutePath ?? null,
      sourceUrl: raw.sourceUrl ?? null,
      fileSize: typeof raw.fileSize === 'number' ? raw.fileSize : null,
    })
  }
  if (Array.isArray(obj.files)) obj.files.forEach(push)
  if (Array.isArray(obj.attachments)) obj.attachments.forEach(push)
  if (obj.audioFile) push(obj.audioFile)
  if (obj.videoFile) push(obj.videoFile)
  if (obj.url && !obj.files && !obj.attachments) push(obj)
  return out
}

function renderAttachment(att) {
  const kind = att.kind
  // 优先用 sourceUrl（云端 CDN），次选本地 absolutePath 内嵌
  const remote = att.sourceUrl && /^https?:\/\//.test(att.sourceUrl) ? att.sourceUrl : null
  let src = remote ?? (att.url && /^https?:\/\//.test(att.url) ? att.url : null)
  if (!src && att.absolutePath) src = readLocalAsDataUrl(att.absolutePath)
  if (!src && att.url && !att.url.startsWith('http')) src = readLocalAsDataUrl(att.url)

  const sizeLbl = att.fileSize ? ` · ${Math.round(att.fileSize / 1024)}KB` : ''
  const nameLabel = `<span class="att-name">${esc(att.name)}${sizeLbl}</span>`

  if (!src) {
    return `<div class="att att-link">📎 ${nameLabel}<code class="att-path">${esc(att.url || att.absolutePath || '')}</code></div>`
  }
  if (kind === 'image') {
    return `<figure class="att att-img"><img src="${esc(src)}" data-lightbox data-caption="${esc(att.name)}"/><figcaption>${nameLabel}</figcaption></figure>`
  }
  if (kind === 'audio') {
    return `<div class="att att-audio">🔊 ${nameLabel}<audio controls preload="none" src="${esc(src)}"></audio></div>`
  }
  if (kind === 'video') {
    return `<div class="att att-video">🎬 ${nameLabel}<video controls preload="none" src="${esc(src)}"></video></div>`
  }
  return `<div class="att att-link">📎 ${nameLabel}<a href="${esc(src)}" target="_blank">打开</a></div>`
}

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

/** 对纯文本 escape，但保留 <system-tag attachment/> 为 inline 缩略图。 */
function escWithAttachments(text) {
  if (!text) return ''
  const out = []
  let lastIdx = 0
  ATTACHMENT_TAG_RE.lastIndex = 0
  let m
  while ((m = ATTACHMENT_TAG_RE.exec(text)) !== null) {
    out.push(esc(text.slice(lastIdx, m.index)))
    out.push(renderInlineAttachment(m[1]))
    lastIdx = m.index + m[0].length
  }
  out.push(esc(text.slice(lastIdx)))
  return out.join('')
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

function truncateJson(obj, max = 2000) {
  let s
  try { s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) } catch { s = String(obj) }
  if (s.length <= max) return s
  return s.slice(0, max) + `\n…（截断，剩余 ${s.length - max} 字节）`
}

function toolStateBadge(state) {
  if (!state) return ''
  const cls = state === 'output-available' ? 'b-ok'
    : state === 'output-error' ? 'b-err'
    : state.includes('approval') ? 'b-warn'
    : ''
  return `<span class="b ${cls}">${esc(state)}</span>`
}

/** 渲染单条 part。附件在 tool output 渲染块内内嵌。 */
function renderPart(part) {
  const type = part?.type ?? ''
  if (type === 'step-start') return ''
  if (type === 'text') {
    const text = part?.text ?? ''
    if (!text.trim()) return ''
    return `<div class="tl-text">${escWithAttachments(text)}</div>`
  }
  if (type === 'reasoning') {
    const text = part?.text ?? ''
    if (!text) return ''
    return `<details class="tl-reasoning"><summary>💭 思考 · ${text.length} 字</summary><div class="tl-reasoning-body">${esc(text)}</div></details>`
  }
  if (type === 'source-url' || type === 'source') {
    const url = part?.url ?? part?.source?.url ?? ''
    const title = part?.title ?? part?.source?.title ?? url
    return `<div class="tl-source">🔗 <a href="${esc(url)}" target="_blank">${esc(title)}</a></div>`
  }
  if (type.startsWith('tool-')) {
    const name = type.slice(5)
    const state = part?.state ?? ''
    const input = part?.input
    const output = part?.output
    const errorText = part?.errorText ?? ''
    const attachments = extractAttachmentsFromOutput(output)
    const hasErr = state === 'output-error' || !!errorText
    const stateHtml = toolStateBadge(state)
    const attHtml = attachments.length
      ? `<div class="tl-atts">${attachments.map(renderAttachment).join('')}</div>`
      : ''
    const inputHtml = input != null
      ? `<details class="tl-io"><summary>input</summary><pre>${esc(truncateJson(input))}</pre></details>`
      : ''
    const outputHtml = output != null
      ? `<details class="tl-io"${attachments.length ? '' : ' open'}><summary>output</summary><pre>${esc(truncateJson(output, 3000))}</pre></details>`
      : ''
    const errHtml = errorText
      ? `<div class="tl-tool-err">❌ ${esc(errorText)}</div>`
      : ''
    return `<div class="tl-tool ${hasErr ? 'tl-tool-err-state' : ''}">
      <div class="tl-tool-head"><span class="tl-tool-name">🔧 ${esc(name)}</span>${stateHtml}</div>
      ${errHtml}${inputHtml}${outputHtml}${attHtml}
    </div>`
  }
  // file 附件（模型原生多模态）
  if (type === 'file') {
    const mt = part?.mediaType ?? part?.mimeType ?? ''
    const url = part?.url ?? ''
    const name = part?.filename ?? url.split('/').pop() ?? 'file'
    const att = {
      url, name,
      kind: mt.startsWith('image/') ? 'image' : mt.startsWith('audio/') ? 'audio' : mt.startsWith('video/') ? 'video' : null,
      sourceUrl: url.startsWith('http') ? url : null,
      absolutePath: !url.startsWith('http') && !url.startsWith('data:') ? url : null,
    }
    return `<div class="tl-file">📎 file part · ${esc(mt)}${renderAttachment(att)}</div>`
  }
  // fallback：未知 part 类型，展示一下 JSON
  return `<details class="tl-unknown"><summary>part · ${esc(type)}</summary><pre>${esc(truncateJson(part, 1000))}</pre></details>`
}

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

function renderMessageCostBadges(cost) {
  if (!cost) return ''
  const parts = []
  if (cost.credits != null && cost.credits > 0) {
    parts.push(`<span class="tl-cost tl-cost-credits" title="SaaS 积分消耗">💎 ${cost.credits.toFixed(2)}</span>`)
  }
  if (cost.totalTokens != null && cost.totalTokens > 0) {
    const tipParts = []
    if (cost.inputTokens != null) tipParts.push(`in ${cost.inputTokens}`)
    if (cost.outputTokens != null) tipParts.push(`out ${cost.outputTokens}`)
    if (cost.reasoningTokens != null && cost.reasoningTokens > 0) tipParts.push(`reason ${cost.reasoningTokens}`)
    if (cost.cachedInputTokens != null && cost.cachedInputTokens > 0) tipParts.push(`cached ${cost.cachedInputTokens}`)
    const tip = `total ${cost.totalTokens}${tipParts.length ? ` · ${tipParts.join(' · ')}` : ''}`
    parts.push(`<span class="tl-cost tl-cost-tokens" title="${esc(tip)}">🔢 ${cost.totalTokens} tk</span>`)
  } else if (cost.outputTokens != null || cost.inputTokens != null) {
    const parts2 = []
    if (cost.inputTokens != null) parts2.push(`in ${cost.inputTokens}`)
    if (cost.outputTokens != null) parts2.push(`out ${cost.outputTokens}`)
    parts.push(`<span class="tl-cost tl-cost-tokens">🔢 ${parts2.join('/')}</span>`)
  }
  if (cost.elapsedMs != null && cost.elapsedMs > 0) {
    parts.push(`<span class="tl-cost tl-cost-dur" title="assistantElapsedMs">⏱ ${fmtMs(cost.elapsedMs)}</span>`)
  }
  return parts.join('')
}

function renderMessageTimeline(messages) {
  if (!Array.isArray(messages) || !messages.length) return ''
  const items = []
  let turn = -1
  for (let idx = 0; idx < messages.length; idx++) {
    const msg = messages[idx]
    const role = msg?.role ?? 'unknown'
    if (role === 'user') turn += 1
    const icon = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : role === 'system' ? '⚙️' : '•'
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    const partsHtml = parts.map(renderPart).filter(Boolean).join('')
    if (!partsHtml) continue
    const costBadges = role === 'assistant' ? renderMessageCostBadges(extractMessageCost(msg)) : ''
    items.push(`<section class="tl-msg tl-role-${esc(role)}">
      <header class="tl-msg-head">
        <span class="tl-msg-icon">${icon}</span>
        <span class="tl-msg-role">${esc(role)}</span>
        ${turn >= 0 ? `<span class="tl-msg-turn">turn ${turn}</span>` : ''}
        <span class="tl-msg-idx">#${idx}</span>
        ${costBadges ? `<span class="tl-costs">${costBadges}</span>` : ''}
      </header>
      <div class="tl-msg-body">${partsHtml}</div>
    </section>`)
  }
  if (!items.length) return ''
  return `<details open class="sec"><summary>📜 消息时间线（${messages.length} 条消息）</summary><div class="sec-body"><div class="timeline">${items.join('')}</div></div></details>`
}

// ── 渲染单用例：拆成 sidebar nav + detail panel（中内容 + 右截图） ──
function renderTestSplit(test, idx, shotsByIdx) {
  const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '?'
  const cls = test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip'
  const dur = test.duration != null ? fmtMs(test.duration) : ''
  const fullName = test.fullName ?? test.name ?? ''
  const shortName = test.name ?? fullName

  const probeMatch = findProbe(fullName, test.name)
  const probeKey = probeMatch?.key
  const probe = probeMatch?.val
  const run = probeKey ? runRecordByTestCase.get(probeKey) : null
  const evals = probeKey ? evalsByTestCase.get(probeKey) : null
  // 新格式 review.json 直接带 aggregate；老格式降级用 aggregateScore 合成
  const agg = (probeKey ? aggByTestCase.get(probeKey) : null) ?? aggregateScore(evals)

  const pngs = shotsByIdx.get(idx) ?? []

  const toolCallDetails = probe?.result?.toolCallDetails ?? run?.toolCallDetails ?? []
  const textPreview = probe?.result?.textPreview ?? run?.textPreview ?? ''
  const consoleLogs = probe?.result?.consoleLogs ?? []
  const networkRequests = probe?.result?.networkRequests ?? []
  const historyPath = run?.historyPath
  const sessionId = probe?.result?.sessionId ?? run?.sessionId

  // ── 成本聚合（credits + tokens）──
  // 优先级：runs.jsonl 记录的 creditsConsumed → ProbeResult.creditsConsumed → 从 messages.metadata 兜底累加。
  // tokens 目前没有 runner 级别字段，统一从 messages.metadata.totalUsage 累加。
  const probeMessages = Array.isArray(probe?.result?.messages) ? probe.result.messages : []
  let credits = run?.creditsConsumed ?? probe?.result?.creditsConsumed
  let tokenTotals = { input: 0, output: 0, total: 0, reasoning: 0, cached: 0, any: false }
  let creditsFromMessages = 0
  for (const m of probeMessages) {
    if (m?.role !== 'assistant') continue
    const cost = extractMessageCost(m)
    if (!cost) continue
    if (cost.credits != null && cost.credits > 0) creditsFromMessages += cost.credits
    if (cost.inputTokens != null) { tokenTotals.input += cost.inputTokens; tokenTotals.any = true }
    if (cost.outputTokens != null) { tokenTotals.output += cost.outputTokens; tokenTotals.any = true }
    if (cost.totalTokens != null) { tokenTotals.total += cost.totalTokens; tokenTotals.any = true }
    if (cost.reasoningTokens != null) tokenTotals.reasoning += cost.reasoningTokens
    if (cost.cachedInputTokens != null) tokenTotals.cached += cost.cachedInputTokens
  }
  if ((typeof credits !== 'number' || credits === 0) && creditsFromMessages > 0) {
    credits = creditsFromMessages
  }

  // ── 工具指标 ──
  const totalCalls = toolCallDetails.length
  const failedCalls = toolCallDetails.filter(t => t.hasError).length
  const successRate = totalCalls ? Math.round(((totalCalls - failedCalls) / totalCalls) * 100) : null
  const hasCredits = typeof credits === 'number' && credits > 0
  const hasTokens = tokenTotals.any && (tokenTotals.total > 0 || tokenTotals.input > 0 || tokenTotals.output > 0)

  // ── sidebar nav item ──
  const navAggCls = agg
    ? (agg.verdict === 'PASS' ? 'nav-agg-ok' : agg.verdict === 'PARTIAL' ? 'nav-agg-warn' : 'nav-agg-err')
    : ''
  const navAgg = agg ? `<span class="nav-agg ${navAggCls}">${esc(agg.verdict)}${agg.score != null ? ` ${agg.score}` : ''}</span>` : ''
  const navSubParts = []
  if (dur) navSubParts.push(`⏱ ${esc(dur)}`)
  if (hasCredits) navSubParts.push(`💎 ${credits.toFixed(2)}`)
  if (totalCalls) navSubParts.push(`🔧 ${totalCalls - failedCalls}/${totalCalls}${failedCalls ? ` <span class="nav-fail-mark">✗${failedCalls}</span>` : ''}`)
  if (pngs.length) navSubParts.push(`📸 ${pngs.length}`)
  const nav = `<button class="nav-item nav-${cls}" data-idx="${idx}" data-status="${esc(test.status)}">
    <span class="nav-icon">${icon}</span>
    <span class="nav-text">
      <span class="nav-name">${esc(shortName)}</span>
      <span class="nav-sub">${navSubParts.join(' · ')}</span>
    </span>
    ${navAgg}
  </button>`

  // ── 中间详情 content badges（避免跟 header 重复，只保留评审） ──
  let badges = ''
  if (agg) {
    const aggCls = agg.verdict === 'PASS' ? 'b-ok' : agg.verdict === 'PARTIAL' ? 'b-warn' : 'b-err'
    badges += `<span class="b ${aggCls}">评审 ${agg.verdict} ${agg.score ?? ''}</span>`
  }

  let body = ''

  // 测试目的 —— 从 yaml 的 purpose block scalar 读，既给 evaluator 也给人看。
  // 失败用例 probe/run 常缺失，fallback 到 test-cases/<slug>.yaml（含失败也一定能显示目的）。
  const yamlDoc = findTestCaseYaml(probeKey, test.name, fullName)
  const purpose = probe?.purpose ?? run?.purpose ?? yamlDoc?.purpose
  const specDescription = probe?.specDescription ?? run?.specDescription ?? probe?.description ?? yamlDoc?.description
  if (purpose || specDescription) {
    const specPart = specDescription ? `<div class="spec-desc">${esc(specDescription)}</div>` : ''
    const purposePart = purpose ? `<div class="spec-purpose md">${markdownWithAttachments(purpose)}</div>` : ''
    body += `<details open class="sec sec-spec"><summary>🎯 测试目的</summary><div class="sec-body">${specPart}${purposePart}</div></details>`
  }

  // 失败信息放最上
  if (test.status === 'failed' && test.failureMessages?.length) {
    body += `<details open class="sec"><summary>❌ 失败信息</summary><div class="sec-body"><pre class="err">${esc(test.failureMessages.join('\n'))}</pre></div></details>`
  }

  // AI 裁判（aiJudge）打分 —— 紧跟失败信息，便于看清"为什么不通过"。
  // 来源：probe-helpers.ts 的 aiJudge() 把每次判决追加到 data/<testCase>.json#aiJudges。
  const aiJudges = Array.isArray(probe?.aiJudges) ? probe.aiJudges : []
  if (aiJudges.length) {
    const hasFail = aiJudges.some(j => j && j.pass === false)
    const summaryOpen = hasFail ? ' open' : ''
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
      judgeBody += `<div class="judge-card judge-${pass ? 'pass' : 'fail'}">`
      judgeBody += `<div class="judge-head">`
      judgeBody += `<span class="judge-idx">#${i + 1}</span>`
      judgeBody += `<span class="judge-verdict ${passCls}">${passLabel}</span>`
      if (score != null) judgeBody += `<span class="judge-score ${scoreCls}">score ${score}</span>`
      if (toolCalls.length) judgeBody += `<span class="judge-tools">工具：${esc(toolCalls.join(', '))}</span>`
      judgeBody += `</div>`
      if (criteria) judgeBody += `<div class="judge-kv"><span class="judge-k">🎯 评判标准</span><div class="judge-v">${esc(criteria)}</div></div>`
      if (reason) judgeBody += `<div class="judge-kv"><span class="judge-k">💡 裁判理由</span><div class="judge-v judge-reason">${esc(reason)}</div></div>`
      if (aiResp) judgeBody += `<div class="judge-kv"><span class="judge-k">📝 AI 回复</span><pre class="judge-resp">${esc(aiResp.length > 1500 ? aiResp.slice(0, 1500) + '…' : aiResp)}</pre></div>`
      judgeBody += `</div>`
    }
    const passCount = aiJudges.filter(j => j && j.pass === true).length
    const countLabel = `${passCount}/${aiJudges.length}`
    body += `<details${summaryOpen} class="sec sec-judge"><summary>⚖️ AI 裁判（${countLabel} 通过）</summary><div class="sec-body">${judgeBody}</div></details>`
  }

  // 评审不再放主 body —— 搬到右侧 aside 下半区（evalsAsideHtml，见下）

  // 💬 Prompt / 回复摘要放在消息时间线之前，让用户先看到输入输出总览。
  // prompt 同样 fallback 到 yaml（失败用例 probe.prompt 往往缺失）。
  const promptFallback = probe?.prompt ?? yamlDoc?.prompt ?? ''
  if (promptFallback || textPreview) {
    const promptRaw = promptFallback
    const promptShown = promptRaw.slice(0, 600)
    const promptHtml = escWithAttachments(promptShown) + (promptRaw.length > 600 ? '…' : '')
    const replyShown = textPreview.slice(0, 600)
    body += `<details open class="sec"><summary>💬 Prompt / 回复摘要</summary><div class="sec-body">`
    if (promptRaw) body += `<div class="kv"><span class="k">Prompt:</span><div class="kv-val prompt-val">${promptHtml}</div></div>`
    if (textPreview) body += `<div class="kv"><span class="k">AI 回复（前 600 字）:</span><pre class="reply-val">${esc(replyShown)}${textPreview.length > 600 ? '…' : ''}</pre></div>`
    body += `</div></details>`
  }

  const messages = probe?.result?.messages
  body += renderMessageTimeline(messages)

  if (toolCallDetails.length) {
    body += `<details class="sec"><summary>🔧 工具调用明细（${toolCallDetails.length}）</summary><div class="sec-body">`
    body += `<table class="tool-table"><tr><th>工具</th><th>轮次</th><th>状态</th><th>错误摘要</th></tr>`
    for (const t of toolCallDetails) {
      const cc = t.hasError ? 'v-err' : 'v-ok'
      body += `<tr><td>${esc(t.name)}</td><td>${esc(t.turnIndex ?? '')}</td><td class="${cc}">${t.hasError ? 'ERROR' : 'ok'}</td><td>${esc(t.errorSummary ?? '')}</td></tr>`
    }
    body += `</table></div></details>`
  }

  if (consoleLogs.length) {
    body += `<details class="sec"><summary>🖥 浏览器 Console（${consoleLogs.length}）</summary><div class="sec-body"><pre class="log">`
    for (const c of consoleLogs.slice(0, 100)) {
      body += `<span class="lvl lvl-${c.level}">[${c.level}]</span> +${c.ts}ms ${esc(c.text.slice(0, 200))}\n`
    }
    body += `</pre></div></details>`
  }

  if (networkRequests.length) {
    body += `<details class="sec"><summary>🌐 网络请求（${networkRequests.length}）</summary><div class="sec-body"><table class="net-table"><tr><th>method</th><th>url</th><th>status</th><th>ms</th></tr>`
    for (const n of networkRequests.slice(0, 50)) {
      const ok = n.ok ? 'v-ok' : 'v-err'
      body += `<tr><td>${esc(n.method)}</td><td class="url">${esc(n.url)}</td><td class="${ok}">${esc(n.status ?? 'ERR')}</td><td>${esc(n.durationMs ?? '')}</td></tr>`
    }
    body += `</table></div></details>`
  }

  // ── 右侧 aside：上半截图，下半评审 ──
  const shotsHtml = pngs.length
    ? pngs.map(s => `<figure class="shot-item"><img src="${s.dataUrl}" data-lightbox data-caption="${esc(s.name)}"/><figcaption class="shot-name">${esc(s.name)}</figcaption></figure>`).join('')
    : '<div class="shot-empty">没有截图</div>'

  // 评审区 ── 无评审时给 CTA 提示，有则每个 critic 一张卡（verdict badge + score + summary + pros/cons 折叠）
  let evalsAsideInner = ''
  let evalsCountLabel = '未评审'
  if (evals?.length) {
    evalsCountLabel = `${evals.length} 维`
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
      evalsAsideInner += `<details class="eval-card"${d.verdict === 'FAIL' ? ' open' : ''}>
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
      evalsAsideInner += `<div class="eval-allcons"><div class="eval-allcons-h">⚠ 问题汇总</div><ul>`
      for (const c of allCons.slice(0, 10)) {
        evalsAsideInner += `<li class="issue-${c.level}"><em>${esc(c.critic)}</em> · ${esc(c.text)}</li>`
      }
      evalsAsideInner += `</ul></div>`
    }
    if (agg) {
      const aggCls = agg.verdict === 'PASS' ? 'v-ok' : agg.verdict === 'PARTIAL' ? 'v-warn' : 'v-err'
      evalsAsideInner = `<div class="eval-agg"><span class="eval-agg-label">聚合</span><span class="eval-verdict ${aggCls}">${esc(agg.verdict)}</span>${agg.score != null ? `<span class="eval-score">${agg.score}</span>` : ''}</div>` + evalsAsideInner
    }
  } else {
    evalsAsideInner = `<div class="eval-empty">
      <div class="eval-empty-title">还没有评审</div>
      <div class="eval-empty-hint">跑完测试后，由 critic 子 agent 读 <code>evaluations/_manifest.json</code> 填充各维评审 JSON，再 <code>pnpm test:browser:report</code> 刷新即可。</div>
    </div>`
  }

  // 对话历史路径行（Finder 可打开 + 复制按钮 + sessionId）
  let historyRow = ''
  if (historyPath || sessionId) {
    const parts = []
    if (historyPath) {
      const fileUrl = 'file://' + historyPath.split('/').map(encodeURIComponent).join('/')
      parts.push(`<span class="hist-label">💾 对话历史：</span>
        <a class="hist-path" href="${esc(fileUrl)}" title="在文件管理器中打开">${esc(historyPath)}</a>
        <button class="hist-copy-btn" type="button" data-copy="${esc(historyPath)}" title="复制路径">📋</button>`)
    }
    if (sessionId) {
      parts.push(`<span class="hist-sid-label">session:</span>
        <code class="hist-sid">${esc(sessionId)}</code>
        <button class="hist-copy-btn" type="button" data-copy="${esc(sessionId)}" title="复制 sessionId">📋</button>`)
    }
    historyRow = `<div class="panel-history">${parts.join(' <span class="hist-sep">·</span> ')}</div>`
  }

  const hasContent = body.trim().length > 0 || badges.trim().length > 0
  const contentHtml = hasContent
    ? `${historyRow}<div class="badges">${badges}</div>${body}`
    : `${historyRow}<div class="panel-empty">这个测试没有 probe 数据可展示<br><small>（未调用 saveTestData / recordProbeRun）</small></div>`

  const metricParts = []
  if (dur) metricParts.push(`<span class="metric"><span class="metric-icon">⏱</span>${esc(dur)}</span>`)
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

  const panel = `<section class="detail-panel" data-idx="${idx}" hidden>
    <div class="panel-header">
      <span class="panel-icon ${cls}">${icon}</span>
      <span class="panel-title">${esc(fullName)}</span>
      <div class="panel-metrics">${metricParts.join('')}</div>
    </div>
    <div class="panel-body">
      <div class="panel-content">${contentHtml}</div>
      <aside class="panel-aside">
        <section class="aside-half aside-shots">
          <div class="aside-head">📸 截图（${pngs.length}）</div>
          <div class="aside-body panel-shots-list" data-lightbox-group>${shotsHtml}</div>
        </section>
        <section class="aside-half aside-evals">
          <div class="aside-head">🎯 评审（${evalsCountLabel}）</div>
          <div class="aside-body aside-evals-body">${evalsAsideInner}</div>
        </section>
      </aside>
    </div>
  </section>`

  return { nav, panel }
}

// ── 截图归属预计算：probeKey 严格匹配 → 未归属的截图按测试名 token 兜底 ──
function computeShotsByIdx(tests) {
  const map = new Map()
  const used = new Set()
  // 先走 probeKey 前缀匹配
  tests.forEach((test, idx) => {
    // vitest JSON reporter 只有 title/fullName，test.name 是 undefined；用 undefined 让
    // findProbe 的 `itName ?? fullName` 正确 fallback（空串不触发 ?? 链，会导致 prefix 匹配全军覆没）。
    const pm = findProbe(test.fullName, test.name)
    if (!pm?.key) return
    const stems = []
    for (const stem of screenshotsByPrefix.keys()) {
      if (stem.startsWith(pm.key)) { stems.push(stem); used.add(stem) }
    }
    if (stems.length) map.set(idx, stems.map(s => screenshotsByPrefix.get(s)))
  })
  // 剩余截图用 test 名 token 匹配（跳过已归属），避免重复分配
  tests.forEach((test, idx) => {
    if (map.has(idx)) return
    const name = `${test.fullName ?? ''} ${test.name ?? ''}`
    const stems = []
    for (const stem of screenshotsByPrefix.keys()) {
      if (used.has(stem)) continue
      if (tokenMatch(name, stem)) { stems.push(stem); used.add(stem) }
    }
    if (stems.length) map.set(idx, stems.map(s => screenshotsByPrefix.get(s)))
  })
  return map
}

// ── 渲染单 run 报告 ──
const allTests = []
for (const file of vitestData.testResults ?? []) {
  for (const t of file.assertionResults ?? []) allTests.push(t)
}
const passed = allTests.filter(t => t.status === 'passed').length
const failed = allTests.filter(t => t.status === 'failed').length
const total = vitestData.numTotalTests ?? allTests.length
const gitCommit = [...runRecordByTestCase.values()][0]?.gitCommit ?? ''
const gitBranch = [...runRecordByTestCase.values()][0]?.gitBranch ?? ''
const totalCredits = [...runRecordByTestCase.values()]
  .map(r => r.creditsConsumed ?? 0)
  .reduce((a, b) => a + b, 0)

const statusCls = failed > 0 ? 'fail' : 'pass'
const statusIcon = failed > 0 ? '✗' : '✓'

const styles = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#1a1a1a;padding:0;margin:0;max-width:none}
.app{display:grid;grid-template-columns:300px 1fr;height:100vh;overflow:hidden}
.sidebar{overflow-y:auto;border-right:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column}
.sidebar-head{padding:14px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0}
.sidebar-head h1{font-size:16px;font-weight:600;margin-bottom:4px;line-height:1.3}
.sidebar-head .meta{font-size:11px;color:#666;margin-bottom:8px;line-height:1.5}
.sidebar-head .back{display:inline-block;margin-bottom:10px;font-size:11px;color:#2563eb;text-decoration:none}
.sidebar-head .back:hover{text-decoration:underline}
.sidebar-head .summary{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:5px 10px;border-radius:6px;margin-top:4px}
.summary.pass{background:#dcfce7;color:#166534}
.summary.fail{background:#fee2e2;color:#991b1b}
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
.panel-header{padding:10px 16px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;gap:10px;align-items:center;flex-shrink:0}
.panel-icon{font-weight:700;font-size:15px}
.panel-icon.pass{color:#16a34a}
.panel-icon.fail{color:#dc2626}
.panel-title{flex:1;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.panel-metrics{display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center}
.metric{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#475569;font-variant-numeric:tabular-nums;background:#f1f5f9;padding:3px 8px;border-radius:4px;white-space:nowrap}
.metric-icon{font-size:12px}
.metric.metric-credits{background:#fef3c7;color:#92400e}
.metric.metric-tokens{background:#ede9fe;color:#5b21b6}
.metric.metric-ok{background:#dcfce7;color:#166534}
.metric.metric-warn{background:#fef3c7;color:#92400e}
.metric.metric-err{background:#fee2e2;color:#991b1b}
.metric-fail{margin-left:4px;color:#991b1b;font-weight:600}
.nav-fail-mark{color:#dc2626;font-weight:600}
.panel-body{flex:1;display:grid;grid-template-columns:1fr 380px;overflow:hidden;min-height:0}
.panel-content{overflow-y:auto;padding:16px 20px}
.panel-aside{border-left:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.aside-half{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.aside-shots{flex:0 1 auto;max-height:55%}
.aside-evals{flex:1 1 auto;border-top:2px solid #e5e7eb;min-height:200px}
.aside-head{padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:600;color:#475569;background:#fafafa;flex-shrink:0;display:flex;align-items:center;gap:6px}
.aside-body{overflow-y:auto;flex:1;min-height:0}
.panel-shots-list{padding:10px;display:flex;flex-direction:column;gap:10px}
.aside-evals-body{padding:10px;display:flex;flex-direction:column;gap:8px}
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
.shot-item{margin:0}
.shot-item img{width:100%;display:block;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:zoom-in;transition:transform 0.15s}
.shot-name{font-size:10px;color:#94a3b8;font-family:Menlo,Monaco,monospace;margin-top:4px;word-break:break-all}
.shot-empty{padding:20px 12px;color:#94a3b8;font-size:11px;text-align:center}
.panel-empty{padding:40px 20px;color:#94a3b8;text-align:center;font-size:13px;line-height:1.6}
.panel-empty small{font-size:11px;color:#cbd5e1}
.panel-history{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:12px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#475569}
.hist-label,.hist-sid-label{color:#64748b;flex-shrink:0}
.hist-path{font-family:Menlo,Monaco,monospace;font-size:11px;color:#2563eb;text-decoration:none;word-break:break-all;background:#eff6ff;padding:2px 6px;border-radius:3px}
.hist-path:hover{background:#dbeafe;text-decoration:underline}
.hist-sid{font-family:Menlo,Monaco,monospace;font-size:10.5px;color:#334155;background:#fff;padding:2px 6px;border:1px solid #e2e8f0;border-radius:3px}
.hist-copy-btn{border:1px solid #e2e8f0;background:#fff;cursor:pointer;padding:2px 6px;border-radius:3px;font-size:11px;line-height:1}
.hist-copy-btn:hover{background:#eff6ff;border-color:#93c5fd}
.hist-copy-btn.copied{background:#dcfce7;border-color:#86efac;color:#166534}
.hist-sep{color:#cbd5e1}
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
.sec-spec > summary{background:#eff6ff;color:#1d4ed8}
.sec-spec[open] > summary{background:#dbeafe}
.sec-judge > summary{background:#fff7ed;color:#9a3412}
.sec-judge[open] > summary{background:#ffedd5}
.judge-card{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:10px;background:#fff;font-size:11.5px;line-height:1.55}
.judge-card:last-child{margin-bottom:0}
.judge-pass{border-left:3px solid #16a34a;background:#f0fdf4}
.judge-fail{border-left:3px solid #dc2626;background:#fef2f2}
.judge-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.judge-idx{color:#64748b;font-size:10px;font-weight:500;background:#f1f5f9;padding:1px 6px;border-radius:10px}
.judge-verdict{font-weight:600;font-size:11px;padding:2px 8px;border-radius:10px}
.judge-verdict.v-ok{background:#dcfce7;color:#166534}
.judge-verdict.v-err{background:#fee2e2;color:#991b1b}
.judge-score{font-size:11px;padding:2px 8px;border-radius:10px;background:#f1f5f9;color:#475569}
.judge-score.v-ok{background:#dcfce7;color:#166534}
.judge-score.v-warn{background:#fef3c7;color:#92400e}
.judge-score.v-err{background:#fee2e2;color:#991b1b}
.judge-tools{font-size:10.5px;color:#64748b;margin-left:auto}
.judge-kv{margin-top:6px}
.judge-k{display:block;font-size:10.5px;color:#64748b;font-weight:500;margin-bottom:3px}
.judge-v{color:#1f2937;background:#fff;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;white-space:pre-wrap;word-break:break-word}
.judge-reason{background:#fffbeb;border-color:#fde68a;color:#92400e}
.judge-resp{background:#f8fafc;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto}
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
.ss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.ss{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#fff;cursor:pointer}
.ss img{width:100%;display:block;cursor:zoom-in;transition:transform 0.2s}
.ss figcaption{padding:4px 8px;font-size:10px;color:#888;border-top:1px solid #f0f0f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log{background:#1a1a1a;color:#e5e7eb;padding:10px;border-radius:6px;font-family:Menlo,Monaco,'Courier New',monospace;font-size:11px;line-height:1.5;max-height:300px;overflow:auto;white-space:pre-wrap}
.lvl{font-weight:500;margin-right:4px}
.lvl-error{color:#f87171}
.lvl-warn{color:#fbbf24}
.lvl-info{color:#60a5fa}
.lvl-log{color:#9ca3af}
.url{font-family:Menlo,Monaco,monospace;font-size:10px;word-break:break-all;max-width:500px}
.err{background:#1a1a1a;color:#f87171;padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:400px}
/* ── Message timeline ── */
.timeline{display:flex;flex-direction:column;gap:10px}
.tl-msg{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff}
.tl-msg.tl-role-user{border-left:3px solid #2563eb;background:#f0f7ff}
.tl-msg.tl-role-assistant{border-left:3px solid #16a34a}
.tl-msg.tl-role-system{border-left:3px solid #9ca3af}
.tl-msg-head{padding:6px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;align-items:center;font-size:11px;color:#475569;flex-wrap:wrap}
.tl-costs{margin-left:auto;display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
.tl-cost{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:10px;font-size:10.5px;font-variant-numeric:tabular-nums;white-space:nowrap;border:1px solid transparent}
.tl-cost-credits{background:#fef3c7;color:#92400e;border-color:#fde68a}
.tl-cost-tokens{background:#ede9fe;color:#5b21b6;border-color:#ddd6fe}
.tl-cost-dur{background:#f1f5f9;color:#475569;border-color:#e2e8f0}
.tl-role-user .tl-msg-head{background:#e0f0ff}
.tl-msg-icon{font-size:13px}
.tl-msg-role{font-weight:600;text-transform:uppercase;letter-spacing:0.3px}
.tl-msg-turn{background:#f1f5f9;color:#475569;padding:1px 7px;border-radius:10px;font-size:10px}
.tl-msg-idx{margin-left:auto;color:#94a3b8;font-variant-numeric:tabular-nums;font-family:Menlo,monospace}
.tl-msg-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.tl-text{white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.55;color:#1a1a1a}
.tl-reasoning{border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc}
.tl-reasoning > summary{padding:5px 10px;font-size:11px;color:#64748b;cursor:pointer;list-style:none}
.tl-reasoning > summary::-webkit-details-marker{display:none}
.tl-reasoning > summary:before{content:'▸ ';color:#94a3b8}
.tl-reasoning[open] > summary:before{content:'▾ '}
.tl-reasoning-body{padding:8px 12px;font-size:11px;line-height:1.55;color:#475569;white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;border-top:1px dashed #cbd5e1}
.tl-tool{border:1px solid #e2e8f0;border-radius:6px;background:#fafafa;padding:8px 10px}
.tl-tool.tl-tool-err-state{border-color:#fecaca;background:#fef2f2}
.tl-tool-head{display:flex;gap:8px;align-items:center;font-size:11px}
.tl-tool-name{font-weight:600;color:#334155;font-family:Menlo,monospace}
.tl-tool-err{margin-top:6px;padding:6px 8px;background:#1a1a1a;color:#f87171;border-radius:4px;font-size:11px;white-space:pre-wrap;word-break:break-word}
.tl-io{margin-top:6px}
.tl-io > summary{cursor:pointer;font-size:10px;color:#64748b;padding:3px 0;list-style:none}
.tl-io > summary::-webkit-details-marker{display:none}
.tl-io > summary:before{content:'▸ ';color:#94a3b8}
.tl-io[open] > summary:before{content:'▾ '}
.tl-io pre{background:#f1f5f9;border-radius:4px;padding:6px 8px;font-size:10.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow-y:auto;font-family:Menlo,Monaco,monospace}
.tl-atts{margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.att{border:1px solid #e5e7eb;border-radius:6px;background:#fff;overflow:hidden;display:flex;flex-direction:column;font-size:11px}
.att-img img{width:100%;display:block;max-height:220px;object-fit:cover;cursor:zoom-in;transition:transform 0.15s}
.att-img figcaption{padding:4px 8px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-top:1px solid #f0f0f0}
.att-audio,.att-video,.att-link{padding:8px;gap:6px}
.att-audio audio,.att-video video{width:100%;max-height:180px}
.att-name{font-weight:500;color:#334155;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.att-path{display:block;margin-top:4px;font-family:Menlo,Monaco,monospace;font-size:10px;color:#94a3b8;word-break:break-all;background:#f8fafc;padding:3px 5px;border-radius:3px}
.tl-source{font-size:11px;color:#2563eb}
.tl-source a{color:#2563eb;text-decoration:none}
.tl-source a:hover{text-decoration:underline}
.tl-file{font-size:11px;color:#64748b}
.tl-unknown > summary{cursor:pointer;font-size:10px;color:#94a3b8}
.tl-unknown pre{background:#f8fafc;padding:6px 8px;font-size:10px;border-radius:4px;max-height:160px;overflow:auto;margin-top:4px}
/* Lightbox (图片预览) */
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

const shotsByIdx = computeShotsByIdx(allTests)
const split = allTests.map((t, i) => renderTestSplit(t, i, shotsByIdx))
const navHtml = split.map(s => s.nav).join('')
const panelsHtml = split.map(s => s.panel).join('')

const runHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Test Report ${fmtTs(runTs)}</title>
<style>${styles}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-head">
      <a class="back" href="../index.html">← All Runs</a>
      <h1>测试报告</h1>
      <div class="meta">
        ${fmtTs(runTs)}<br>
        ${total} tests${screenshotsByPrefix.size ? ` · ${screenshotsByPrefix.size} 截图` : ''}
        ${totalCredits > 0 ? `<br>💎 ${totalCredits.toFixed(2)} credits` : ''}
        ${gitCommit ? `<br><code>${esc(gitBranch)}@${esc(gitCommit)}</code>` : ''}
      </div>
      <div class="summary ${statusCls}">${statusIcon} ${passed}/${total} passed${failed ? `, ${failed} failed` : ''}</div>
    </div>
    <nav class="nav-list" id="nav-list">${navHtml}</nav>
  </aside>
  <main class="detail-host" id="detail-host">
    ${panelsHtml || '<div class="detail-empty">没有测试数据</div>'}
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
<script>
(function(){
  var items = document.querySelectorAll('.nav-item')
  var panels = document.querySelectorAll('.detail-panel')
  function select(idx){
    items.forEach(function(el){
      el.classList.toggle('active', el.dataset.idx === String(idx))
    })
    panels.forEach(function(el){
      var match = el.dataset.idx === String(idx)
      if (match) el.removeAttribute('hidden'); else el.setAttribute('hidden', '')
    })
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
  if (items.length) select(initial)

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

  // 复制按钮（历史路径 / sessionId）
  document.addEventListener('click', function(e){
    var t = e.target
    if (!t || !t.classList || !t.classList.contains('hist-copy-btn')) return
    var v = t.dataset.copy
    if (!v) return
    e.preventDefault()
    var done = function(){
      var orig = t.textContent
      t.textContent = '✓'
      t.classList.add('copied')
      setTimeout(function(){ t.textContent = orig; t.classList.remove('copied') }, 1200)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(done).catch(function(){
        var ta = document.createElement('textarea')
        ta.value = v; document.body.appendChild(ta); ta.select()
        try { document.execCommand('copy'); done() } catch {}
        document.body.removeChild(ta)
      })
    } else {
      var ta = document.createElement('textarea')
      ta.value = v; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch {}
      document.body.removeChild(ta)
    }
  })
})()
</script>
</body>
</html>`

writeFileSync(join(runDir, 'index.html'), runHtml, 'utf-8')

// ── 主页索引：所有 run ──
function rebuildHomeIndex() {
  if (!existsSync(runsRoot)) return
  // 主页也过滤空壳目录：没 results.json 的 run 没意义
  const dirs = listRunDirsBySeqDesc({ requireResults: true })

  // 每个 run 的结构化数据（共享给两个 tab）
  const runInfos = dirs.map(ts => {
    const rj = safeJson(
      existsSync(join(runsRoot, ts, 'results.json'))
        ? readFileSync(join(runsRoot, ts, 'results.json'), 'utf-8')
        : '{}',
      {},
    )
    // run-meta.json.batch 是可选批次标签（由 --batch / BROWSER_TEST_BATCH 注入）
    // modelOverride 是可选的 runner --model 覆盖标记
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
    const hasReport = existsSync(join(runsRoot, ts, 'index.html'))
    const statusCls = failed > 0 ? 'fail' : 'pass'
    const link = hasReport ? `./${ts}/index.html` : '#'

    // 扫描此 run 的 probe data；按三种路径建索引以尽量命中用例 pill：
    //   1. testCase 完整 slug（如 `skill-market-001-list-loads`）
    //   2. 三位数字纯前缀（如 `001` -> 001-read-tool-text）
    //   3. 非数字前缀 + 数字（如 `memory-001` / `skill-market-001`）
    // 配合下方按 vitest 文件路径推导的候选 slug，覆盖 __tests__/<子目录>/<NNN>-*.browser.tsx 这类命名
    // 同时聚合 creditsConsumed 作为 run 级别成本
    const probeByTestCase = new Map()
    const probeByPrefix = new Map()
    const runDataDir = join(runsRoot, ts, 'data')
    let totalCredits = 0
    let hasCredits = false
    // model 集合：聚合本 run 所有用例的 `model` 字段。
    // 大多数 run 是单模型（Set 大小 = 1），混合 run 会显示所有出现过的 id。
    // modelOverride 独立显示（来自 run-meta.json），不进这个集合 — 它覆盖的是运行时实际发给 server 的 model，
    // 而这里聚合的是测试声明的"设计意图"，两者语义不同。
    const modelSet = new Set()
    if (existsSync(runDataDir)) {
      for (const f of readdirSync(runDataDir).filter(f => f.endsWith('.json'))) {
        const d = safeJson(readFileSync(join(runDataDir, f), 'utf-8'))
        if (!d?.testCase) continue
        const info = { testCase: d.testCase, description: d.description ?? '' }
        probeByTestCase.set(d.testCase, info)
        const digitOnly = d.testCase.match(/^(\d{3})/)
        if (digitOnly && !probeByPrefix.has(digitOnly[1])) probeByPrefix.set(digitOnly[1], info)
        const namedDigit = d.testCase.match(/^([a-z][a-z0-9-]*?-\d{3})/i)
        if (namedDigit && !probeByPrefix.has(namedDigit[1])) probeByPrefix.set(namedDigit[1], info)
        const c = d?.result?.creditsConsumed
        if (typeof c === 'number' && Number.isFinite(c)) {
          totalCredits += c
          hasCredits = true
        }
        if (typeof d?.model === 'string' && d.model.trim()) modelSet.add(d.model.trim())
      }
    }
    const models = [...modelSet].sort()

    // 由 vitest results.json 的 file path 反推候选 slug：
    //   `__tests__/skill-market/001-list-loads.browser.tsx` -> `skill-market-001-list-loads`
    //   `__tests__/memory/001-natural-preference.browser.tsx` -> `memory-001-natural-preference`
    //   `__tests__/011-pdf-create.browser.tsx` -> `011-pdf-create`
    // 同时产出一个 prefix 候选用于命名不一致（如 memory-001 测试里 probe 名写成 memory-001-dietary-preference）。
    function deriveSlugFromFile(filePath) {
      if (!filePath) return null
      const m = filePath.match(/__tests__\/(.+)\.browser\.tsx?$/)
      if (!m) return null
      return m[1].replace(/\//g, '-')
    }

    // 总用时：results.json 里 testResults 的 max(endTime) - min(startTime)（墙钟时长）
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
        // 命中顺序：文件派生 slug → 文件前缀（memory-001-* / skill-market-001-*）→ title 里的三位数字前缀
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
        testItems.push({ caseName, title: tTitle, description, ok: tOk, status: t.status, hasProbe: !!probe })
      }
    }
    return {
      ts,
      passed,
      failed,
      total,
      hasReport,
      statusCls,
      link,
      testItems,
      batch,
      totalCredits: hasCredits ? totalCredits : null,
      totalElapsedMs,
      models,
      modelOverride,
    }
  })

  // ── Tab 1: 按批次分组（无 batch 的归到末尾"未分组"）──
  function renderRunRow(info) {
    const { ts, passed, failed, total, hasReport, statusCls, link, testItems, totalCredits, totalElapsedMs, models, modelOverride } = info
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
        return `<li class="${cls}"><span class="tn-icon">${icon}</span>${caseHtml}${descHtml}</li>`
      }).join('')
      : '<li class="tn-empty">（无测试数据）</li>'
    const countHtml = failed > 0
      ? `<span class="c-pass">${passed}</span> / <span class="c-fail">${failed} 失败</span>`
      : `<span class="c-pass">${passed}/${total}</span>`
    const extraParts = []
    if (typeof totalCredits === 'number' && totalCredits > 0) {
      extraParts.push(`<span class="c-credits" title="SaaS 积分消耗">💎 ${totalCredits.toFixed(2)}</span>`)
    }
    if (typeof totalElapsedMs === 'number' && totalElapsedMs > 0) {
      extraParts.push(`<span class="c-dur" title="总用时（墙钟）">⏱ ${fmtMinSec(totalElapsedMs)}</span>`)
    }
    // 模型展示：
    //   - modelOverride 存在 → 用橙色 pill 标 override，title 里写测试原声明的 id 以便对比
    //   - 单模型 → 直接显示 id
    //   - 多模型 → 显示第一个 + 省略号，title 里列全部
    //   - 0 个（老 run data 里没 model 字段） → 不渲染
    if (modelOverride) {
      const intentNote = models.length > 0 ? `（测试声明：${models.join(', ')}）` : ''
      extraParts.push(`<span class="c-model c-model-override" title="runner --model 覆盖${intentNote}">🤖 ${esc(modelOverride)} [override]</span>`)
    } else if (models.length === 1) {
      extraParts.push(`<span class="c-model" title="本次 run 使用的模型">🤖 ${esc(models[0])}</span>`)
    } else if (models.length > 1) {
      extraParts.push(`<span class="c-model c-model-mixed" title="混合模型：${esc(models.join(', '))}">🤖 ${esc(models[0])} + ${models.length - 1}</span>`)
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

  // suite 表头：展示 suite 名 + 该组案例数 + 汇总（pass / fail 次数）
  const suiteHeaderHtml = (suite, entries) => {
    const totalRuns = entries.reduce((a, e) => a + e.runs.length, 0)
    const passRuns = entries.reduce((a, e) => a + e.runs.filter(r => r.ok).length, 0)
    const failRuns = entries.reduce((a, e) => a + e.runs.filter(r => r.status === 'failed').length, 0)
    const label = suite === '__misc__' ? '未分组' : suite
    const summary = totalRuns === 0
      ? '<span class="gray">暂无运行</span>'
      : failRuns > 0
        ? `<span class="c-pass">${passRuns} pass</span> · <span class="c-fail">${failRuns} fail</span>`
        : `<span class="c-pass">${passRuns} pass</span>`
    return `<tr class="suite-header">
      <td colspan="3"><strong>${esc(label)}</strong> <span class="suite-count">· ${entries.length} 个案例 · ${summary}</span></td>
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
      const linkHtml = r.hasReport
        ? `<a href="${r.link}">${esc(tsLabel)}</a>`
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
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#1a1a1a;padding:24px;max-width:1400px;margin:0 auto}
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
.c-summary-extra .c-credits,.c-summary-extra .c-dur,.c-summary-extra .c-model{display:inline-flex;align-items:center;gap:3px;line-height:1.4}
.c-summary-extra .c-model{font-family:Menlo,Monaco,monospace;font-size:11px}
.c-summary-extra .c-model-override{color:#b45309;background:#fef3c7;border:1px solid #fde68a;padding:1px 6px;border-radius:3px;font-weight:500}
.c-summary-extra .c-model-mixed{color:#6d28d9;background:#ede9fe;border:1px solid #ddd6fe;padding:1px 6px;border-radius:3px}
.c-pass{color:#16a34a}
.c-fail{color:#dc2626}
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
