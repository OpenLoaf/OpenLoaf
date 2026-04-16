/**
 * 生成自包含 HTML 测试报告。
 * 合并 vitest results.json + data/*.json（ProbeResult 详情）+ screenshots。
 * 截图内嵌 base64，file:// 直接打开。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const RUNS_ROOT = join(import.meta.dirname, '../../../browser-test-runs')

function findRunDir() {
  if (process.argv[2]) return process.argv[2]
  if (process.env.BROWSER_TEST_RUN_DIR) return process.env.BROWSER_TEST_RUN_DIR
  if (!existsSync(RUNS_ROOT)) return null
  const dirs = readdirSync(RUNS_ROOT)
    .filter(d => /^\d{8}_\d{6}/.test(d) && statSync(join(RUNS_ROOT, d)).isDirectory())
    .sort().reverse()
  return dirs.length > 0 ? join(RUNS_ROOT, dirs[0]) : null
}

const runDir = findRunDir()
if (!runDir) { console.log('No test run found.'); process.exit(0) }
const jsonPath = join(runDir, 'results.json')
if (!existsSync(jsonPath)) { console.log(`No results.json in ${runDir}`); process.exit(0) }

const vitestData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
const passed = vitestData.numPassedTests ?? 0
const failed = vitestData.numFailedTests ?? 0
const total = vitestData.numTotalTests ?? (passed + failed)

// 读取 probe data（每个测试的 ProbeResult）
const dataDir = join(runDir, 'data')
const probeDataMap = new Map()
if (existsSync(dataDir)) {
  for (const f of readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(dataDir, f), 'utf-8'))
      if (d.testCase) probeDataMap.set(d.testCase, d)
    } catch {}
  }
}

// 截图 → base64（按名称分组到测试用例）
const ssDir = join(runDir, 'screenshots')
const allScreenshots = []
if (existsSync(ssDir)) {
  for (const f of readdirSync(ssDir).filter(f => f.endsWith('.png')).sort()) {
    const buf = readFileSync(join(ssDir, f))
    allScreenshots.push({ name: f, dataUrl: `data:image/png;base64,${buf.toString('base64')}` })
  }
}

// 构建每个测试的详细 HTML
let testsHtml = ''
for (const file of vitestData.testResults || []) {
  for (const t of file.assertionResults || []) {
    const icon = t.status === 'passed' ? '&#x2713;' : '&#x2717;'
    const cls = t.status === 'passed' ? 'pass' : 'fail'
    const dur = t.duration != null ? Math.round(t.duration) : null

    // 匹配 probe data
    let probeHtml = ''
    const probe = findProbeData(t.fullName)
    if (probe) {
      const r = probe.result || {}
      const toolCalls = Array.isArray(r.toolCalls) ? r.toolCalls : []
      const elapsedMs = r.elapsedMs != null ? Math.round(r.elapsedMs) : null
      const textPreview = typeof r.textPreview === 'string' ? r.textPreview : ''

      probeHtml += '<div class="probe-detail">'
      probeHtml += '<div class="probe-row">'
      if (elapsedMs != null) probeHtml += `<span class="badge">&#x23F1; ${elapsedMs}ms</span>`
      if (toolCalls.length > 0) probeHtml += `<span class="badge">&#x1F527; ${toolCalls.length} tools: ${esc(toolCalls.join(', '))}</span>`
      if (r.finishReason) probeHtml += `<span class="badge">finish: ${esc(r.finishReason)}</span>`
      if (r.status) probeHtml += `<span class="badge ${r.status === 'ok' ? 'badge-ok' : 'badge-err'}">${esc(r.status)}</span>`
      probeHtml += '</div>'

      if (probe.prompt) {
        probeHtml += `<div class="probe-section"><span class="label">Prompt:</span> ${esc(probe.prompt.slice(0, 200))}${probe.prompt.length > 200 ? '...' : ''}</div>`
      }
      if (probe.description) {
        probeHtml += `<div class="probe-section"><span class="label">Description:</span> ${esc(probe.description)}</div>`
      }
      if (textPreview) {
        probeHtml += `<div class="probe-section"><span class="label">AI Response:</span><div class="text-preview">${esc(textPreview.slice(0, 400))}${textPreview.length > 400 ? '...' : ''}</div></div>`
      }
      if (probe.tags?.length) {
        probeHtml += `<div class="probe-section">${probe.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>`
      }
      probeHtml += '</div>'
    }

    // 匹配截图
    const testPrefix = extractTestPrefix(t.fullName)
    const matchedSS = allScreenshots.filter(ss => testPrefix && ss.name.startsWith(testPrefix))
    let ssHtml = ''
    if (matchedSS.length > 0) {
      ssHtml = '<div class="ss-row">'
      for (const ss of matchedSS) {
        ssHtml += `<div class="ss-thumb"><img src="${ss.dataUrl}" loading="lazy" onclick="window.open('').document.write('<img src=\\''+this.src+'\\' style=\\'max-width:100%\\'>')" /><div class="ss-label">${esc(ss.name)}</div></div>`
      }
      ssHtml += '</div>'
    }

    // 错误信息
    let errHtml = ''
    if (t.status === 'failed' && t.failureMessages?.length) {
      errHtml = `<pre class="err">${esc(t.failureMessages.join('\n'))}</pre>`
    }

    testsHtml += `
<div class="test-card ${cls}">
  <div class="test-header">
    <span class="icon">${icon}</span>
    <span class="test-name">${esc(t.fullName)}</span>
    ${dur != null ? `<span class="dur">${dur}ms</span>` : ''}
  </div>
  ${probeHtml}${errHtml}${ssHtml}
</div>`
  }
}

// 未匹配到测试的截图放到底部
const matchedNames = new Set()
for (const file of vitestData.testResults || []) {
  for (const t of file.assertionResults || []) {
    const prefix = extractTestPrefix(t.fullName)
    if (prefix) allScreenshots.filter(ss => ss.name.startsWith(prefix)).forEach(ss => matchedNames.add(ss.name))
  }
}
const unmatchedSS = allScreenshots.filter(ss => !matchedNames.has(ss.name))
let extraSSHtml = ''
if (unmatchedSS.length > 0) {
  extraSSHtml = '<h2>Other Screenshots</h2><div class="ss-grid">'
  for (const ss of unmatchedSS) {
    extraSSHtml += `<div class="ss-thumb"><img src="${ss.dataUrl}" loading="lazy" onclick="window.open('').document.write('<img src=\\''+this.src+'\\' style=\\'max-width:100%\\'>')" /><div class="ss-label">${esc(ss.name)}</div></div>`
  }
  extraSSHtml += '</div>'
}

const statusIcon = failed > 0 ? '&#x2717;' : '&#x2713;'
const statusCls = failed > 0 ? 'fail' : 'pass'
const ts = basename(runDir)
const fmtTs = ts.length >= 15 ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}` : ts

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Test Report ${fmtTs}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#1a1a1a;padding:24px;max-width:1000px;margin:0 auto}
h1{font-size:20px;font-weight:600;margin-bottom:4px}
h2{font-size:15px;font-weight:600;margin:28px 0 12px;color:#444}
.meta{font-size:13px;color:#666;margin-bottom:16px}
.summary{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:600;padding:8px 16px;border-radius:8px;margin-bottom:20px}
.summary.pass{background:#dcfce7;color:#166534}
.summary.fail{background:#fee2e2;color:#991b1b}
.test-card{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;overflow:hidden;background:#fff}
.test-card.pass{border-left:3px solid #16a34a}
.test-card.fail{border-left:3px solid #dc2626}
.test-header{padding:10px 14px;display:flex;align-items:baseline;gap:8px;font-size:13px;font-weight:500}
.icon{font-weight:bold;font-size:14px}
.test-card.pass .icon{color:#16a34a}
.test-card.fail .icon{color:#dc2626}
.test-name{flex:1}
.dur{color:#999;font-size:12px;font-variant-numeric:tabular-nums}
.probe-detail{padding:0 14px 10px;font-size:12px}
.probe-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.badge{background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:4px;font-size:11px;white-space:nowrap}
.badge-ok{background:#dcfce7;color:#166534}
.badge-err{background:#fee2e2;color:#991b1b}
.probe-section{margin-bottom:6px;line-height:1.5}
.label{color:#888;font-size:11px}
.text-preview{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:11px;line-height:1.5;color:#334155;margin-top:4px;max-height:120px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
.tag{background:#ede9fe;color:#6d28d9;padding:1px 6px;border-radius:3px;font-size:10px;margin-right:4px}
.err{background:#1a1a1a;color:#f87171;padding:8px 10px;margin:0 14px 10px;border-radius:6px;font-size:11px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.ss-row{display:flex;gap:8px;padding:0 14px 10px;overflow-x:auto}
.ss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.ss-thumb{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#fff;min-width:200px;max-width:300px;flex-shrink:0}
.ss-thumb img{width:100%;display:block;cursor:pointer}
.ss-thumb img:hover{opacity:.85}
.ss-label{padding:4px 8px;font-size:10px;color:#888;border-top:1px solid #f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
</head>
<body>
<h1>Browser Test Report</h1>
<div class="meta">${fmtTs} &nbsp;|&nbsp; ${total} tests &nbsp;|&nbsp; ${allScreenshots.length} screenshots</div>
<div class="summary ${statusCls}">${statusIcon} ${passed}/${total} passed${failed ? `, ${failed} failed` : ''}</div>
${testsHtml}
${extraSSHtml}
</body>
</html>`

const outPath = join(runDir, 'index.html')
writeFileSync(outPath, html, 'utf-8')
console.log(`  Report: ${outPath}`)

// ── helpers ──

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function findProbeData(fullName) {
  // 尝试用测试编号匹配 data 文件
  for (const [key, val] of probeDataMap) {
    if (fullName.includes(key)) return val
  }
  // fallback：用编号前缀匹配
  const m = fullName.match(/(\d{3})\s*[—–-]/)
  if (m) {
    for (const [key, val] of probeDataMap) {
      if (key.startsWith(m[1])) return val
    }
  }
  return null
}

function extractTestPrefix(fullName) {
  const m = fullName.match(/(\d{3})/)
  return m ? m[1] : null
}
