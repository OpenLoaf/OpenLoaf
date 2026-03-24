/**
 * 内存监控：定时记录所有 Electron 进程的内存使用情况到文件。
 * 用于排查 V8 OOM 崩溃时定位泄漏进程。
 *
 * - 开发模式：每 5 秒采样，控制台 + 文件
 * - 生产模式：每 60 秒采样，仅文件（不刷控制台）
 *
 * 输出文件：~/.openloaf/debug/memory-monitor.log
 */
import { app, webContents } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const LOG_DIR = path.join(os.homedir(), '.openloaf', 'debug')
const LOG_FILE = path.join(LOG_DIR, 'memory-monitor.log')
const MAX_LINES = 5000

let timer: ReturnType<typeof setInterval> | null = null
let prevTotal = 0

function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

function delta(current: number, prev: number): string {
  const diff = current - prev
  if (Math.abs(diff) < 1024 * 1024) return ''
  const sign = diff > 0 ? '+' : ''
  return ` (${sign}${formatMB(diff)})`
}

function buildPidUrlMap(): Map<number, string> {
  const map = new Map<number, string>()
  try {
    for (const wc of webContents.getAllWebContents()) {
      map.set(wc.getOSProcessId(), wc.getURL())
    }
  } catch { /* ignore */ }
  return map
}

function sample(): string {
  const metrics = app.getAppMetrics()
  const now = new Date().toISOString()
  const mainMem = process.memoryUsage()
  const pidUrlMap = buildPidUrlMap()

  const total = metrics.reduce((sum, m) => sum + m.memory.workingSetSize * 1024, 0)
  const totalDelta = delta(total, prevTotal)
  prevTotal = total

  const lines: string[] = [
    `\n--- ${now} (uptime: ${Math.round(process.uptime())}s) | TOTAL: ${formatMB(total)}MB${totalDelta} ---`,
    `  Main: rss=${formatMB(mainMem.rss)}MB heap=${formatMB(mainMem.heapUsed)}/${formatMB(mainMem.heapTotal)}MB ext=${formatMB(mainMem.external)}MB buf=${formatMB(mainMem.arrayBuffers)}MB`,
  ]

  for (const m of metrics) {
    const mem = m.memory
    const cpu = m.cpu
    const url = pidUrlMap.get(m.pid) || ''
    const urlSuffix = url ? ` url=${url.slice(0, 120)}` : ''
    const tag = m.type === 'Browser'
      ? 'Browser(main)'
      : m.type === 'Tab'
        ? `Renderer(${m.name || 'unknown'})`
        : `${m.type}(${m.name || ''})`

    lines.push(
      `  PID ${m.pid} [${tag}]: wss=${formatMB(mem.workingSetSize * 1024)}MB peak=${formatMB(mem.peakWorkingSetSize * 1024)}MB cpu=${cpu.percentCPUUsage.toFixed(1)}%${urlSuffix}`
    )
  }

  return lines.join('\n')
}

function buildConsoleSummary(): string {
  const metrics = app.getAppMetrics()
  const mainMem = process.memoryUsage()
  const total = metrics.reduce((sum, m) => sum + m.memory.workingSetSize * 1024, 0)
  const pidUrlMap = buildPidUrlMap()

  const parts: string[] = []
  for (const m of metrics) {
    const mem = m.memory
    const url = pidUrlMap.get(m.pid) || ''
    let label: string
    if (m.type === 'Browser') {
      label = 'main'
    } else if (m.type === 'Tab') {
      const short = url.includes('devtools') ? 'devtools' : url.replace(/https?:\/\/[^/]+/, '').slice(0, 30) || m.name || '?'
      label = `renderer(${short})`
    } else if (m.type === 'GPU') {
      label = 'gpu'
    } else {
      label = `${m.type.toLowerCase()}(${m.name || ''})`
    }
    parts.push(`${label}=${formatMB(mem.workingSetSize * 1024)}`)
  }

  return `[mem] total=${formatMB(total)}MB | heap=${formatMB(mainMem.heapUsed)}MB | ${parts.join(' | ')} | up=${Math.round(process.uptime())}s`
}

export function startMemoryMonitor(): void {
  if (timer) return

  const isDev = !app.isPackaged
  const intervalMs = isDev ? 5_000 : 60_000

  fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.writeFileSync(LOG_FILE, `=== Memory Monitor Started at ${new Date().toISOString()} (${isDev ? 'dev' : 'prod'}) ===\n`)

  console.log(`[memory-monitor] Logging to ${LOG_FILE} every ${intervalMs / 1000}s`)

  let lineCount = 0

  timer = setInterval(() => {
    try {
      if (isDev) {
        // 开发模式：写文件 + 控制台
        const entry = sample()
        fs.appendFileSync(LOG_FILE, entry + '\n')
        lineCount += entry.split('\n').length
        console.log(buildConsoleSummary())

        if (lineCount > MAX_LINES) {
          const content = fs.readFileSync(LOG_FILE, 'utf-8')
          const allLines = content.split('\n')
          const keep = allLines.slice(-Math.floor(MAX_LINES * 0.7))
          fs.writeFileSync(LOG_FILE, keep.join('\n'))
          lineCount = keep.length
        }
      } else {
        // 生产模式：仅控制台
        console.log(buildConsoleSummary())
      }
    } catch {
      // 写入失败不影响主流程
    }
  }, intervalMs)

  timer.unref()
}

export function stopMemoryMonitor(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
