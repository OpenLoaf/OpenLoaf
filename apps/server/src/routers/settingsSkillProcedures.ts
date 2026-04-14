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
import {
  getProjectRootPath,
  settingSchemas,
  shieldedProcedure,
} from "@openloaf/api"
import {
  resolveFilePathFromUri,
} from "@openloaf/api/services/vfsService"
import {
  resolveProjectAncestorRootUris,
} from "@openloaf/api/services/projectDbService"
import { prisma } from "@openloaf/db"
import { loadSkillSummaries } from "@/ai/services/skillsLoader"
import { getErrorMessage } from "@/shared/errorMessages"
import {
  buildGlobalIgnoreKey,
  buildProjectIgnoreKey,
  normalizeFsPath,
  normalizeSkillPath,
  readGlobalIgnoreSkills,
  readProjectIdFromMeta,
  readProjectIgnoreSkills,
  resolveGlobalSkillsPath,
  resolveOwnerProjectId,
  resolveSkillDeleteTarget,
  updateGlobalIgnoreSkills,
  updateProjectIgnoreSkills,
} from "./settingsHelpers"

/**
 * Skill-related tRPC procedures for the settings router.
 * Extracted from settings.ts for maintainability.
 */
export const skillProcedures = {
  /** List skills for settings UI. */
  getSkills: shieldedProcedure
    .input(settingSchemas.getSkills.input)
    .output(settingSchemas.getSkills.output)
    .query(async ({ input }) => {
      const globalIgnoreSkills = await readGlobalIgnoreSkills()

      // --- Project-scoped query: load project + parent + global skills ---
      if (input?.projectId) {
        const projectRootPath = getProjectRootPath(input.projectId) ?? undefined
        const parentProjectRootUris = await resolveProjectAncestorRootUris(prisma, input.projectId)
        const parentRootEntries = parentProjectRootUris
          .map((rootUri) => {
            try { return { rootUri, rootPath: resolveFilePathFromUri(rootUri) } } catch { return null }
          })
          .filter((entry): entry is { rootUri: string; rootPath: string } => Boolean(entry))
        const parentProjectRootPaths = parentRootEntries.map((entry) => entry.rootPath)
        const projectIgnoreSkills = await readProjectIgnoreSkills(projectRootPath)
        const summaries = loadSkillSummaries({
          projectRootPath,
          parentProjectRootPaths,
          globalSkillsPath: resolveGlobalSkillsPath(),
        })
        const projectCandidates: Array<{ rootPath: string; projectId: string }> = []
        if (projectRootPath) {
          projectCandidates.push({ rootPath: projectRootPath, projectId: input.projectId })
        }
        const parentProjectRows = parentProjectRootUris.length
          ? await prisma.project.findMany({
              where: { rootUri: { in: parentProjectRootUris }, isDeleted: false },
              select: { id: true, rootUri: true },
            })
          : []
        const parentIdByRootUri = new Map(parentProjectRows.map((row) => [row.rootUri, row.id]))
        for (const entry of parentRootEntries) {
          const parentId = (await readProjectIdFromMeta(entry.rootPath)) ?? parentIdByRootUri.get(entry.rootUri) ?? null
          if (!parentId) continue
          projectCandidates.push({ rootPath: entry.rootPath, projectId: parentId })
        }
        const items = summaries
          .filter((summary) => summary.scope !== "builtin")
          .map((summary) => {
            const ownerProjectId = summary.scope === "project"
              ? resolveOwnerProjectId({ skillPath: summary.path, candidates: projectCandidates })
              : null
            const ignoreKey = summary.scope === "global"
              ? buildGlobalIgnoreKey(summary.folderName)
              : buildProjectIgnoreKey({ folderName: summary.folderName, ownerProjectId, currentProjectId: input.projectId })
            const isEnabled = summary.scope === "global"
              ? !projectIgnoreSkills.includes(ignoreKey)
              : !projectIgnoreSkills.includes(ignoreKey)
            const isDeletable = summary.scope === "project" && ownerProjectId === input.projectId
            return { ...summary, ignoreKey, isEnabled, isDeletable }
          })
        return items.filter(
          (item) => item.scope !== "global" || !globalIgnoreSkills.includes(item.ignoreKey),
        )
      }

      // --- Global query: load global skills + all project skills ---
      // 1. Global skills
      const globalSummaries = loadSkillSummaries({
        globalSkillsPath: resolveGlobalSkillsPath(),
      })
      const globalItems = globalSummaries
        .filter((s) => s.scope === "global")
        .map((summary) => {
          const ignoreKey = buildGlobalIgnoreKey(summary.folderName)
          const isEnabled = !globalIgnoreSkills.includes(ignoreKey)
          return { ...summary, ignoreKey, isEnabled, isDeletable: true }
        })

      // 2. All project skills
      const allProjects = await prisma.project.findMany({
        where: { isDeleted: false },
        select: { id: true, rootUri: true, title: true },
      })
      const projectItems: Array<typeof globalItems[number] & { ownerProjectId?: string; ownerProjectTitle?: string }> = []
      const seenPaths = new Set<string>()
      for (const project of allProjects) {
        let rootPath: string
        try {
          rootPath = resolveFilePathFromUri(project.rootUri)
        } catch {
          continue
        }
        const projectSkills = loadSkillSummaries({ projectRootPath: rootPath })
        for (const summary of projectSkills) {
          if (summary.scope !== "project") continue
          // Deduplicate by absolute path
          if (seenPaths.has(summary.path)) continue
          seenPaths.add(summary.path)
          const ignoreKey = buildProjectIgnoreKey({
            folderName: summary.folderName,
            ownerProjectId: project.id,
            currentProjectId: null,
          })
          projectItems.push({
            ...summary,
            ignoreKey,
            isEnabled: true,
            isDeletable: true,
            ownerProjectId: project.id,
            ownerProjectTitle: project.title || undefined,
          })
        }
      }

      return [...globalItems, ...projectItems]
    }),
  setSkillEnabled: shieldedProcedure
    .input(settingSchemas.setSkillEnabled.input)
    .output(settingSchemas.setSkillEnabled.output)
    .mutation(async ({ input, ctx }) => {
      const ignoreKey = input.ignoreKey.trim()
      if (!ignoreKey) {
        throw new Error(getErrorMessage('IGNORE_KEY_REQUIRED', ctx.lang))
      }
      // 全局技能共用 global 级别的 ignoreSkills 列表。
      if (input.scope === "global") {
        await updateGlobalIgnoreSkills({
          ignoreKey,
          enabled: input.enabled,
        })
        return { ok: true }
      }
      const projectId = input.projectId?.trim()
      if (!projectId) {
        throw new Error(getErrorMessage('PROJECT_ID_REQUIRED', ctx.lang))
      }
      const projectRootPath = getProjectRootPath(projectId)
      if (!projectRootPath) {
        throw new Error(getErrorMessage('PROJECT_NOT_FOUND', ctx.lang))
      }
      await updateProjectIgnoreSkills({
        projectRootPath,
        ignoreKey,
        enabled: input.enabled,
      })
      return { ok: true }
    }),
  deleteSkill: shieldedProcedure
    .input(settingSchemas.deleteSkill.input)
    .output(settingSchemas.deleteSkill.output)
    .mutation(async ({ input }) => {
      const ignoreKey = input.ignoreKey.trim()
      if (!ignoreKey) {
        throw new Error("Ignore key is required.")
      }
      if (input.scope === "project") {
        // 项目页只允许删除当前项目技能，禁止父项目。
        if (ignoreKey.includes(":")) {
          const prefix = ignoreKey.split(":")[0]?.trim()
          if (prefix && prefix !== input.projectId) {
            throw new Error("Parent project skills cannot be deleted here.")
          }
        }
      }
      if (input.scope === "global") {
        // 全局技能：直接通过 skillPath 解析目录并删除。
        const normalizedSkillPath = normalizeSkillPath(input.skillPath)
        if (!normalizedSkillPath) throw new Error("Invalid skill path.")
        const skillDir = path.dirname(normalizedSkillPath)
        const globalSkillsRoot = resolveGlobalSkillsPath()
        const normalizedDir = normalizeFsPath(skillDir)
        const normalizedRoot = normalizeFsPath(globalSkillsRoot)
        if (normalizedDir === normalizedRoot || !normalizedDir.startsWith(`${normalizedRoot}${path.sep}`)) {
          throw new Error("Skill path is outside scope.")
        }
        await fs.rm(skillDir, { recursive: true, force: true })
        // 清理全局 ignoreSkills 中对应条目。
        await updateGlobalIgnoreSkills({ ignoreKey, enabled: true })
      } else {
        const target = resolveSkillDeleteTarget({
          scope: input.scope,
          projectId: input.projectId,
          skillPath: input.skillPath,
        })
        await fs.rm(target.skillDir, { recursive: true, force: true })
        const projectId = input.projectId?.trim()
        if (!projectId) {
          throw new Error("Project id is required.")
        }
        const projectRootPath = getProjectRootPath(projectId)
        if (!projectRootPath) {
          throw new Error("Project not found.")
        }
        await updateProjectIgnoreSkills({
          projectRootPath,
          ignoreKey,
          enabled: true,
        })
      }
      return { ok: true }
    }),
  resetSkill: shieldedProcedure
    .input(settingSchemas.resetSkill.input)
    .output(settingSchemas.resetSkill.output)
    .mutation(async ({ input }) => {
      const { resetSkill } = await import(
        "@/ai/services/skillTranslationService"
      )
      await resetSkill(input.skillFolderPath)
      return { ok: true }
    }),
  translateSkillTitle: shieldedProcedure
    .input(settingSchemas.translateSkillTitle.input)
    .output(settingSchemas.translateSkillTitle.output)
    .mutation(async ({ input }) => {
      const { translateSkillTitle } = await import(
        "@/ai/services/skillTranslationService"
      )
      return translateSkillTitle(
        input.skillFolderPath,
        input.targetLanguage,
      )
    }),
  setSkillColor: shieldedProcedure
    .input(settingSchemas.setSkillColor.input)
    .output(settingSchemas.setSkillColor.output)
    .mutation(async ({ input }) => {
      const { setSkillColorIndex } = await import(
        "@/ai/services/skillTranslationService"
      )
      await setSkillColorIndex(input.skillFolderPath, input.colorIndex)
      return { ok: true }
    }),
  getSkillTranslationStatus: shieldedProcedure
    .input(settingSchemas.getSkillTranslationStatus.input)
    .output(settingSchemas.getSkillTranslationStatus.output)
    .query(async ({ input }) => {
      const { getSkillTranslationStatus } = await import(
        "@/ai/services/skillTranslationService"
      )
      return getSkillTranslationStatus(
        input.skillFolderPath,
        input.targetLanguage,
      )
    }),
  translateSkill: shieldedProcedure
    .input(settingSchemas.translateSkill.input)
    .output(settingSchemas.translateSkill.output)
    .mutation(async ({ input }) => {
      const { translateSkill } = await import(
        "@/ai/services/skillTranslationService"
      )
      return translateSkill(
        input.skillFolderPath,
        input.targetLanguage,
      )
    }),
  exportSkill: shieldedProcedure
    .input(settingSchemas.exportSkill.input)
    .output(settingSchemas.exportSkill.output)
    .query(async ({ input }) => {
      const { exportSkill } = await import(
        "@/ai/services/skillExportService"
      )
      return exportSkill(input.skillFolderPath)
    }),
  transferSkill: shieldedProcedure
    .input(settingSchemas.transferSkill.input)
    .output(settingSchemas.transferSkill.output)
    .mutation(async ({ input }) => {
      const skillDir = input.skillFolderPath.replace(/[/\\]SKILL\.md$/i, "")
      const stat = await fs.stat(skillDir).catch(() => null)
      if (!stat?.isDirectory()) {
        return { ok: false, error: "技能文件夹不存在" }
      }
      const folderName = path.basename(skillDir)
      let targetSkillsDir: string
      if (input.targetScope === "global") {
        targetSkillsDir = resolveGlobalSkillsPath()
      } else {
        if (!input.targetProjectId) {
          return { ok: false, error: "目标项目 ID 不能为空" }
        }
        const projectRootPath = getProjectRootPath(input.targetProjectId)
        if (!projectRootPath) {
          return { ok: false, error: "未找到目标项目" }
        }
        targetSkillsDir = path.join(projectRootPath, ".openloaf", "skills")
      }
      await fs.mkdir(targetSkillsDir, { recursive: true })
      let destDir = path.join(targetSkillsDir, folderName)
      // Avoid overwriting — add suffix if destination exists
      try {
        await fs.access(destDir)
        const suffix = Date.now().toString(36)
        destDir = path.join(targetSkillsDir, `${folderName}-${suffix}`)
      } catch {
        // destination doesn't exist, safe
      }
      // Check source and target are not the same
      const normalizedSrc = path.resolve(skillDir)
      const normalizedDest = path.resolve(destDir)
      if (normalizedSrc === normalizedDest) {
        return { ok: false, error: "技能已在目标位置" }
      }
      await fs.cp(skillDir, destDir, { recursive: true })
      if (input.mode === "move") {
        await fs.rm(skillDir, { recursive: true, force: true })
      }
      return { ok: true, folderName: path.basename(destDir) }
    }),
  importSkill: shieldedProcedure
    .input(settingSchemas.importSkill.input)
    .output(settingSchemas.importSkill.output)
    .mutation(async ({ input }) => {
      const { importSkill } = await import(
        "@/ai/services/skillImportService"
      )
      return importSkill({
        sourcePath: input.sourcePath,
        scope: input.scope,
        projectId: input.projectId,
      })
    }),
  importSkillFromArchive: shieldedProcedure
    .input(settingSchemas.importSkillFromArchive.input)
    .output(settingSchemas.importSkillFromArchive.output)
    .mutation(async ({ input }) => {
      const { importSkillFromBuffer } = await import(
        "@/ai/services/skillImportService"
      )
      const buffer = Buffer.from(input.contentBase64, "base64")
      return importSkillFromBuffer({
        buffer,
        fileName: input.fileName,
        scope: input.scope,
        projectId: input.projectId,
      })
    }),
  detectExternalSkills: shieldedProcedure
    .input(settingSchemas.detectExternalSkills.input)
    .output(settingSchemas.detectExternalSkills.output)
    .query(async ({ input }) => {
      const { detectExternalSkills } = await import(
        "@/ai/services/externalSkillsService"
      )
      return detectExternalSkills({ projectId: input.projectId })
    }),
  importExternalSkills: shieldedProcedure
    .input(settingSchemas.importExternalSkills.input)
    .output(settingSchemas.importExternalSkills.output)
    .mutation(async ({ input }) => {
      const { importExternalSkills } = await import(
        "@/ai/services/externalSkillsService"
      )
      return importExternalSkills({
        skills: input.skills,
        method: input.method,
        scope: input.scope,
        projectId: input.projectId,
      })
    }),
}
