/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { createTask, type CreateTaskInput, type TaskConfig, type TaskScope } from './taskConfigService'

const OPENLOAF_DIR = '.openloaf'
const TEMPLATES_DIR = 'task-templates'

// ─── Types ───────────────────────────────────────────────────────────

export type TaskTemplate = {
  id: string
  name: string
  description?: string
  agentName?: string
  defaultPayload?: Record<string, unknown>
  skipPlanConfirm?: boolean
  requiresReview?: boolean
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  tags?: string[]
  triggerMode?: 'manual' | 'scheduled' | 'condition'
  timeoutMs?: number
  createdAt: string
  updatedAt: string
}

export type CreateTemplateInput = Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveTemplatesDir(rootPath: string): string {
  return path.join(rootPath, OPENLOAF_DIR, TEMPLATES_DIR)
}

// ─── Public API ──────────────────────────────────────────────────────

/** List all task templates. */
export function listTemplates(rootPath: string): TaskTemplate[] {
  const dir = resolveTemplatesDir(rootPath)
  if (!existsSync(dir)) return []

  const entries = readdirSync(dir, { withFileTypes: true })
  const results: TaskTemplate[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      const filePath = path.join(dir, entry.name)
      const raw = readFileSync(filePath, 'utf8')
      results.push(JSON.parse(raw) as TaskTemplate)
    } catch {
      // Skip invalid files
    }
  }

  results.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  return results
}

/** Get a single template by ID. */
export function getTemplate(id: string, rootPath: string): TaskTemplate | null {
  const filePath = path.join(resolveTemplatesDir(rootPath), `${id}.json`)
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as TaskTemplate
  } catch {
    return null
  }
}

/** Create a new template. */
export function createTemplate(
  data: CreateTemplateInput,
  rootPath: string,
): TaskTemplate {
  const id = uuidv4()
  const now = new Date().toISOString()
  const dir = resolveTemplatesDir(rootPath)
  mkdirSync(dir, { recursive: true })

  const template: TaskTemplate = {
    id,
    name: data.name,
    description: data.description,
    agentName: data.agentName,
    defaultPayload: data.defaultPayload,
    skipPlanConfirm: data.skipPlanConfirm,
    requiresReview: data.requiresReview,
    priority: data.priority,
    tags: data.tags,
    triggerMode: data.triggerMode,
    timeoutMs: data.timeoutMs,
    createdAt: now,
    updatedAt: now,
  }

  const filePath = path.join(dir, `${id}.json`)
  writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf8')
  return template
}

/** Delete a template by ID. */
export function deleteTemplate(id: string, rootPath: string): boolean {
  const filePath = path.join(resolveTemplatesDir(rootPath), `${id}.json`)
  if (!existsSync(filePath)) return false
  try {
    rmSync(filePath)
    return true
  } catch {
    return false
  }
}

/** Create a task from a template, merging defaults with overrides. */
export function createTaskFromTemplate(
  templateId: string,
  overrides: Partial<CreateTaskInput> & { name?: string },
  rootPath: string,
  scope: TaskScope,
): TaskConfig | null {
  const template = getTemplate(templateId, rootPath)
  if (!template) return null

  const taskInput: CreateTaskInput = {
    name: overrides.name ?? template.name,
    description: overrides.description ?? template.description,
    agentName: overrides.agentName ?? template.agentName,
    payload: overrides.payload ?? template.defaultPayload,
    skipPlanConfirm: overrides.skipPlanConfirm ?? template.skipPlanConfirm,
    requiresReview: overrides.requiresReview ?? template.requiresReview,
    priority: overrides.priority ?? template.priority,
    triggerMode: overrides.triggerMode ?? template.triggerMode ?? 'manual',
    timeoutMs: overrides.timeoutMs ?? template.timeoutMs,
    autoExecute: overrides.autoExecute,
    createdBy: overrides.createdBy ?? 'user',
  }

  return createTask(taskInput, rootPath, scope)
}
