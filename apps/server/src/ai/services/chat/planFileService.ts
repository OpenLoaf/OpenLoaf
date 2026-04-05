/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PlanItem } from '@openloaf/api/types/tools/runtime'
import { readSessionJson, resolveSessionDir } from '@/ai/services/chat/repositories/chatFileStore'
import { resolveSessionAssetDir } from '@/ai/services/chat/repositories/chatSessionPathResolver'
import { withSessionLock } from '@/ai/services/chat/repositories/chatMessagePersistence'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanFileStatus = 'pending' | 'active' | 'completed' | 'abandoned'

export type PlanFileMeta = {
  planNo: number
  status: PlanFileStatus
  actionName: string
  explanation?: string
  createdAt: string
  updatedAt: string
}

export type PlanFileEntry = PlanFileMeta & {
  fileName: string
  filePath: string
}

// ---------------------------------------------------------------------------
// Render: PlanItem[] → Markdown
// ---------------------------------------------------------------------------

/** Render plan data to Markdown string with YAML front matter. */
export function renderPlanMarkdown(input: {
  planNo: number
  status: PlanFileStatus
  actionName: string
  explanation?: string
  plan: PlanItem[]
  createdAt?: string
}): string {
  const now = new Date().toISOString()
  const createdAt = input.createdAt ?? now
  const lines: string[] = [
    '---',
    `planNo: ${input.planNo}`,
    `status: ${input.status}`,
    `createdAt: ${createdAt}`,
    `updatedAt: ${now}`,
    '---',
    '',
    `# ${input.actionName}`,
    '',
  ]

  if (input.explanation) {
    lines.push('## 方案说明', '', input.explanation, '')
  }

  lines.push('## 步骤', '')
  for (let i = 0; i < input.plan.length; i++) {
    const step = input.plan[i]
    if (!step) continue
    lines.push(`${i + 1}. ${step}`)
  }
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Parse YAML front matter from plan markdown. */
export function parsePlanFrontMatter(markdown: string): Partial<PlanFileMeta> {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch?.[1]) return {}
  const result: Record<string, string> = {}
  for (const line of fmMatch[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key && value) result[key] = value
  }
  return {
    planNo: result.planNo ? Number.parseInt(result.planNo, 10) : undefined,
    status: isValidPlanFileStatus(result.status) ? result.status : undefined,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  }
}

/** Parse numbered step list from plan markdown body (matches `N. text` lines). */
export function parsePlanStepsFromMarkdown(markdown: string): string[] {
  const steps: string[] = []
  // Match lines like "1. Step text" after the "## 步骤" heading
  const stepsSection = markdown.match(/##\s*步骤\s*\n([\s\S]*?)(?:\n##|\n---|\z)/)?.[1] ?? markdown
  const lineRegex = /^\d+\.\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = lineRegex.exec(stepsSection)) !== null) {
    const step = match[1]?.trim()
    if (step) steps.push(step)
  }
  return steps
}

export type PlanFileData = {
  content: string
  meta: Partial<PlanFileMeta>
  actionName: string
  explanation?: string
  steps: string[]
  filePath: string
}

/** Read and parse a PLAN file. Returns null if file not found. */
export async function readPlanFile(
  sessionId: string,
  planNo: number,
): Promise<PlanFileData | null> {
  const filePath = await resolvePlanFilePath(sessionId, planNo)
  return readPlanFileFromAbsPath(filePath, planNo)
}

/** Read and parse a PLAN file from an absolute path. planNoHint is used for fallback actionName. */
export async function readPlanFileFromAbsPath(
  absPath: string,
  planNoHint?: number,
): Promise<PlanFileData | null> {
  let content: string
  try {
    content = await fs.readFile(absPath, 'utf-8')
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
  const meta = parsePlanFrontMatter(content)
  const resolvedNo = meta.planNo ?? planNoHint ?? 0
  const headingMatch = content.match(/^#\s+(.+)$/m)
  const actionName = headingMatch?.[1]?.trim() ?? (resolvedNo ? `计划 #${resolvedNo}` : '计划')
  const explanationMatch = content.match(/##\s*方案说明\s*\n\n([\s\S]*?)(?:\n##|\n---)/)?.[1]?.trim()
  const steps = parsePlanStepsFromMarkdown(content)
  return { content, meta, actionName, explanation: explanationMatch, steps, filePath: absPath }
}

/**
 * Resolve a PLAN file's absolute path using the SAME logic as the Write tool,
 * but without requiring RequestContext. Used by tRPC endpoints and history recovery.
 *
 * - Project-bound sessions → <projectRoot>/<planFilePath>
 * - Temp sessions → <sessionDir>/asset/<planFilePath>
 */
export async function resolvePlanFileAbsPath(
  sessionId: string,
  planFilePath: string,
): Promise<string> {
  const trimmed = planFilePath.trim()
  if (!trimmed) throw new Error('planFilePath is required')
  // Strip @{...} / @ prefixes (match Write tool behavior).
  let normalized: string
  if (trimmed.startsWith('@{') && trimmed.endsWith('}')) {
    normalized = trimmed.slice(2, -1)
  } else if (trimmed.startsWith('@')) {
    normalized = trimmed.slice(1)
  } else {
    normalized = trimmed
  }
  if (normalized.startsWith('[')) throw new Error('Project-scoped paths are not supported here')

  // Resolve root: projectRoot if bound, else sessionAssetDir.
  const sessionJson = await readSessionJson(sessionId)
  const projectId = sessionJson?.projectId ?? null
  let rootPath: string
  if (projectId) {
    const projRoot = getProjectRootPath(projectId)
    if (!projRoot) throw new Error('Project not found')
    rootPath = path.resolve(projRoot)
  } else {
    rootPath = path.resolve(await resolveSessionAssetDir(sessionId))
  }

  return path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(rootPath, normalized)
}

/** Derive planNo from a PLAN file path. Matches PLAN_<digits>.md pattern. */
export function derivePlanNoFromPath(planFilePath: string): number {
  const basename = path.basename(planFilePath)
  const match = basename.match(/^PLAN_(\d+)\.md$/)
  if (match?.[1]) return Number.parseInt(match[1], 10)
  return 0
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/** Resolve the file path for a plan file. */
export async function resolvePlanFilePath(
  sessionId: string,
  planNo: number,
): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId)
  return path.join(sessionDir, `PLAN_${planNo}.md`)
}

/** Save plan to PLAN_{no}.md file. */
export async function savePlanFile(
  sessionId: string,
  planNo: number,
  input: {
    actionName: string
    explanation?: string
    plan: PlanItem[]
    status?: PlanFileStatus
    createdAt?: string
  },
): Promise<string> {
  const filePath = await resolvePlanFilePath(sessionId, planNo)
  const content = renderPlanMarkdown({
    planNo,
    status: input.status ?? 'active',
    actionName: input.actionName,
    explanation: input.explanation,
    plan: input.plan,
    createdAt: input.createdAt,
  })
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

/** Mark a plan file's front matter status as abandoned or completed. */
export async function markPlanFileStatus(
  sessionId: string,
  planNo: number,
  status: PlanFileStatus,
): Promise<void> {
  const filePath = await resolvePlanFilePath(sessionId, planNo)
  try {
    let content = await fs.readFile(filePath, 'utf-8')
    content = content.replace(/status:\s*(active|completed|abandoned)/, `status: ${status}`)
    content = content.replace(/updatedAt:\s*.+/, `updatedAt: ${new Date().toISOString()}`)
    await fs.writeFile(filePath, content, 'utf-8')
  } catch (err: any) {
    if (err?.code === 'ENOENT') return
    throw err
  }
}

/**
 * Get the next plan number for a session, incrementing lastPlanNo in session.json.
 * Uses withSessionLock for atomic read-increment-write (no nested writeSessionJson).
 */
export async function getNextPlanNo(sessionId: string): Promise<number> {
  return withSessionLock(sessionId, async () => {
    const sessionDir = await resolveSessionDir(sessionId)
    const sessionJsonPath = path.join(sessionDir, 'session.json')
    let existing: Record<string, unknown> = {}
    try {
      const content = await fs.readFile(sessionJsonPath, 'utf-8')
      existing = JSON.parse(content)
    } catch {
      // File doesn't exist or parse error — start from 0
    }
    const lastPlanNo = typeof existing.lastPlanNo === 'number' ? existing.lastPlanNo : 0
    const nextNo = lastPlanNo + 1
    existing.lastPlanNo = nextNo
    await fs.writeFile(sessionJsonPath, JSON.stringify(existing, null, 2), 'utf-8')
    return nextNo
  })
}

/** List all plan files in a session directory. */
export async function listPlanFiles(sessionId: string): Promise<PlanFileEntry[]> {
  const sessionDir = await resolveSessionDir(sessionId)
  let files: string[]
  try {
    files = await fs.readdir(sessionDir)
  } catch {
    return []
  }
  const planFiles = files
    .filter((f) => /^PLAN_\d+\.md$/.test(f))
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/PLAN_(\d+)/)?.[1] ?? '0', 10)
      const numB = Number.parseInt(b.match(/PLAN_(\d+)/)?.[1] ?? '0', 10)
      return numA - numB
    })

  const entries: PlanFileEntry[] = []
  for (const fileName of planFiles) {
    const filePath = path.join(sessionDir, fileName)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const meta = parsePlanFrontMatter(content)
      const planNo = meta.planNo ?? Number.parseInt(fileName.match(/PLAN_(\d+)/)?.[1] ?? '0', 10)
      // Extract actionName from first heading
      const headingMatch = content.match(/^#\s+(.+)$/m)
      const actionName = headingMatch?.[1]?.trim() ?? `计划 #${planNo}`
      entries.push({
        fileName,
        filePath,
        planNo,
        status: meta.status ?? 'active',
        actionName,
        explanation: undefined,
        createdAt: meta.createdAt ?? '',
        updatedAt: meta.updatedAt ?? '',
      })
    } catch {
      // Skip unreadable files
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidPlanFileStatus(s: string | undefined): s is PlanFileStatus {
  return s === 'pending' || s === 'active' || s === 'completed' || s === 'abandoned'
}
