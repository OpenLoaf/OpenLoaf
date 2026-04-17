/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Per-session cloud tool mock/capture store — driven by the ai-browser-test
 * skill via /debug/cloud-mock HTTP endpoint. Two modes:
 *
 *   - CAPTURE: on successful tool execute, the result (+ asset files) is
 *     written to a fixture directory under the skill folder.
 *   - MOCK:    on tool execute, fixture output is served back (asset files
 *     copied into the current session) without hitting the SaaS backend.
 *
 * Activation flag — set once at startup, never toggled:
 *   OPENLOAF_CLOUD_MOCK=1    allow the HTTP endpoint to register modes
 * Without the flag, setCaptureMode / setMockMode refuse and the hooks are
 * effective no-ops — production bundles ship inert.
 */
import { promises as fs } from 'node:fs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function cloudMockEnabled(): boolean {
  return process.env.OPENLOAF_CLOUD_MOCK === '1' || process.env.NODE_ENV === 'test'
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type CaptureEntry = {
  mode: 'capture'
  captureDir: string
  meta: Record<string, unknown>
  capturedToolNames: Set<string>
}

type MockEntry = {
  mode: 'mock'
  fixtureDir: string
  toolName: string
  toolOutput: string
}

const store = new Map<string, CaptureEntry | MockEntry>()

export function setCaptureMode(sessionId: string, captureDir: string, meta: Record<string, unknown>) {
  if (!cloudMockEnabled()) throw new Error('cloud mock not enabled')
  if (!path.isAbsolute(captureDir)) throw new Error('captureDir must be absolute')
  store.set(sessionId, { mode: 'capture', captureDir, meta, capturedToolNames: new Set() })
}

export function setMockMode(sessionId: string, fixtureDir: string) {
  if (!cloudMockEnabled()) throw new Error('cloud mock not enabled')
  if (!path.isAbsolute(fixtureDir)) throw new Error('fixtureDir must be absolute')
  const resultPath = path.join(fixtureDir, 'toolResult.json')
  if (!existsSync(resultPath)) throw new Error(`fixture missing toolResult.json: ${fixtureDir}`)
  const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as {
    toolName?: string
    output?: string
  }
  const toolName = String(parsed.toolName ?? '')
  const toolOutput = String(parsed.output ?? '')
  if (!toolName || !toolOutput) throw new Error(`fixture toolResult.json malformed: ${fixtureDir}`)
  store.set(sessionId, { mode: 'mock', fixtureDir, toolName, toolOutput })
}

export function clearMock(sessionId: string) {
  store.delete(sessionId)
}

export function getModeFor(sessionId: string): 'off' | 'capture' | 'mock' {
  return store.get(sessionId)?.mode ?? 'off'
}

// ---------------------------------------------------------------------------
// Mock serve
// ---------------------------------------------------------------------------

/**
 * 若 sessionId 处于 mock 模式且 toolName 与 fixture 一致：
 *   - 拷贝 fixture asset/ 下所有文件到当前 session 的 asset/（文件名不变）
 *   - 把 toolOutput 里出现的 `${CURRENT_CHAT_DIR}/<name>` 路径保持原样返回
 *     （路径模板会在下游由 expandPathTemplateVars 展开到新 session 目录）
 * 否则返回 undefined，由原生 execute 继续处理。
 */
export async function maybeServeCloudMock(params: {
  toolName: string
  sessionId?: string
}): Promise<string | undefined> {
  const { toolName, sessionId } = params
  if (!cloudMockEnabled() || !sessionId) return undefined
  const entry = store.get(sessionId)
  if (!entry || entry.mode !== 'mock') return undefined
  if (entry.toolName !== toolName) return undefined

  try {
    const targetAssetDir = await resolveSessionAssetDir(sessionId)
    await fs.mkdir(targetAssetDir, { recursive: true })
    const srcAssetDir = path.join(entry.fixtureDir, 'asset')
    if (existsSync(srcAssetDir)) {
      const names = await fs.readdir(srcAssetDir)
      for (const name of names) {
        const src = path.join(srcAssetDir, name)
        const dest = path.join(targetAssetDir, name)
        const stat = await fs.stat(src)
        if (!stat.isFile()) continue
        // 覆盖式拷贝，避免 mock 重放时残留旧文件干扰
        await fs.copyFile(src, dest)
      }
    }
    return entry.toolOutput
  } catch (err) {
    logger.warn(
      { err },
      `[cloudMock] mock serve failed for sessionId=${sessionId} tool=${toolName}`,
    )
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * 在 cloud tool execute 成功返回之前调用：若 sessionId 处于 capture 模式，
 * 写 meta.json / toolResult.json / asset/ 到 captureDir。幂等：同一 toolName
 * 只落一次。
 */
export async function maybeCaptureCloudFixture(params: {
  toolName: string
  toolInput: unknown
  toolOutput: string
  sessionId?: string
}): Promise<void> {
  const { toolName, toolInput, toolOutput, sessionId } = params
  if (!cloudMockEnabled() || !sessionId) return
  const entry = store.get(sessionId)
  if (!entry || entry.mode !== 'capture') return
  if (entry.capturedToolNames.has(toolName)) return
  // output 必须是 ok !== false 的 JSON 字符串才采集
  let parsed: any = null
  try { parsed = JSON.parse(toolOutput) } catch { return }
  if (!parsed || parsed.ok === false) return

  const captureDir = entry.captureDir
  try {
    await fs.mkdir(captureDir, { recursive: true })
    await fs.writeFile(
      path.join(captureDir, 'toolResult.json'),
      JSON.stringify({ toolName, input: toolInput ?? null, output: toolOutput }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(captureDir, 'meta.json'),
      JSON.stringify({
        ...entry.meta,
        toolName,
        capturedAt: new Date().toISOString(),
      }, null, 2),
      'utf-8',
    )

    // 复制 output.files[].filePath 引用到的文件 —— 只采集本次调用真正产出
    // 的资源，不把整个 session asset 目录全搬过来（避免污染）。
    const files = Array.isArray(parsed?.files) ? parsed.files : []
    if (files.length > 0) {
      const destAsset = path.join(captureDir, 'asset')
      await fs.mkdir(destAsset, { recursive: true })
      const sessionAssetDir = await resolveSessionAssetDir(sessionId)
      for (const f of files) {
        const fp = typeof f?.filePath === 'string' ? f.filePath : null
        if (!fp) continue
        const name = path.basename(fp.replace(/\$\{CURRENT_CHAT_DIR\}/g, ''))
        if (!name) continue
        const src = path.join(sessionAssetDir, name)
        if (!existsSync(src)) continue
        try {
          await fs.copyFile(src, path.join(destAsset, name))
        } catch (err) {
          logger.warn({ err, src }, '[cloudMock] capture asset copy failed')
        }
      }
    }

    entry.capturedToolNames.add(toolName)
    logger.info(
      { sessionId, toolName, captureDir },
      '[cloudMock] captured cloud tool output',
    )
  } catch (err) {
    logger.warn({ err, sessionId, toolName }, '[cloudMock] capture failed')
  }
}
