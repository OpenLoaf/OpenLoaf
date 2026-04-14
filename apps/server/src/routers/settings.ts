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
import { pathToFileURL } from "node:url"
import { z } from "zod"
import {
  BaseSettingRouter,
  getProjectRootPath,
  settingSchemas,
  shieldedProcedure,
  t,
} from "@openloaf/api"
import {
  getDefaultProjectStorageRootUri,
  getResolvedTempStorageDir,
} from "@openloaf/api/services/appConfigService"
import {
  deleteSettingValueFromWeb,
  getBasicConfigForWeb,
  getProviderSettingsForWeb,
  getS3ProviderSettingsForWeb,
  getSettingsForWeb,
  setBasicConfigFromWeb,
  setSettingValueFromWeb,
} from "@/modules/settings/settingsService"
import {
  addToolApprovalRuleAtomic,
  readToolApprovalRules,
  removeToolApprovalRuleAtomic,
  writeToolApprovalRules,
} from "@/modules/settings/openloafConfStore"
import {
  checkCliToolUpdate,
  getCliToolsStatus,
  installCliTool,
} from "@/ai/models/cli/cliToolService"
import {
  getCodexCliModels,
  getClaudeCodeCliModels,
} from "@/ai/models/cli/cliProviderEntry"
import {
  readMemoryFile,
  readUserMemoryIndex,
  resolveMemoryDir,
  resolveUserMemoryDir,
  writeMemoryFile,
  writeUserMemoryIndex,
} from "@/ai/shared/memoryLoader"
import { resolveSystemCliInfo } from "@/modules/settings/resolveSystemCliInfo"
import { resolveOfficeInfo } from "@/modules/settings/resolveOfficeInfo"
import { skillProcedures } from "./settingsSkillProcedures"
import { agentProcedures } from "./settingsAgentProcedures"
import { aiProcedures } from "./settingsAiProcedures"

class SettingRouterImpl extends BaseSettingRouter {
  /** Settings read/write (server-side). */
  public static createRouter() {
    return t.router({
      // ─── Core Settings ─────────────────────────────────────────────────
      getAll: shieldedProcedure
        .output(settingSchemas.getAll.output)
        .query(async () => {
          return await getSettingsForWeb()
        }),
      getProviders: shieldedProcedure
        .output(settingSchemas.getProviders.output)
        .query(async () => {
          return await getProviderSettingsForWeb()
        }),
      getS3Providers: shieldedProcedure
        .output(settingSchemas.getS3Providers.output)
        .query(async () => {
          return await getS3ProviderSettingsForWeb()
        }),
      getBasic: shieldedProcedure
        .output(settingSchemas.getBasic.output)
        .query(async () => {
          return await getBasicConfigForWeb()
        }),
      getProjectStorageRoot: shieldedProcedure
        .output(settingSchemas.getProjectStorageRoot.output)
        .query(async () => {
          return {
            rootUri: getDefaultProjectStorageRootUri(),
            tempRootUri: pathToFileURL(getResolvedTempStorageDir()).href,
          }
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async ({ input }) => {
          await setSettingValueFromWeb(input.key, input.value, input.category)
          return { ok: true }
        }),
      remove: shieldedProcedure
        .input(settingSchemas.remove.input)
        .output(settingSchemas.remove.output)
        .mutation(async ({ input }) => {
          await deleteSettingValueFromWeb(input.key, input.category)
          return { ok: true }
        }),
      setBasic: shieldedProcedure
        .input(settingSchemas.setBasic.input)
        .output(settingSchemas.setBasic.output)
        .mutation(async ({ input }) => {
          return await setBasicConfigFromWeb(input)
        }),

      // ─── CLI Tools ─────────────────────────────────────────────────────
      getCliToolsStatus: shieldedProcedure
        .output(settingSchemas.getCliToolsStatus.output)
        .query(async () => {
          return await getCliToolsStatus()
        }),
      systemCliInfo: shieldedProcedure
        .output(settingSchemas.systemCliInfo.output)
        .query(() => {
          return resolveSystemCliInfo()
        }),
      officeInfo: shieldedProcedure
        .output(settingSchemas.officeInfo.output)
        .query(async () => {
          return await resolveOfficeInfo()
        }),
      getCodexModels: shieldedProcedure
        .output(settingSchemas.getCodexModels.output)
        .query(() => {
          return getCodexCliModels().map((m) => ({ id: m.id, name: m.name ?? m.id, tags: m.tags }))
        }),
      getClaudeCodeModels: shieldedProcedure
        .output(settingSchemas.getClaudeCodeModels.output)
        .query(() => {
          return getClaudeCodeCliModels().map((m) => ({ id: m.id, name: m.name ?? m.id, tags: m.tags }))
        }),
      installCliTool: shieldedProcedure
        .input(settingSchemas.installCliTool.input)
        .output(settingSchemas.installCliTool.output)
        .mutation(async ({ input }) => {
          const status = await installCliTool(input.id)
          return { ok: true, status }
        }),
      checkCliToolUpdate: shieldedProcedure
        .input(settingSchemas.checkCliToolUpdate.input)
        .output(settingSchemas.checkCliToolUpdate.output)
        .mutation(async ({ input }) => {
          const status = await checkCliToolUpdate(input.id)
          return { ok: true, status }
        }),

      // ─── Tool Approval Rules (global / temp-chat scope) ───────────────
      getToolApprovalRules: shieldedProcedure
        .output(settingSchemas.getToolApprovalRules.output)
        .query(() => {
          const rules = readToolApprovalRules()
          return {
            allow: rules.allow,
            deny: rules.deny,
          }
        }),

      setToolApprovalRules: shieldedProcedure
        .input(settingSchemas.setToolApprovalRules.input)
        .output(settingSchemas.setToolApprovalRules.output)
        .mutation(({ input }) => {
          writeToolApprovalRules(input)
          return { ok: true }
        }),

      addToolApprovalRule: shieldedProcedure
        .input(settingSchemas.addToolApprovalRule.input)
        .output(settingSchemas.addToolApprovalRule.output)
        .mutation(async ({ input }) => {
          await addToolApprovalRuleAtomic(input.rule, input.behavior)
          return { ok: true }
        }),

      removeToolApprovalRule: shieldedProcedure
        .input(settingSchemas.removeToolApprovalRule.input)
        .output(settingSchemas.removeToolApprovalRule.output)
        .mutation(async ({ input }) => {
          await removeToolApprovalRuleAtomic(input.rule, input.behavior)
          return { ok: true }
        }),

      // ─── Memory ────────────────────────────────────────────────────────
      /** Get memory content by scope ('user' = global, 'project' = project-level). */
      getMemory: shieldedProcedure
        .input(settingSchemas.getMemory.input)
        .output(settingSchemas.getMemory.output)
        .query(async ({ input }) => {
          const scope = input?.scope ?? 'user'
          if (scope === 'user') {
            return { content: readUserMemoryIndex() }
          }
          // scope === 'project'
          const projectRootPath = input?.projectId
            ? getProjectRootPath(input.projectId) ?? undefined
            : undefined
          if (!projectRootPath) return { content: '' }
          const content = readMemoryFile(projectRootPath)
          return { content }
        }),

      getMemoryDirUri: shieldedProcedure
        .input(settingSchemas.getMemoryDirUri.input)
        .output(settingSchemas.getMemoryDirUri.output)
        .query(async ({ input }) => {
          const scope = input?.scope ?? 'user'
          let memoryDirPath: string | undefined
          if (scope === 'user') {
            memoryDirPath = resolveUserMemoryDir()
          } else {
            const rootPath = input?.projectId
              ? getProjectRootPath(input.projectId) ?? undefined
              : undefined
            if (rootPath) memoryDirPath = resolveMemoryDir(rootPath)
          }
          if (!memoryDirPath) return { dirUri: '', indexUri: '' }
          const dirUri = pathToFileURL(memoryDirPath).href
          const indexUri = pathToFileURL(path.join(memoryDirPath, 'MEMORY.md')).href
          return { dirUri, indexUri }
        }),

      saveMemory: shieldedProcedure
        .input(settingSchemas.saveMemory.input)
        .output(settingSchemas.saveMemory.output)
        .mutation(async ({ input }) => {
          const scope = input.scope ?? 'user'
          if (scope === 'user') {
            writeUserMemoryIndex(input.content)
            return { ok: true }
          }
          // scope === 'project'
          const rootPath = input.projectId
            ? getProjectRootPath(input.projectId)
            : null
          if (!rootPath) return { ok: false }
          writeMemoryFile(rootPath, input.content)
          return { ok: true }
        }),

      clearAllMemory: shieldedProcedure
        .input(settingSchemas.clearAllMemory.input)
        .output(settingSchemas.clearAllMemory.output)
        .mutation(async ({ input }) => {
          const scope = input?.scope ?? 'user'
          let memoryDirPath: string | undefined
          if (scope === 'user') {
            memoryDirPath = resolveUserMemoryDir()
          } else {
            const rootPath = input?.projectId
              ? getProjectRootPath(input.projectId) ?? undefined
              : undefined
            if (rootPath) memoryDirPath = resolveMemoryDir(rootPath)
          }
          if (!memoryDirPath) return { ok: false, deletedCount: 0 }
          try {
            const entries = await fs.readdir(memoryDirPath)
            let deletedCount = 0
            for (const entry of entries) {
              const fullPath = path.join(memoryDirPath, entry)
              const stat = await fs.stat(fullPath)
              if (stat.isFile()) {
                await fs.unlink(fullPath)
                deletedCount++
              }
            }
            return { ok: true, deletedCount }
          } catch {
            return { ok: true, deletedCount: 0 }
          }
        }),

      // ─── Skill Procedures (extracted) ──────────────────────────────────
      ...skillProcedures,

      // ─── Agent Procedures (extracted) ──────────────────────────────────
      ...agentProcedures,

      // ─── AI Inference Procedures (extracted) ───────────────────────────
      ...aiProcedures,
    })
  }
}

export const settingsRouterImplementation = SettingRouterImpl.createRouter()
