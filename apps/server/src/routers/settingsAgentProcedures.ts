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
import { loadAgentSummaries, readAgentConfigFromPath, serializeAgentToMarkdown } from "@/ai/services/agentConfigService"
import { readAgentJson, resolveAgentDir } from "@/ai/shared/defaultAgentResolver"
import { getOpenLoafRootDir } from "@openloaf/config"
import { CAPABILITY_GROUPS } from "@/ai/tools/capabilityGroups"
import { isSystemAgentId } from "@/ai/shared/systemAgentDefinitions"
import {
  buildGlobalIgnoreKey,
  buildProjectIgnoreKey,
  normalizeSkillPath,
  readGlobalIgnoreSkills,
  readProjectIdFromMeta,
  readProjectIgnoreSkills,
  resolveAgentDeleteTarget,
  resolveGlobalAgentsPath,
  resolveOwnerProjectId,
  updateGlobalIgnoreSkills,
  updateProjectIgnoreSkills,
} from "./settingsHelpers"

/**
 * Agent-related tRPC procedures for the settings router.
 * Extracted from settings.ts for maintainability.
 */
export const agentProcedures = {
  /** List agents for settings UI. */
  getAgents: shieldedProcedure
    .input(settingSchemas.getAgents.input)
    .output(settingSchemas.getAgents.output)
    .query(async ({ input }) => {
      const projectRootPath = input?.projectId
        ? getProjectRootPath(input.projectId) ?? undefined
        : undefined
      const parentProjectRootUris = input?.projectId
        ? await resolveProjectAncestorRootUris(prisma, input.projectId)
        : []
      const parentRootEntries = parentProjectRootUris
        .map((rootUri) => {
          try {
            const rootPath = resolveFilePathFromUri(rootUri)
            return { rootUri, rootPath }
          } catch {
            return null
          }
        })
        .filter(
          (entry): entry is { rootUri: string; rootPath: string } =>
            Boolean(entry),
        )
      const parentProjectRootPaths = parentRootEntries.map((e) => e.rootPath)
      const globalIgnoreSkills = await readGlobalIgnoreSkills()
      const projectIgnoreSkills = await readProjectIgnoreSkills(projectRootPath)
      const summaries = loadAgentSummaries({
        projectRootPath,
        parentProjectRootPaths,
        globalAgentsPath: resolveGlobalAgentsPath(),
      })
      const projectCandidates: Array<{ rootPath: string; projectId: string }> = []
      if (projectRootPath && input?.projectId) {
        projectCandidates.push({
          rootPath: projectRootPath,
          projectId: input.projectId,
        })
      }
      const parentProjectRows = parentProjectRootUris.length
        ? await prisma.project.findMany({
            where: { rootUri: { in: parentProjectRootUris }, isDeleted: false },
            select: { id: true, rootUri: true },
          })
        : []
      const parentIdByRootUri = new Map(
        parentProjectRows.map((row) => [row.rootUri, row.id]),
      )
      for (const entry of parentRootEntries) {
        const parentId =
          (await readProjectIdFromMeta(entry.rootPath)) ??
          parentIdByRootUri.get(entry.rootUri) ??
          null
        if (!parentId) continue
        projectCandidates.push({
          rootPath: entry.rootPath,
          projectId: parentId,
        })
      }
      // 逻辑：加载额外项目的 agent（全部项目 / 子项目）
      const childProjectPaths = new Set<string>()
      if (!input?.projectId && input?.includeAllProjects) {
        {
          const allProjects = await prisma.project.findMany({
            where: { isDeleted: false },
            select: { id: true, rootUri: true },
          })
          for (const proj of allProjects) {
            try {
              const projRootPath = resolveFilePathFromUri(proj.rootUri)
              const projAgents = loadAgentSummaries({ projectRootPath: projRootPath })
              for (const s of projAgents) {
                if (s.scope === 'project') {
                  summaries.push(s)
                  projectCandidates.push({ rootPath: projRootPath, projectId: proj.id })
                }
              }
            } catch { /* skip invalid paths */ }
          }
        }
      }
      if (input?.projectId && input?.includeChildProjects) {
        const childProjects = await prisma.project.findMany({
          where: { parentId: input.projectId, isDeleted: false },
          select: { id: true, rootUri: true },
        })
        for (const child of childProjects) {
          try {
            const childRootPath = resolveFilePathFromUri(child.rootUri)
            const childAgents = loadAgentSummaries({ projectRootPath: childRootPath })
            for (const s of childAgents) {
              if (s.scope === 'project') {
                summaries.push(s)
                childProjectPaths.add(s.path)
                projectCandidates.push({ rootPath: childRootPath, projectId: child.id })
              }
            }
          } catch { /* skip invalid paths */ }
        }
      }
      const items = summaries.map((summary) => {
        const ownerProjectId =
          summary.scope === "project"
            ? resolveOwnerProjectId({
                skillPath: summary.path,
                candidates: projectCandidates,
              })
            : null
        const ignoreKey =
          summary.scope === "global"
            ? buildGlobalIgnoreKey(summary.folderName)
            : buildProjectIgnoreKey({
                  folderName: summary.folderName,
                  ownerProjectId,
                  currentProjectId: input?.projectId ?? null,
                })
        const isEnabled =
          summary.scope === "global"
            ? input?.projectId
              ? !projectIgnoreSkills.includes(`agent:${ignoreKey}`)
              : !globalIgnoreSkills.includes(`agent:${ignoreKey}`)
            : !projectIgnoreSkills.includes(`agent:${ignoreKey}`)
        const isOpenLoafAgent = summary.path.includes('.openloaf/agents/') || summary.path.includes('.openloaf\\agents\\')
        const isSysAgent = isOpenLoafAgent && isSystemAgentId(summary.folderName)
        const isDeletable = isSysAgent
          ? false
          : summary.scope === "global"
            ? false
            : input?.projectId
              ? summary.scope === "project" && ownerProjectId === input.projectId
              : false
        const isInherited = summary.scope === "project" && Boolean(input?.projectId) && ownerProjectId !== input?.projectId
        const isChildProject = childProjectPaths.has(summary.path)
        return { ...summary, ignoreKey, isEnabled, isDeletable, isInherited, isChildProject, isSystem: isSysAgent }
      })
      // 逻辑：scopeFilter 过滤 — 仅返回指定 scope 的 agent。
      const scopeFilter = input?.scopeFilter
      const scopeFiltered = scopeFilter && scopeFilter !== 'all'
        ? items.filter((item) => item.scope === scopeFilter)
        : items
      // 过滤系统 Agent — 用户只能看到自己创建的 Agent。
      const userOnly = scopeFiltered.filter((item) => !item.isSystem)
      if (input?.projectId) {
        return userOnly.filter(
          (item) =>
            item.scope !== "global" ||
            !globalIgnoreSkills.includes(`agent:${item.ignoreKey}`),
        )
      }
      return userOnly
    }),
  /** Toggle agent enabled state. */
  setAgentEnabled: shieldedProcedure
    .input(settingSchemas.setAgentEnabled.input)
    .output(settingSchemas.setAgentEnabled.output)
    .mutation(async ({ input }) => {
      const ignoreKey = `agent:${input.ignoreKey.trim()}`
      if (!ignoreKey) {
        throw new Error("Ignore key is required.")
      }
      if (input.scope === "global") {
        await updateGlobalIgnoreSkills({
          ignoreKey,
          enabled: input.enabled,
        })
        return { ok: true }
      }
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
        enabled: input.enabled,
      })
      return { ok: true }
    }),
  /** Delete an agent folder. */
  deleteAgent: shieldedProcedure
    .input(settingSchemas.deleteAgent.input)
    .output(settingSchemas.deleteAgent.output)
    .mutation(async ({ input }) => {
      const ignoreKey = input.ignoreKey.trim()
      if (!ignoreKey) {
        throw new Error("Ignore key is required.")
      }
      // 逻辑：系统 Agent 不可删除。
      const folderName = ignoreKey.includes(":") ? ignoreKey.split(":").pop()! : ignoreKey
      if (isSystemAgentId(folderName)) {
        throw new Error("System agents cannot be deleted.")
      }
      if (input.scope === "global") {
        throw new Error("Global agents cannot be deleted from settings.")
      }
      if (input.scope === "project") {
        if (ignoreKey.includes(":")) {
          const prefix = ignoreKey.split(":")[0]?.trim()
          if (prefix && prefix !== input.projectId) {
            throw new Error("Parent project agents cannot be deleted here.")
          }
        }
      }
      const target = resolveAgentDeleteTarget({
        scope: input.scope,
        projectId: input.projectId,
        agentPath: input.agentPath,
      })
      await fs.rm(target.agentDir, { recursive: true, force: true })
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
        ignoreKey: `agent:${ignoreKey}`,
        enabled: true,
      })
      return { ok: true }
    }),
  /** Get capability groups. */
  getCapabilityGroups: shieldedProcedure
    .output(settingSchemas.getCapabilityGroups.output)
    .query(async () => {
      return CAPABILITY_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        description: group.description,
        toolIds: [...group.toolIds],
        tools: group.tools,
      }))
    }),
  /** Get full agent detail by path. */
  getAgentDetail: shieldedProcedure
    .input(settingSchemas.getAgentDetail.input)
    .output(settingSchemas.getAgentDetail.output)
    .query(async ({ input }) => {
      // 逻辑：agent.json 路径走 .openloaf/agents/ 结构，AGENT.md 走旧结构。
      if (path.basename(input.agentPath) === "agent.json") {
        const { readAgentJson } = await import("@/ai/shared/defaultAgentResolver")
        const agentDir = path.dirname(input.agentPath)
        const descriptor = readAgentJson(agentDir)
        if (!descriptor) {
          throw new Error(`Agent not found at ${input.agentPath}`)
        }
        // 逻辑：读取同目录下的 prompt.md 作为 systemPrompt。
        const agentMdPath = path.join(agentDir, "prompt.md")
        let systemPrompt = ""
        try {
          const { readFileSync, existsSync } = await import("node:fs")
          if (existsSync(agentMdPath)) {
            systemPrompt = readFileSync(agentMdPath, "utf8").trim()
          }
        } catch { /* ignore */ }
        // 逻辑：prompt.md 不存在时，fallback 到内嵌模板的 systemPrompt。
        if (!systemPrompt) {
          const { getTemplate } = await import("@/ai/agent-templates")
          const folderName = path.basename(agentDir)
          const template = getTemplate(folderName)
          if (template?.systemPrompt) {
            systemPrompt = template.systemPrompt
          }
        }
        const modelLocalIds = Array.isArray(descriptor.modelLocalIds)
          ? descriptor.modelLocalIds
          : []
        const modelCloudIds = Array.isArray(descriptor.modelCloudIds)
          ? descriptor.modelCloudIds
          : []
        const auxiliaryModelLocalIds = Array.isArray(
          descriptor.auxiliaryModelLocalIds,
        )
          ? descriptor.auxiliaryModelLocalIds
          : []
        const auxiliaryModelCloudIds = Array.isArray(
          descriptor.auxiliaryModelCloudIds,
        )
          ? descriptor.auxiliaryModelCloudIds
          : []
        const imageModelIds = Array.isArray(descriptor.imageModelIds)
          ? descriptor.imageModelIds
          : []
        const videoModelIds = Array.isArray(descriptor.videoModelIds)
          ? descriptor.videoModelIds
          : []
        const codeModelIds = Array.isArray(descriptor.codeModelIds)
          ? descriptor.codeModelIds
          : []
        return {
          name: descriptor.name,
          description: descriptor.description || "未提供",
          icon: descriptor.icon || "bot",
          modelLocalIds,
          modelCloudIds,
          auxiliaryModelSource:
            descriptor.auxiliaryModelSource === "cloud" ? "cloud" : "local",
          auxiliaryModelLocalIds,
          auxiliaryModelCloudIds,
          imageModelIds,
          videoModelIds,
          codeModelIds,
          toolIds: descriptor.toolIds || [],
          skills: descriptor.skills || [],
          allowSubAgents: descriptor.allowSubAgents ?? false,
          maxDepth: descriptor.maxDepth ?? 1,
          systemPrompt,
          path: input.agentPath,
          folderName: path.basename(agentDir),
          scope: input.scope,
        }
      }
      const config = readAgentConfigFromPath(input.agentPath, input.scope)
      if (!config) {
        throw new Error(`Agent not found at ${input.agentPath}`)
      }
      return {
        name: config.name,
        description: config.description,
        icon: config.icon,
        modelLocalIds: config.modelLocalIds,
        modelCloudIds: config.modelCloudIds,
        auxiliaryModelSource: config.auxiliaryModelSource,
        auxiliaryModelLocalIds: config.auxiliaryModelLocalIds,
        auxiliaryModelCloudIds: config.auxiliaryModelCloudIds,
        imageModelIds: config.imageModelIds,
        videoModelIds: config.videoModelIds,
        codeModelIds: config.codeModelIds ?? [],
        toolIds: config.toolIds,
        skills: config.skills,
        allowSubAgents: config.allowSubAgents,
        maxDepth: config.maxDepth,
        systemPrompt: config.systemPrompt,
        path: config.path,
        folderName: config.folderName,
        scope: config.scope,
      }
    }),
  /** Save (create or update) an agent. */
  saveAgent: shieldedProcedure
    .input(settingSchemas.saveAgent.input)
    .output(settingSchemas.saveAgent.output)
    .mutation(async ({ input }) => {
      if (input.agentPath) {
        // 逻辑：更新已有 Agent。
        const { writeFileSync, existsSync: existsFsSync } = await import("node:fs")
        if (path.basename(input.agentPath) === "agent.json") {
          // 逻辑：.openloaf/agents/ 结构 — 更新 agent.json + AGENT.md。
          const agentDir = path.dirname(input.agentPath)
          const descriptor = {
            name: input.name,
            description: input.description,
            icon: input.icon,
            modelLocalIds: input.modelLocalIds,
            modelCloudIds: input.modelCloudIds,
            auxiliaryModelSource: input.auxiliaryModelSource,
            auxiliaryModelLocalIds: input.auxiliaryModelLocalIds,
            auxiliaryModelCloudIds: input.auxiliaryModelCloudIds,
            imageModelIds: input.imageModelIds,
            videoModelIds: input.videoModelIds,
            codeModelIds: input.codeModelIds,
            toolIds: input.toolIds,
            skills: input.skills,
            allowSubAgents: input.allowSubAgents,
            maxDepth: input.maxDepth,
          }
          writeFileSync(input.agentPath, JSON.stringify(descriptor, null, 2), "utf8")
          // 逻辑：prompt 与模板默认相同 → 删除 prompt.md；不同 → 写入作为覆盖。
          const { getTemplate } = await import("@/ai/agent-templates")
          const folderName = path.basename(agentDir)
          const template = getTemplate(folderName)
          const promptMdPath = path.join(agentDir, "prompt.md")
          const isDefault = !input.systemPrompt?.trim()
            || input.systemPrompt.trim() === template?.systemPrompt?.trim()
          if (isDefault) {
            const { unlinkSync } = await import("node:fs")
            if (existsFsSync(promptMdPath)) {
              try { unlinkSync(promptMdPath) } catch { /* ignore */ }
            }
          } else {
            writeFileSync(promptMdPath, input.systemPrompt!.trim(), "utf8")
          }
          return { ok: true, agentPath: input.agentPath }
        }
        // 逻辑：旧 .agents/agents/ 结构 — 覆盖 AGENT.md。
        const content = serializeAgentToMarkdown({
          name: input.name,
          description: input.description,
          icon: input.icon,
          modelLocalIds: input.modelLocalIds,
          modelCloudIds: input.modelCloudIds,
          auxiliaryModelSource: input.auxiliaryModelSource,
          auxiliaryModelLocalIds: input.auxiliaryModelLocalIds,
          auxiliaryModelCloudIds: input.auxiliaryModelCloudIds,
          imageModelIds: input.imageModelIds,
          videoModelIds: input.videoModelIds,
          codeModelIds: input.codeModelIds,
          toolIds: input.toolIds,
          skills: input.skills,
          allowSubAgents: input.allowSubAgents,
          maxDepth: input.maxDepth,
          systemPrompt: input.systemPrompt,
        })
        writeFileSync(input.agentPath, content, "utf8")
        return { ok: true, agentPath: input.agentPath }
      }

      // 逻辑：创建新 Agent — 写入 .openloaf/agents/<name>/ 目录。
      const { mkdirSync, writeFileSync: writeFsSync } = await import("node:fs")
      const { resolveAgentsRootDir } = await import("@/ai/shared/defaultAgentResolver")

      let rootPath: string
      if (input.scope === "project" && input.projectId) {
        rootPath = getProjectRootPath(input.projectId) ?? ""
        if (!rootPath) throw new Error("Project not found.")
      } else if (input.scope === "global") {
        rootPath = resolveGlobalAgentsPath()
        const sanitizedName = input.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
        const agentDir = path.join(rootPath, sanitizedName)
        mkdirSync(agentDir, { recursive: true })
        // 统一写 agent.json 格式（与项目 scope 一致）。
        const descriptor = {
          name: input.name,
          description: input.description,
          icon: input.icon,
          modelLocalIds: input.modelLocalIds,
          modelCloudIds: input.modelCloudIds,
          auxiliaryModelSource: input.auxiliaryModelSource,
          auxiliaryModelLocalIds: input.auxiliaryModelLocalIds,
          auxiliaryModelCloudIds: input.auxiliaryModelCloudIds,
          imageModelIds: input.imageModelIds,
          videoModelIds: input.videoModelIds,
          codeModelIds: input.codeModelIds,
          toolIds: input.toolIds,
          skills: input.skills,
          allowSubAgents: input.allowSubAgents,
          maxDepth: input.maxDepth,
        }
        const jsonPath = path.join(agentDir, "agent.json")
        writeFsSync(jsonPath, JSON.stringify(descriptor, null, 2), "utf8")
        if (input.systemPrompt?.trim()) {
          writeFsSync(path.join(agentDir, "prompt.md"), input.systemPrompt.trim(), "utf8")
        }
        // 清理旧 AGENT.md（如果存在）。
        const { existsSync: existsFsSync2, unlinkSync } = await import("node:fs")
        const oldMdPath = path.join(agentDir, "AGENT.md")
        if (existsFsSync2(oldMdPath)) {
          try { unlinkSync(oldMdPath) } catch { /* ignore */ }
        }
        return { ok: true, agentPath: jsonPath }
      } else {
        rootPath = getOpenLoafRootDir()
      }

      const sanitizedName = input.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
      const agentsRoot = resolveAgentsRootDir(rootPath)
      const agentDir = path.join(agentsRoot, sanitizedName)
      mkdirSync(agentDir, { recursive: true })
      const descriptor = {
        name: input.name,
        description: input.description,
        icon: input.icon,
        modelLocalIds: input.modelLocalIds,
        modelCloudIds: input.modelCloudIds,
        auxiliaryModelSource: input.auxiliaryModelSource,
        auxiliaryModelLocalIds: input.auxiliaryModelLocalIds,
        auxiliaryModelCloudIds: input.auxiliaryModelCloudIds,
        imageModelIds: input.imageModelIds,
        videoModelIds: input.videoModelIds,
        codeModelIds: input.codeModelIds,
        toolIds: input.toolIds,
        skills: input.skills,
        allowSubAgents: input.allowSubAgents,
        maxDepth: input.maxDepth,
      }
      const jsonPath = path.join(agentDir, "agent.json")
      writeFsSync(jsonPath, JSON.stringify(descriptor, null, 2), "utf8")
      if (input.systemPrompt?.trim()) {
        writeFsSync(path.join(agentDir, "prompt.md"), input.systemPrompt.trim(), "utf8")
      }
      return { ok: true, agentPath: jsonPath }
    }),
  /** Copy a global agent to a project. */
  copyAgentToProject: shieldedProcedure
    .input(settingSchemas.copyAgentToProject.input)
    .output(settingSchemas.copyAgentToProject.output)
    .mutation(async ({ input }) => {
      const { mkdirSync, writeFileSync: writeFsSync, readFileSync, existsSync } = await import("node:fs")
      const { resolveAgentsRootDir } = await import("@/ai/shared/defaultAgentResolver")

      const projectRootPath = getProjectRootPath(input.projectId)
      if (!projectRootPath) throw new Error("Project not found.")

      // 逻辑：读取源 agent 配置。
      const sourceNormalized = normalizeSkillPath(input.sourceAgentPath)
      if (!sourceNormalized) throw new Error("Invalid source agent path.")
      const sourceBaseName = path.basename(sourceNormalized)
      const sourceDir = path.dirname(sourceNormalized)

      const targetFolderName = input.asMaster ? "master" : path.basename(sourceDir)
      const agentsRoot = resolveAgentsRootDir(projectRootPath)
      const targetDir = path.join(agentsRoot, targetFolderName)
      mkdirSync(targetDir, { recursive: true })

      if (sourceBaseName === "agent.json") {
        // 逻辑：.openloaf/agents/ 结构 — 复制 agent.json + prompt.md。
        const { readAgentJson } = await import("@/ai/shared/defaultAgentResolver")
        const descriptor = readAgentJson(sourceDir)
        if (!descriptor) throw new Error("Source agent not found.")
        const targetJsonPath = path.join(targetDir, "agent.json")
        writeFsSync(targetJsonPath, JSON.stringify(descriptor, null, 2), "utf8")
        const sourceMdPath = path.join(sourceDir, "prompt.md")
        if (existsSync(sourceMdPath)) {
          const mdContent = readFileSync(sourceMdPath, "utf8")
          writeFsSync(path.join(targetDir, "prompt.md"), mdContent, "utf8")
        }
        return { ok: true, agentPath: targetJsonPath }
      }

      // 逻辑：旧 .agents/agents/ 结构 — 复制 AGENT.md。
      const config = readAgentConfigFromPath(sourceNormalized, "global")
      if (!config) throw new Error("Source agent not found.")
      const descriptor = {
        name: config.name,
        description: config.description,
        icon: config.icon,
        modelLocalIds: config.modelLocalIds,
        modelCloudIds: config.modelCloudIds,
        auxiliaryModelSource: config.auxiliaryModelSource,
        auxiliaryModelLocalIds: config.auxiliaryModelLocalIds,
        auxiliaryModelCloudIds: config.auxiliaryModelCloudIds,
        imageModelIds: config.imageModelIds,
        videoModelIds: config.videoModelIds,
        codeModelIds: config.codeModelIds,
        toolIds: config.toolIds,
        skills: config.skills,
        allowSubAgents: config.allowSubAgents,
        maxDepth: config.maxDepth,
      }
      const targetJsonPath = path.join(targetDir, "agent.json")
      writeFsSync(targetJsonPath, JSON.stringify(descriptor, null, 2), "utf8")
      if (config.systemPrompt?.trim()) {
        writeFsSync(path.join(targetDir, "prompt.md"), config.systemPrompt.trim(), "utf8")
      }
      return { ok: true, agentPath: targetJsonPath }
    }),
  /** Get skills for a SubAgent by name. */
  getAgentSkillsByName: shieldedProcedure
    .input(settingSchemas.getAgentSkillsByName.input)
    .output(settingSchemas.getAgentSkillsByName.output)
    .query(async ({ input }) => {
      const globalRootPath = getOpenLoafRootDir()
      const roots = [globalRootPath].filter(Boolean) as string[]
      for (const rootPath of roots) {
        const descriptor = readAgentJson(resolveAgentDir(rootPath, input.agentName))
        if (descriptor) {
          return { skills: Array.isArray(descriptor.skills) ? descriptor.skills : [] }
        }
      }
      return { skills: [] }
    }),
  /** Save skills for a SubAgent by name. */
  saveAgentSkillsByName: shieldedProcedure
    .input(settingSchemas.saveAgentSkillsByName.input)
    .output(settingSchemas.saveAgentSkillsByName.output)
    .mutation(async ({ input }) => {
      const globalRootPath = getOpenLoafRootDir()
      if (!globalRootPath) throw new Error("No global root")
      const agentDir = resolveAgentDir(globalRootPath, input.agentName)
      const descriptor = readAgentJson(agentDir)
      if (!descriptor) throw new Error(`Agent '${input.agentName}' not found`)
      const jsonPath = path.join(agentDir, "agent.json")
      const updated = { ...descriptor, skills: input.skills }
      await fs.writeFile(jsonPath, JSON.stringify(updated, null, 2), "utf8")
      return { ok: true }
    }),
}
