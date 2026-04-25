/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * 模型延迟基准测试 — 对每个可用模型跑一条短 prompt，记录 TTFT 与总耗时。
 *
 * 每次运行产出：
 *   apps/server/scripts/bench-runs/<timestamp>/run.json  (单次运行原始数据)
 *   apps/server/scripts/bench-runs/index.html            (聚合所有历史的静态查看器)
 *
 * 用法：
 *   pnpm --filter server bench:models                       # 本地 + 云端全跑
 *   pnpm --filter server bench:models -- --cloud-only
 *   pnpm --filter server bench:models -- --local-only
 *   pnpm --filter server bench:models -- --filter qwen      # chatModelId 正则过滤
 *   pnpm --filter server bench:models -- --label "v2 test"  # 本次 run 的备注
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { streamText, type LanguageModel } from 'ai'
import { resolveChatModel } from '../src/ai/models/resolveChatModel'
import { getProviderSettings } from '../src/modules/settings/settingsService'
import { fetchModelList } from '../src/modules/saas'
import { ensureServerAccessToken } from '../src/modules/auth/tokenStore'
import {
  mapCloudChatModels,
  type CloudChatModelsResponse,
} from '../src/ai/models/cloudModelMapper'
import { installHttpProxy } from '../src/modules/proxy/httpProxy'

installHttpProxy()

const PROMPT = 'Hi'
// 逻辑：100 tokens 给 reasoning 模型（DeepSeek-reasoner / Kimi-thinking 等）留足"思考 + 回答"的空间。
// 更小的预算会让思考吃完后连一个文本字都吐不出来，TTFT 可以测但文本输出会完全空。
const MAX_OUTPUT_TOKENS = 100
const TIMEOUT_MS = 30_000

// 尝试关闭 provider 支持的 thinking 模式 — 实测 curl 直打 SaaS 验证过各字段生效性：
//   - DeepSeek v4-flash 接受 `thinking: {type: "disabled"}`（@ai-sdk/deepseek 原生映射），
//     `enable_thinking: false` / `reasoning: false` 不被识别。
//   - Qwen 系用 `enable_thinking: false`（@ai-sdk/alibaba 映射）。
//   - Moonshot/Kimi 同样走 `thinking: {type: "disabled"}` + `reasoningHistory: "disabled"`。
// AI SDK 按 provider key 匹配，不匹配的键被忽略，放一块做并集即可。
const DISABLE_THINKING_PROVIDER_OPTIONS = {
  alibaba: { enableThinking: false },
  qwen: { enableThinking: false },
  dashscope: { enableThinking: false },
  deepseek: { thinking: { type: 'disabled' } },
  moonshotai: { reasoningHistory: 'disabled', thinking: { type: 'disabled' } },
  anthropic: { thinking: { type: 'disabled' } },
  google: { thinkingConfig: { thinkingBudget: 0 } },
  openai: { reasoningEffort: 'minimal' },
} as const

const RUNS_DIR = path.resolve(import.meta.dirname, 'bench-runs')

type Source = 'local' | 'cloud'
type Entry = {
  source: Source
  chatModelId: string
  /** Human-friendly model name (e.g. "Qwen Flash")，SaaS 模型列表里的 `name` 字段。 */
  name?: string
}
type Result = Entry & {
  /**
   * 首字节时间 — 从请求发出到收到模型**第一个任何类型的 delta**（reasoning / text / tool-call）。
   * 对 reasoning 模型来说这是"思考开始"的时间，对普通模型就是"文本开始"的时间。
   * 选 fullStream 而非 textStream 是因为：DeepSeek Reasoner / Kimi-thinking 会先吐一大段
   * reasoning_content 再出 content，如果只看 text 会把"模型响应性"误读成"0 ms 或失败"。
   */
  ttftMs: number | null
  /** 首个可见文本（content）到达时间 — 对非 reasoning 模型通常 == ttftMs。 */
  ttftTextMs: number | null
  /** 整个流读完的时间。 */
  totalMs: number | null
  /** 可见文本的字符数（不含 reasoning_content）。 */
  outputChars: number
  /** reasoning_content 的字符数 — 用来看"模型有没有光思考不回答"。 */
  reasoningChars: number
  error?: string
}

type RunFile = {
  schema: 1
  runId: string
  startedAt: string
  finishedAt: string
  label?: string
  prompt: string
  maxOutputTokens: number
  timeoutMs: number
  results: Result[]
}

async function listLocal(): Promise<Entry[]> {
  const providers = await getProviderSettings()
  const out: Entry[] = []
  for (const p of providers) {
    for (const [modelId, def] of Object.entries(p.models ?? {})) {
      out.push({
        source: 'local',
        chatModelId: `${p.id}:${modelId}`,
        name: def?.name,
      })
    }
  }
  return out
}

async function listCloud(): Promise<Entry[]> {
  const token = (await ensureServerAccessToken()) ?? ''
  if (!token) {
    console.warn('[bench] 未登录 SaaS，跳过云端模型')
    return []
  }
  const payload = (await fetchModelList(token)) as CloudChatModelsResponse | null
  if (!payload || payload.success !== true || !Array.isArray(payload.data?.data)) {
    console.warn('[bench] 云端模型列表获取失败')
    return []
  }
  const models = mapCloudChatModels(payload.data.data)
  return models.map<Entry>((m) => ({
    source: 'cloud',
    chatModelId: `${m.providerId}:${m.id}`,
    name: m.name,
  }))
}

async function benchmark(entry: Entry): Promise<Result> {
  let model: LanguageModel
  try {
    const resolved = await resolveChatModel({
      chatModelId: entry.chatModelId,
      chatModelSource: entry.source,
    })
    model = resolved.model as LanguageModel
  } catch (err) {
    return {
      ...entry,
      ttftMs: null,
      ttftTextMs: null,
      totalMs: null,
      outputChars: 0,
      reasoningChars: 0,
      error: `resolve: ${(err as Error).message}`,
    }
  }

  const start = performance.now()
  let firstDeltaAt: number | null = null
  let firstTextAt: number | null = null
  let outputChars = 0
  let reasoningChars = 0
  try {
    const stream = streamText({
      model,
      prompt: PROMPT,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: DISABLE_THINKING_PROVIDER_OPTIONS,
    })
    // 用 fullStream 而非 textStream：覆盖 reasoning-delta / text-delta / tool-call 等所有
    // 数据块。DeepSeek Reasoner 这种把答案放在 reasoning_content 的模型，textStream 会空走，
    // 但 fullStream 能看到 reasoning chunk — 用它做 TTFT 才反映真实的"模型响应性"。
    for await (const part of stream.fullStream) {
      if (part.type === 'text-delta') {
        if (firstDeltaAt === null) firstDeltaAt = performance.now()
        if (firstTextAt === null) firstTextAt = performance.now()
        outputChars += part.text.length
      } else if (part.type === 'reasoning-delta') {
        if (firstDeltaAt === null) firstDeltaAt = performance.now()
        reasoningChars += part.text.length
      }
    }
    const end = performance.now()
    const finishReason = await stream.finishReason
    // 只有当流压根没任何数据（reasoning 也没出）且 finishReason 是异常状态，才算失败。
    // reasoning 模型把预算全花在思考上是"成功但被 max_tokens 截断"，不是错误。
    if (firstDeltaAt === null && finishReason !== 'stop' && finishReason !== 'length') {
      return {
        ...entry,
        ttftMs: null,
        ttftTextMs: null,
        totalMs: Math.round(end - start),
        outputChars: 0,
        reasoningChars: 0,
        error: `finishReason=${finishReason}`,
      }
    }
    return {
      ...entry,
      ttftMs: firstDeltaAt ? Math.round(firstDeltaAt - start) : null,
      ttftTextMs: firstTextAt ? Math.round(firstTextAt - start) : null,
      totalMs: Math.round(end - start),
      outputChars,
      reasoningChars,
    }
  } catch (err) {
    return {
      ...entry,
      ttftMs: firstDeltaAt ? Math.round(firstDeltaAt - start) : null,
      ttftTextMs: firstTextAt ? Math.round(firstTextAt - start) : null,
      totalMs: null,
      outputChars,
      reasoningChars,
      error: (err as Error).message.slice(0, 160),
    }
  }
}

type Options = {
  includeLocal: boolean
  includeCloud: boolean
  filter?: RegExp
  label?: string
}

function parseArgs(): Options {
  const argv = process.argv.slice(2)
  const opts: Options = { includeLocal: true, includeCloud: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--cloud-only') opts.includeLocal = false
    else if (a === '--local-only') opts.includeCloud = false
    else if (a === '--filter') opts.filter = new RegExp(argv[++i] ?? '', 'i')
    else if (a === '--label') opts.label = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log(
        '用法：pnpm --filter server bench:models [-- --cloud-only|--local-only] [-- --filter <regex>] [-- --label <名称>]',
      )
      process.exit(0)
    }
  }
  return opts
}

function formatRunId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function writeRunFile(run: RunFile): string {
  const runDir = path.join(RUNS_DIR, run.runId)
  mkdirSync(runDir, { recursive: true })
  const jsonPath = path.join(runDir, 'run.json')
  writeFileSync(jsonPath, JSON.stringify(run, null, 2))
  return jsonPath
}

function loadAllRuns(): RunFile[] {
  if (!tryStat(RUNS_DIR)) return []
  const runs: RunFile[] = []
  for (const name of readdirSync(RUNS_DIR)) {
    const jsonPath = path.join(RUNS_DIR, name, 'run.json')
    if (!tryStat(jsonPath)) continue
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as RunFile
      if (parsed && parsed.schema === 1) runs.push(parsed)
    } catch {
      /* skip malformed */
    }
  }
  return runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}

function tryStat(p: string) {
  try {
    return statSync(p)
  } catch {
    return null
  }
}

function writeIndexHtml(runs: RunFile[]): string {
  const outPath = path.join(RUNS_DIR, 'index.html')
  const html = renderHtml(runs)
  mkdirSync(RUNS_DIR, { recursive: true })
  writeFileSync(outPath, html)
  return outPath
}

function renderHtml(runs: RunFile[]): string {
  // 将所有 run 作为 JSON 内嵌，单文件 file:// 可直接打开。
  const data = JSON.stringify(runs)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>模型延迟基准测试</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --bg: #f2f2ee;
    --panel: #ffffff;
    --ink: #111;
    --muted: #6b6b6b;
    --line: #ddd;
    --accent: #ff4b1f;
    --local: #2b7a4b;
    --cloud: #2357b5;
    --err: #c42b2b;
    --content-max: 1280px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
    background: var(--bg);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  /* 等宽字体仅用于数字列与 ID，其它文字用中文优先 sans-serif，中英混排更顺眼。 */
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  header {
    padding: 18px 24px;
    border-bottom: 1px solid var(--line);
    background: var(--ink);
    color: #fff;
  }
  header .inner {
    max-width: var(--content-max);
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  header h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  header .meta { font-size: 11px; color: #aaa; }
  main {
    max-width: var(--content-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: calc(100vh - 55px);
    background: var(--bg);
  }
  aside {
    border-right: 1px solid var(--line);
    background: var(--panel);
    overflow-y: auto;
    padding: 12px;
  }
  aside h2 {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--muted);
    margin: 8px 6px 10px;
    font-weight: 600;
  }
  .run-item {
    display: block;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 4px;
  }
  .run-item:hover { background: #f7f7f2; }
  .run-item.active {
    border-color: var(--ink);
    background: #fff;
  }
  .run-item .time { font-size: 12px; font-weight: 600; font-family: ui-monospace, Menlo, monospace; }
  .run-item .sub {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  section.content {
    padding: 24px;
    overflow-y: auto;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px 14px;
  }
  .stat .label {
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 6px;
    font-weight: 500;
  }
  .stat .value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat .value.dim { color: var(--muted); font-weight: 500; }
  .stat .value .unit { font-size: 11px; color: var(--muted); margin-left: 3px; font-weight: 500; }
  .toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 12px;
  }
  .toolbar input[type="search"] {
    flex: 1;
    max-width: 300px;
    padding: 7px 10px;
    font: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
  }
  .toolbar select {
    padding: 7px 10px;
    font: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }
  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: none; }
  th {
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--muted);
    cursor: pointer;
    background: #fafaf6;
    user-select: none;
    font-weight: 600;
  }
  th.sorted::after { content: ' ↓'; }
  th.sorted.asc::after { content: ' ↑'; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, Menlo, monospace; }
  td.model .name { font-weight: 600; }
  td.model .id { font-size: 11px; color: var(--muted); margin-left: 8px; font-family: ui-monospace, Menlo, monospace; }
  .tag {
    display: inline-block;
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 3px;
    font-weight: 600;
  }
  .tag.local { color: var(--local); background: #e9f3ec; }
  .tag.cloud { color: var(--cloud); background: #e7edf8; }
  .err { color: var(--err); }
  .warn { color: #b57400; background: #fff4e0; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .bar {
    display: inline-block;
    height: 4px;
    background: var(--accent);
    border-radius: 2px;
    vertical-align: middle;
    margin-right: 6px;
  }
  .empty {
    padding: 60px;
    text-align: center;
    color: var(--muted);
  }
</style>
</head>
<body>
<header>
  <div class="inner">
    <h1>模型延迟基准测试</h1>
    <span class="meta" id="header-meta"></span>
  </div>
</header>
<main>
  <aside>
    <h2>运行记录（${runs.length}）</h2>
    <div id="run-list"></div>
  </aside>
  <section class="content">
    <div id="content"></div>
  </section>
</main>
<script id="run-data" type="application/json">${escapeScriptJson(data)}</script>
<script>
${browserScript()}
</script>
</body>
</html>`
}

function escapeScriptJson(json: string): string {
  // 防止 </script> 出现在数据里提前终止脚本。
  return json.replace(/<\/(script)/gi, '<\\/$1')
}

function browserScript(): string {
  return `
const runs = JSON.parse(document.getElementById('run-data').textContent || '[]');
const runList = document.getElementById('run-list');
const content = document.getElementById('content');
const headerMeta = document.getElementById('header-meta');

const SOURCE_LABEL = { local: '本地', cloud: '云端' };

let activeIdx = 0;
let sortKey = 'ttftMs';
let sortAsc = true;
let filter = '';
let sourceFilter = 'all';

function render() {
  if (!runs.length) {
    content.innerHTML = '<div class="empty">还没有历史运行。跑一次 <code>pnpm --filter server bench:models</code> 后刷新。</div>';
    return;
  }
  const run = runs[activeIdx];
  headerMeta.textContent = run.startedAt.slice(0,19).replace('T',' ') + ' · ' + run.results.length + ' 个模型';

  runList.innerHTML = runs.map((r, i) => {
    const ok = r.results.filter(x => !x.error).length;
    const total = r.results.length;
    return '<div class="run-item ' + (i===activeIdx?'active':'') + '" data-idx="'+i+'">'
      + '<div class="time">' + r.startedAt.slice(0,19).replace('T',' ') + '</div>'
      + '<div class="sub">' + ok + '/' + total + ' 成功' + (r.label ? ' · ' + escapeHtml(r.label) : '') + '</div>'
      + '</div>';
  }).join('');
  runList.querySelectorAll('.run-item').forEach(el => {
    el.addEventListener('click', () => { activeIdx = Number(el.dataset.idx); render(); });
  });

  const rs = run.results;
  const ok = rs.filter(r => !r.error);
  const ttfts = ok.map(r => r.ttftMs).filter(x => x != null).sort((a,b)=>a-b);
  const totals = ok.map(r => r.totalMs).filter(x => x != null).sort((a,b)=>a-b);
  const p = (arr, q) => arr.length ? arr[Math.floor(arr.length*q)] : null;

  const stats = [
    { label: '模型总数', value: rs.length, dim: false },
    { label: '成功', value: ok.length + ' / ' + rs.length, dim: false },
    { label: '首字节 P50', value: p(ttfts, 0.5) ?? '-', suffix: 'ms', dim: false },
    { label: '首字节 P95', value: p(ttfts, 0.95) ?? '-', suffix: 'ms', dim: false },
    { label: '总耗时 P50', value: p(totals, 0.5) ?? '-', suffix: 'ms', dim: true },
    { label: '提示词', value: '"' + run.prompt + '"', dim: true },
    { label: '最大 Token', value: run.maxOutputTokens, dim: true },
  ];

  const maxTtft = ttfts.length ? ttfts[ttfts.length - 1] : 1;

  let rows = [...rs];
  if (filter) {
    const q = filter.toLowerCase();
    rows = rows.filter(r => r.chatModelId.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q));
  }
  if (sourceFilter !== 'all') rows = rows.filter(r => r.source === sourceFilter);
  rows.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    // 按 model 列排序时用 name || chatModelId 的展示值
    if (sortKey === 'chatModelId') { av = a.name || a.chatModelId; bv = b.name || b.chatModelId; }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  const sortClass = k => sortKey === k ? ('sorted ' + (sortAsc ? 'asc' : '')) : '';

  content.innerHTML =
    '<div class="stats">' + stats.map(s =>
      '<div class="stat"><div class="label">' + s.label + '</div><div class="value' + (s.dim?' dim':'') + '">'
      + escapeHtml(String(s.value)) + (s.suffix ? '<span class="unit">'+s.suffix+'</span>' : '')
      + '</div></div>'
    ).join('') + '</div>' +
    '<div class="toolbar">' +
      '<input type="search" id="filter-input" placeholder="按名称或 ID 过滤…" value="' + escapeHtml(filter) + '" />' +
      '<select id="source-filter">' +
        '<option value="all"' + (sourceFilter==='all'?' selected':'') + '>全部</option>' +
        '<option value="local"' + (sourceFilter==='local'?' selected':'') + '>仅本地</option>' +
        '<option value="cloud"' + (sourceFilter==='cloud'?' selected':'') + '>仅云端</option>' +
      '</select>' +
      '<span style="color:var(--muted);font-size:11px">显示 ' + rows.length + ' / ' + rs.length + '</span>' +
    '</div>' +
    '<table>' +
      '<thead><tr>' +
        '<th data-k="source" class="' + sortClass('source') + '">来源</th>' +
        '<th data-k="chatModelId" class="' + sortClass('chatModelId') + '">模型</th>' +
        '<th data-k="ttftMs" class="num ' + sortClass('ttftMs') + '">首字节</th>' +
        '<th data-k="totalMs" class="num ' + sortClass('totalMs') + '">总耗时</th>' +
        '<th data-k="outputChars" class="num ' + sortClass('outputChars') + '">字符数</th>' +
        '<th>状态</th>' +
      '</tr></thead>' +
      '<tbody>' + rows.map(r => {
        const pct = r.ttftMs != null ? Math.max(4, Math.round((r.ttftMs / maxTtft) * 120)) : 0;
        const displayName = r.name || r.chatModelId;
        const idSub = r.name ? '<span class="id">' + escapeHtml(r.chatModelId) + '</span>' : '';
        // 仅思考：有 reasoning 但没产出可见文本 — 对 reasoning 模型来说首字节是思考块。
        const reasoningOnly = r.outputChars === 0 && (r.reasoningChars || 0) > 0;
        let statusCell;
        if (r.error) statusCell = '<span class="err">' + escapeHtml(r.error) + '</span>';
        else if (reasoningOnly) statusCell = '<span class="warn">仅思考 (' + r.reasoningChars + ' 字)</span>';
        else if ((r.reasoningChars || 0) > 0) statusCell = '成功 (思考 ' + r.reasoningChars + ')';
        else statusCell = '成功';
        return '<tr>' +
          '<td><span class="tag ' + r.source + '">' + SOURCE_LABEL[r.source] + '</span></td>' +
          '<td class="model"><span class="name">' + escapeHtml(displayName) + '</span>' + idSub + '</td>' +
          '<td class="num">' + (r.ttftMs != null ? ('<span class="bar" style="width:'+pct+'px"></span>' + r.ttftMs + ' ms') : '—') + '</td>' +
          '<td class="num">' + (r.totalMs != null ? r.totalMs + ' ms' : '—') + '</td>' +
          '<td class="num">' + r.outputChars + '</td>' +
          '<td>' + statusCell + '</td>' +
        '</tr>';
      }).join('') + '</tbody>' +
    '</table>';

  content.querySelectorAll('th[data-k]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = true; }
      render();
    });
  });
  const fi = document.getElementById('filter-input');
  fi.addEventListener('input', e => { filter = e.target.value; render(); fi.focus(); fi.setSelectionRange(fi.value.length, fi.value.length); });
  document.getElementById('source-filter').addEventListener('change', e => { sourceFilter = e.target.value; render(); });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

render();
`
}

async function main() {
  const opts = parseArgs()
  const entries: Entry[] = []
  if (opts.includeLocal) entries.push(...(await listLocal()))
  if (opts.includeCloud) entries.push(...(await listCloud()))
  const filtered = opts.filter ? entries.filter((e) => opts.filter!.test(e.chatModelId)) : entries

  console.log(
    `[bench] ${filtered.length} 个模型 — prompt="${PROMPT}" max_tokens=${MAX_OUTPUT_TOKENS} timeout=${TIMEOUT_MS}ms`,
  )
  console.log('─'.repeat(110))

  const startedAt = new Date()
  const runId = formatRunId(startedAt)
  const results: Result[] = []
  for (const e of filtered) {
    process.stdout.write(`[${e.source}] ${e.chatModelId.padEnd(60)} `)
    const r = await benchmark(e)
    results.push(r)
    if (r.error) {
      console.log(`❌  ${r.error}`)
    } else {
      const noteParts: string[] = []
      if (r.reasoningChars > 0) noteParts.push(`reasoning ${r.reasoningChars}`)
      if (r.outputChars === 0 && r.reasoningChars > 0) noteParts.push('仅思考无回答')
      const note = noteParts.length > 0 ? `  [${noteParts.join(', ')}]` : ''
      console.log(
        `TTFT ${String(r.ttftMs ?? '-').padStart(5)}ms  total ${String(r.totalMs ?? '-').padStart(6)}ms  chars ${r.outputChars}${note}`,
      )
    }
  }
  const finishedAt = new Date()

  const ok = results.filter((r) => !r.error && r.ttftMs != null)
  console.log('─'.repeat(110))
  console.log(`完成：${ok.length}/${results.length} 成功，耗时 ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)}s`)
  if (ok.length > 0) {
    const sorted = [...ok].sort((a, b) => a.ttftMs! - b.ttftMs!)
    console.log('\nTTFT 最快 Top 5：')
    for (const r of sorted.slice(0, 5)) {
      console.log(`  ${String(r.ttftMs).padStart(5)}ms  [${r.source}] ${r.chatModelId}`)
    }
    console.log('\nTTFT 最慢 Top 5：')
    for (const r of sorted.slice(-5).reverse()) {
      console.log(`  ${String(r.ttftMs).padStart(5)}ms  [${r.source}] ${r.chatModelId}`)
    }
  }

  const runFile: RunFile = {
    schema: 1,
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    label: opts.label,
    prompt: PROMPT,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    timeoutMs: TIMEOUT_MS,
    results,
  }

  const runJsonPath = writeRunFile(runFile)
  const allRuns = loadAllRuns()
  const htmlPath = writeIndexHtml(allRuns)

  console.log(`\n[bench] 写入：`)
  console.log(`  run  → ${runJsonPath}`)
  console.log(`  view → file://${htmlPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
