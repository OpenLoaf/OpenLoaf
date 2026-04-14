/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"
import {
  getProjectRootPath,
} from "@openloaf/api"
import {
  resolveFilePathFromUri,
} from "@openloaf/api/services/vfsService"
import { getResolvedTempStorageDir } from "@openloaf/api/services/appConfigService"
import {
  getProjectMetaPath,
  projectConfigSchema,
  readProjectConfig,
} from "@openloaf/api/services/projectTreeService"

/** Normalize ignoreSkills list for persistence. */
export function normalizeIgnoreSkills(values?: unknown): string[] {
  if (!Array.isArray(values)) return []
  const trimmed = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
  return Array.from(new Set(trimmed))
}

/** Normalize global ignore keys. */
export function normalizeGlobalIgnoreKeys(values?: unknown): string[] {
  const keys = normalizeIgnoreSkills(values)
  return Array.from(new Set(keys.map(normalizeGlobalIgnoreKey).filter(Boolean)))
}

/** Normalize a global ignore key. */
export function normalizeGlobalIgnoreKey(ignoreKey: string): string {
  const trimmed = ignoreKey.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("global:")) return trimmed
  if (trimmed.includes(":")) return ""
  return `global:${trimmed}`
}

/** Build global ignore key from folder name. */
export function buildGlobalIgnoreKey(folderName: string): string {
  const trimmed = folderName.trim()
  return trimmed ? `global:${trimmed}` : ""
}

/** Resolve the global skills directory path (~/.openloaf/skills). */
export function resolveGlobalSkillsPath(): string {
  return path.join(homedir(), ".openloaf", "skills")
}

/** Resolve the global agents directory path (`<tempStorage>/agents`). */
export function resolveGlobalAgentsPath(): string {
  return path.join(getResolvedTempStorageDir(), "agents")
}

/** Build project ignore key from folder name. */
export function buildProjectIgnoreKey(input: {
  folderName: string
  ownerProjectId?: string | null
  currentProjectId?: string | null
}): string {
  const trimmed = input.folderName.trim()
  if (!trimmed) return ""
  if (input.ownerProjectId && input.ownerProjectId !== input.currentProjectId) {
    return `${input.ownerProjectId}:${trimmed}`
  }
  return trimmed
}

/** Read ignoreSkills from project.json. */
export async function readProjectIgnoreSkills(projectRootPath?: string): Promise<string[]> {
  if (!projectRootPath) return []
  try {
    const config = await readProjectConfig(projectRootPath)
    return normalizeIgnoreSkills(config.ignoreSkills)
  } catch {
    return []
  }
}

/** Read projectId from project.json. */
export async function readProjectIdFromMeta(projectRootPath: string): Promise<string | null> {
  try {
    const metaPath = getProjectMetaPath(projectRootPath)
    const raw = JSON.parse(await fs.readFile(metaPath, "utf-8")) as {
      projectId?: string
    }
    const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : ""
    return projectId || null
  } catch {
    return null
  }
}

/** Write JSON file atomically. */
export async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`
  // 原子写入避免读取到半写入状态。
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8")
  await fs.rename(tmpPath, filePath)
}

/** Update ignoreSkills in project.json. */
export async function updateProjectIgnoreSkills(input: {
  projectRootPath: string
  ignoreKey: string
  enabled: boolean
}): Promise<void> {
  const metaPath = getProjectMetaPath(input.projectRootPath)
  const raw = await fs.readFile(metaPath, "utf-8")
  const parsed = projectConfigSchema.parse(JSON.parse(raw))
  const current = normalizeIgnoreSkills(parsed.ignoreSkills)
  const normalizedKey = input.ignoreKey.trim()
  if (!normalizedKey) return
  const nextIgnoreSkills = input.enabled
    ? current.filter((name) => name !== normalizedKey)
    : Array.from(new Set([...current, normalizedKey]))
  // 保留原有字段，仅更新 ignoreSkills。
  await writeJsonAtomic(metaPath, { ...parsed, ignoreSkills: nextIgnoreSkills })
}

/** Read ignoreSkills from global app config. */
export async function readGlobalIgnoreSkills(): Promise<string[]> {
  try {
    const { getAppConfig } = await import("@openloaf/api/services/appConfigService")
    const config = getAppConfig()
    return normalizeGlobalIgnoreKeys(config.ignoreSkills)
  } catch {
    return []
  }
}

/** Update ignoreSkills in global app config. */
export async function updateGlobalIgnoreSkills(input: { ignoreKey: string; enabled: boolean }): Promise<void> {
  const { getAppConfig, setAppConfig } = await import("@openloaf/api/services/appConfigService")
  const config = getAppConfig()
  const normalizedKey = normalizeGlobalIgnoreKey(input.ignoreKey)
  if (!normalizedKey) return
  const current = normalizeGlobalIgnoreKeys(config.ignoreSkills)
  const nextIgnoreSkills = input.enabled
    ? current.filter((name) => name !== normalizedKey)
    : Array.from(new Set([...current, normalizedKey]))
  setAppConfig({ ...config, ignoreSkills: nextIgnoreSkills })
}

/** Normalize an absolute path for comparison. */
export function normalizeFsPath(input: string): string {
  return path.resolve(input)
}

/** Normalize skill path input to a filesystem path. */
export function normalizeSkillPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("file://")) {
    return resolveFilePathFromUri(trimmed)
  }
  return normalizeFsPath(trimmed)
}

/** Resolve skill directory and scope root for deletion. */
export function resolveSkillDeleteTarget(input: {
  scope: "global" | "project"
  projectId?: string
  skillPath: string
}): { skillDir: string; skillsRoot: string } {
  const normalizedSkillPath = normalizeSkillPath(input.skillPath)
  if (!normalizedSkillPath || path.basename(normalizedSkillPath) !== "SKILL.md") {
    // 只允许删除技能目录，必须传入 SKILL.md 的路径。
    throw new Error("Invalid skill path.")
  }
  const skillDir = normalizeFsPath(path.dirname(normalizedSkillPath))

  // global scope 直接用 resolveGlobalSkillsPath()，避免 getOpenLoafRootDir() + ".openloaf" 双重拼接。
  let skillsRoot: string
  if (input.scope === "global") {
    skillsRoot = normalizeFsPath(resolveGlobalSkillsPath())
  } else {
    const projectRootPath = input.projectId
      ? getProjectRootPath(input.projectId) ?? ""
      : ""
    if (!projectRootPath) {
      throw new Error("Project not found.")
    }
    skillsRoot = normalizeFsPath(path.join(projectRootPath, ".openloaf", "skills"))
  }

  if (skillDir === skillsRoot || !skillDir.startsWith(`${skillsRoot}${path.sep}`)) {
    // 仅允许删除 .openloaf/skills 目录内的技能。
    throw new Error("Skill path is outside scope.")
  }
  return { skillDir, skillsRoot }
}

/** Resolve agent directory and scope root for deletion. */
export function resolveAgentDeleteTarget(input: {
  scope: "global" | "project"
  projectId?: string
  agentPath: string
}): { agentDir: string; agentsRoot: string } {
  const normalizedAgentPath = normalizeSkillPath(input.agentPath)
  if (!normalizedAgentPath) {
    throw new Error("Invalid agent path.")
  }
  const baseName = path.basename(normalizedAgentPath)
  // 支持 agent.json（新结构）和 AGENT.md（旧兼容）两种路径。
  const isOpenLoafAgent = baseName === "agent.json"
  const isLegacyAgent = baseName === "AGENT.md"
  if (!isOpenLoafAgent && !isLegacyAgent) {
    throw new Error("Invalid agent path.")
  }
  // Resolve scope root. Global agents live at <tempStorage>/agents/; project
  // agents live at <projectRoot>/.openloaf/agents/.
  let agentsRoot: string
  if (input.scope === "global") {
    agentsRoot = normalizeFsPath(resolveGlobalAgentsPath())
  } else {
    const projectRootPath = input.projectId
      ? getProjectRootPath(input.projectId) ?? ""
      : ""
    if (!projectRootPath) {
      throw new Error("Project not found.")
    }
    agentsRoot = normalizeFsPath(path.join(projectRootPath, ".openloaf", "agents"))
  }
  const agentDir = normalizeFsPath(path.dirname(normalizedAgentPath))
  if (agentDir === agentsRoot || !agentDir.startsWith(`${agentsRoot}${path.sep}`)) {
    throw new Error("Agent path is outside scope.")
  }
  return { agentDir, agentsRoot }
}

/** Resolve owner project id from skill path. */
export function resolveOwnerProjectId(input: {
  skillPath: string
  candidates: Array<{ rootPath: string; projectId: string }>
}): string | null {
  const normalizedSkillPath = normalizeFsPath(input.skillPath)
  let matched: { rootPath: string; projectId: string } | null = null
  for (const candidate of input.candidates) {
    const normalizedRoot = normalizeFsPath(candidate.rootPath)
    if (
      normalizedSkillPath === normalizedRoot ||
      normalizedSkillPath.startsWith(`${normalizedRoot}${path.sep}`)
    ) {
      if (!matched || normalizedRoot.length > matched.rootPath.length) {
        matched = { rootPath: normalizedRoot, projectId: candidate.projectId }
      }
    }
  }
  return matched?.projectId ?? null
}
