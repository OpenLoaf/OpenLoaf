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
import { spawn } from 'node:child_process'
import { platform } from 'node:os'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsRoot = join(webRoot, 'browser-test-runs')
const runsJsonl = join(monoRoot, '.agents/skills/ai-browser-test/runs.jsonl')

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

function findLatestRunDir() {
  if (!existsSync(runsRoot)) return null
  const dirs = readdirSync(runsRoot)
    .filter(d => /^\d{8}_\d{6}/.test(d) && statSync(join(runsRoot, d)).isDirectory())
    .sort().reverse()
  return dirs.length ? join(runsRoot, dirs[0]) : null
}

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
  for (const f of readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).sort()) {
    const buf = readFileSync(join(screenshotsDir, f))
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
    screenshotsByPrefix.set(f.replace(/\.png$/, ''), { name: f, dataUrl })
  }
}

const evalsByTestCase = new Map()
const evalRoot = join(runDir, 'evaluations')
if (existsSync(evalRoot)) {
  for (const dirent of readdirSync(evalRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('_')) continue
    const tc = dirent.name
    const list = []
    for (const f of readdirSync(join(evalRoot, tc))) {
      if (!f.endsWith('.json') || f === 'input.json') continue
      const d = safeJson(readFileSync(join(evalRoot, tc, f), 'utf-8'))
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

// ── 辅助 ──
function safeJson(s, fallback = null) { try { return JSON.parse(s) } catch { return fallback } }
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function fmtTs(ts) {
  if (!/^\d{8}_\d{6}/.test(ts ?? '')) return ts
  // 目录名里的 ts 来自 Date.toISOString()，是 UTC。显示时转成上海时区（UTC+8）。
  const y = ts.slice(0, 4), mo = ts.slice(4, 6), d = ts.slice(6, 8)
  const h = ts.slice(9, 11), mi = ts.slice(11, 13), se = ts.slice(13, 15)
  const utc = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`)
  if (isNaN(utc.getTime())) return `${y}-${mo}-${d} ${h}:${mi}:${se}`
  const sh = new Date(utc.getTime() + 8 * 3600 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${sh.getUTCFullYear()}-${pad(sh.getUTCMonth() + 1)}-${pad(sh.getUTCDate())} ${pad(sh.getUTCHours())}:${pad(sh.getUTCMinutes())}:${pad(sh.getUTCSeconds())}`
}
function fmtMs(n) {
  if (n == null || Number.isNaN(Number(n))) return ''
  const ms = Math.round(Number(n))
  if (ms < 1000) return `${ms}毫秒`
  const s = Math.floor(ms / 1000)
  const rem = ms % 1000
  return rem === 0 ? `${s}秒` : `${s}秒${rem}毫秒`
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
    return `<div class="tl-text">${esc(text)}</div>`
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
    items.push(`<section class="tl-msg tl-role-${esc(role)}">
      <header class="tl-msg-head"><span class="tl-msg-icon">${icon}</span><span class="tl-msg-role">${esc(role)}</span>${turn >= 0 ? `<span class="tl-msg-turn">turn ${turn}</span>` : ''}<span class="tl-msg-idx">#${idx}</span></header>
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
  const agg = aggregateScore(evals)

  const pngs = shotsByIdx.get(idx) ?? []

  const toolCallDetails = probe?.result?.toolCallDetails ?? run?.toolCallDetails ?? []
  const textPreview = probe?.result?.textPreview ?? run?.textPreview ?? ''
  const credits = run?.creditsConsumed
  const consoleLogs = probe?.result?.consoleLogs ?? []
  const networkRequests = probe?.result?.networkRequests ?? []
  const historyPath = run?.historyPath
  const sessionId = probe?.result?.sessionId ?? run?.sessionId

  // ── 工具指标 ──
  const totalCalls = toolCallDetails.length
  const failedCalls = toolCallDetails.filter(t => t.hasError).length
  const successRate = totalCalls ? Math.round(((totalCalls - failedCalls) / totalCalls) * 100) : null
  const hasCredits = typeof credits === 'number' && credits > 0

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

  // 失败信息放最上
  if (test.status === 'failed' && test.failureMessages?.length) {
    body += `<details open class="sec"><summary>❌ 失败信息</summary><div class="sec-body"><pre class="err">${esc(test.failureMessages.join('\n'))}</pre></div></details>`
  }

  // 评审详情
  if (evals?.length) {
    body += `<details open class="sec"><summary>🎯 评审（${evals.length} 维）</summary><div class="sec-body">`
    body += `<table class="eval-table"><tr><th>维度</th><th>verdict</th><th>分</th><th>摘要</th></tr>`
    for (const e of evals) {
      const d = e.data
      const vCls = d.verdict === 'PASS' ? 'v-ok' : d.verdict === 'PARTIAL' ? 'v-warn' : 'v-err'
      body += `<tr><td class="c-name">${esc(e.critic.replace('-critic', ''))}</td><td class="${vCls}">${esc(d.verdict ?? '')}</td><td>${esc(d.score ?? '')}</td><td>${esc(d.summary ?? '')}</td></tr>`
    }
    body += `</table>`
    const allCons = []
    for (const e of evals) {
      for (const c of (e.data.cons ?? [])) {
        const level = e.data.verdict === 'FAIL' ? 'error' : 'warning'
        allCons.push({ level, critic: e.critic.replace('-critic', ''), text: c })
      }
    }
    allCons.sort((a, b) => (a.level === 'error' ? -1 : 1) - (b.level === 'error' ? -1 : 1))
    if (allCons.length) {
      body += `<div class="issues"><strong>问题清单：</strong><ul>`
      for (const c of allCons.slice(0, 10)) {
        body += `<li class="issue-${c.level}">[${c.level}] <em>${esc(c.critic)}</em> — ${esc(c.text)}</li>`
      }
      body += `</ul></div>`
    }
    body += `</div></details>`
  }

  const messages = probe?.result?.messages
  body += renderMessageTimeline(messages)

  if (probe?.prompt || textPreview) {
    body += `<details class="sec"><summary>💬 Prompt / 回复摘要</summary><div class="sec-body">`
    if (probe?.prompt) body += `<div class="kv"><span class="k">Prompt:</span><pre>${esc(probe.prompt.slice(0, 600))}${probe.prompt.length > 600 ? '…' : ''}</pre></div>`
    if (textPreview) body += `<div class="kv"><span class="k">AI 回复（前 600 字）:</span><pre>${esc(textPreview.slice(0, 600))}${textPreview.length > 600 ? '…' : ''}</pre></div>`
    body += `</div></details>`
  }

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

  // ── 右侧截图 ──
  const shotsHtml = pngs.length
    ? pngs.map(s => `<figure class="shot-item"><img src="${s.dataUrl}" data-lightbox data-caption="${esc(s.name)}"/><figcaption class="shot-name">${esc(s.name)}</figcaption></figure>`).join('')
    : '<div class="shot-empty">没有截图</div>'

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
      <aside class="panel-shots">
        <div class="panel-shots-head">📸 截图（${pngs.length}）</div>
        <div class="panel-shots-list" data-lightbox-group>${shotsHtml}</div>
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
    const pm = findProbe(test.fullName ?? '', test.name ?? '')
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
.metric.metric-ok{background:#dcfce7;color:#166534}
.metric.metric-warn{background:#fef3c7;color:#92400e}
.metric.metric-err{background:#fee2e2;color:#991b1b}
.metric-fail{margin-left:4px;color:#991b1b;font-weight:600}
.nav-fail-mark{color:#dc2626;font-weight:600}
.panel-body{flex:1;display:grid;grid-template-columns:1fr 380px;overflow:hidden;min-height:0}
.panel-content{overflow-y:auto;padding:16px 20px}
.panel-shots{overflow-y:auto;border-left:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column}
.panel-shots-head{padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:600;color:#475569;background:#fafafa;flex-shrink:0}
.panel-shots-list{padding:10px;display:flex;flex-direction:column;gap:10px}
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
@media (max-width:960px){.panel-body{grid-template-columns:1fr}.panel-shots{border-left:none;border-top:1px solid #e5e7eb}}
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
.tl-msg-head{padding:6px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;align-items:center;font-size:11px;color:#475569}
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
  const dirs = readdirSync(runsRoot)
    .filter(d => /^\d{8}_\d{6}/.test(d) && statSync(join(runsRoot, d)).isDirectory())
    .sort().reverse()

  const rows = dirs.map(ts => {
    const rj = safeJson(
      existsSync(join(runsRoot, ts, 'results.json'))
        ? readFileSync(join(runsRoot, ts, 'results.json'), 'utf-8')
        : '{}',
      {},
    )
    const passed = rj.numPassedTests ?? 0
    const failed = rj.numFailedTests ?? 0
    const total = rj.numTotalTests ?? 0
    const hasReport = existsSync(join(runsRoot, ts, 'index.html'))
    const statusCls = failed > 0 ? 'fail' : 'pass'
    const link = hasReport ? `./${ts}/index.html` : '#'

    // 扫描此 run 的 probe data，按数字前缀索引（如 "100" -> {testCase, description}）
    const probeByPrefix = new Map()
    const runDataDir = join(runsRoot, ts, 'data')
    if (existsSync(runDataDir)) {
      for (const f of readdirSync(runDataDir).filter(f => f.endsWith('.json'))) {
        const d = safeJson(readFileSync(join(runDataDir, f), 'utf-8'))
        if (!d?.testCase) continue
        const m = d.testCase.match(/^(\d{3})/)
        if (m) probeByPrefix.set(m[1], { testCase: d.testCase, description: d.description ?? '' })
      }
    }

    const testItems = []
    for (const file of rj.testResults ?? []) {
      for (const t of file.assertionResults ?? []) {
        const tTitle = t.title ?? t.fullName ?? t.name ?? ''
        const tOk = t.status === 'passed'
        // title 里的三位数字前缀（如 "001 — ..." / "100 — ..."）用来找对应 probe
        const prefixMatch = tTitle.match(/(\d{3})/)
        const probe = prefixMatch ? probeByPrefix.get(prefixMatch[1]) : null
        const caseName = probe?.testCase ?? tTitle
        const description = probe?.description ?? ''
        testItems.push({ caseName, title: tTitle, description, ok: tOk, status: t.status, hasProbe: !!probe })
      }
    }
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
    const summary = failed > 0
      ? `<span class="c-pass">${passed}</span> / <span class="c-fail">${failed} 失败</span>`
      : `<span class="c-pass">${passed}/${total}</span>`
    return `<tr class="${statusCls}">
      <td><a href="${link}">${fmtTs(ts)}</a></td>
      <td class="c-tests"><ul class="test-name-list">${testsHtml}</ul></td>
      <td class="c-summary">${summary}</td>
      <td>${hasReport ? `<a href="${link}">Open ↗</a>` : '<span class="gray">—</span>'}</td>
    </tr>`
  }).join('')

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Browser Test — All Runs</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#1a1a1a;padding:24px;max-width:1400px;margin:0 auto}
h1{font-size:22px;font-weight:600;margin-bottom:6px}
.meta{font-size:13px;color:#666;margin-bottom:20px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
th,td{padding:10px 14px;text-align:left;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top}
th{background:#f8fafc;color:#475569;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
tr:last-child td{border-bottom:none}
tr.pass{border-left:3px solid #16a34a}
tr.fail{border-left:3px solid #dc2626}
.c-summary{font-variant-numeric:tabular-nums;font-weight:500;white-space:nowrap}
.c-pass{color:#16a34a}
.c-fail{color:#dc2626}
.c-tests{max-width:900px}
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
.gray{color:#9ca3af}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>Browser Test — All Runs</h1>
<div class="meta">${dirs.length} run(s)。最新在上，点任一行打开该次详情（自包含 HTML，双击即可打开）。</div>
<table>
  <thead><tr><th>Run</th><th>测试列表</th><th>结果</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`
  writeFileSync(join(runsRoot, 'index.html'), indexHtml, 'utf-8')
}

rebuildHomeIndex()

const runReportPath = join(runDir, 'index.html')
const homeIndexPath = join(runsRoot, 'index.html')

console.log(`\n  Run report:  ${runReportPath}`)
console.log(`  All runs:    ${homeIndexPath}`)

// 自动打开 All Runs 主页（除非 CI / BROWSER_TEST_NO_OPEN 环境变量设置）
if (process.env.CI !== 'true' && !process.env.BROWSER_TEST_NO_OPEN) {
  const p = platform()
  const openerCmd = p === 'darwin' ? 'open'
    : p === 'win32' ? 'cmd'
    : 'xdg-open'
  const openerArgs = p === 'win32' ? ['/c', 'start', '""', homeIndexPath] : [homeIndexPath]
  try {
    spawn(openerCmd, openerArgs, { stdio: 'ignore', detached: true }).unref()
  } catch {}
}
