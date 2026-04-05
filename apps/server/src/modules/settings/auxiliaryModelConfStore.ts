/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getOpenLoafRootDir } from '@openloaf/config'

/** Persisted capability overrides (only customPrompt for now). */
export type CapabilityOverride = {
  customPrompt?: string | null
}

/** Shape of ~/.openloaf/auxiliary-model.json */
export type AuxiliaryModelConf = {
  modelSource: 'local' | 'cloud' | 'saas'
  localModelIds: string[]
  cloudModelIds: string[]
  capabilities: Record<string, CapabilityOverride>
}

const DEFAULT_CONF: AuxiliaryModelConf = {
  modelSource: 'saas',
  localModelIds: [],
  cloudModelIds: [],
  capabilities: {},
}

function getAuxiliaryModelPath(): string {
  return path.join(getOpenLoafRootDir(), 'auxiliary-model.json')
}

function readJsonSafely<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(filePath: string, payload: unknown): void {
  const tmpPath = `${filePath}.${Date.now()}.tmp`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

function normalize(raw: unknown): AuxiliaryModelConf {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_CONF }
  const src = raw as Record<string, unknown>
  const modelSource =
    src.modelSource === 'cloud' ? 'cloud' as const
    : src.modelSource === 'saas' ? 'saas' as const
    : 'local' as const
  const localModelIds = Array.isArray(src.localModelIds)
    ? src.localModelIds.filter((v): v is string => typeof v === 'string')
    : []
  const cloudModelIds = Array.isArray(src.cloudModelIds)
    ? src.cloudModelIds.filter((v): v is string => typeof v === 'string')
    : []
  const rawCaps = src.capabilities && typeof src.capabilities === 'object' && !Array.isArray(src.capabilities)
    ? (src.capabilities as Record<string, unknown>)
    : {}
  const capabilities: Record<string, CapabilityOverride> = {}
  for (const [key, val] of Object.entries(rawCaps)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue
    const cap = val as Record<string, unknown>
    capabilities[key] = {
      customPrompt:
        typeof cap.customPrompt === 'string' ? cap.customPrompt :
        cap.customPrompt === null ? null : undefined,
    }
  }
  return { modelSource, localModelIds, cloudModelIds, capabilities }
}

/** Read auxiliary model config from ~/.openloaf/auxiliary-model.json */
export function readAuxiliaryModelConf(): AuxiliaryModelConf {
  const raw = readJsonSafely<unknown>(getAuxiliaryModelPath(), null)
  return normalize(raw)
}

/** Write auxiliary model config to ~/.openloaf/auxiliary-model.json */
export function writeAuxiliaryModelConf(conf: AuxiliaryModelConf): void {
  writeJson(getAuxiliaryModelPath(), normalize(conf))
}
