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
  getProjectMetaPath,
  readProjectConfig,
} from "@openloaf/api/services/projectTreeService"
import { resolveBoardDirFromDb } from "@openloaf/api/common/boardPaths"
import {
  syncProjectsFromDisk,
} from "@openloaf/api/services/projectDbService"
import { prisma } from "@openloaf/db"
import { getErrorMessage } from "@/shared/errorMessages"

/** Convert a board snapshot JSON to a markdown summary for AI naming. */
function boardSnapshotToMarkdown(snapshot: any, maxLines: number): string {
  const nodes: any[] = snapshot?.nodes ?? []
  if (nodes.length === 0) return ""

  const lines: string[] = []

  // Node type distribution overview
  const typeCounts: Record<string, number> = {}
  for (const node of nodes) {
    const t = node.type || "unknown"
    typeCounts[t] = (typeCounts[t] || 0) + 1
  }
  lines.push(
    `## Overview: ${Object.entries(typeCounts).map(([k, v]) => `${k}(${v})`).join(", ")}`,
  )
  lines.push("")

  for (const node of nodes) {
    if (lines.length >= maxLines) break
    const type = node.type || "unknown"
    const props = node.props ?? node.data?.props ?? node.data ?? {}

    switch (type) {
      case "text": {
        const value = typeof props.value === "string" ? props.value : ""
        if (value) lines.push(`- [Text] ${value.slice(0, 200)}`)
        break
      }
      case "link": {
        const parts = [props.title, props.url, props.description].filter(Boolean)
        if (parts.length) lines.push(`- [Link] ${parts.join(" | ")}`)
        break
      }
      case "image": {
        const fileName = props.fileName || props.src || props.url
        if (fileName) lines.push(`- [Image] ${fileName}`)
        break
      }
      case "image-generate":
      case "image_generate": {
        const prompt = props.promptText || props.prompt
        if (prompt) lines.push(`- [ImageGen] ${prompt}`)
        break
      }
      case "video-generate":
      case "video_generate": {
        const prompt = props.promptText || props.prompt
        if (prompt) lines.push(`- [VideoGen] ${prompt}`)
        break
      }
      case "group": {
        const children = Array.isArray(node.children) ? node.children.length
          : Array.isArray(node.data?.children) ? node.data.children.length : 0
        lines.push(`- [Group] ${children} children`)
        break
      }
      case "chat_input": {
        const inputText = props.inputText || ""
        if (inputText) lines.push(`- [ChatInput] ${inputText.slice(0, 200)}`)
        break
      }
      case "chat_message": {
        const msgText = props.messageText || props.content || ""
        const imageUrls = Array.isArray(props.resolvedImageUrls) ? props.resolvedImageUrls : []
        const parts: string[] = []
        if (msgText) parts.push(msgText.slice(0, 200))
        if (imageUrls.length) parts.push(`${imageUrls.length} image(s)`)
        if (parts.length) lines.push(`- [ChatMessage] ${parts.join(" | ")}`)
        else lines.push("- [ChatMessage]")
        break
      }
      case "stroke":
        // Skip strokes — not helpful for naming
        break
      default:
        lines.push(`- [${type}]`)
        break
    }
  }

  return lines.slice(0, maxLines).join("\n")
}

/** Scan project files (first N levels, max entries) for classification context. */
async function scanProjectFiles(
  rootPath: string,
  maxDepth: number,
  maxEntries: number,
): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth || results.length >= maxEntries) return
    let entries: import("node:fs").Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= maxEntries) break
      // Skip hidden directories and common non-essential directories.
      if (entry.name.startsWith(".")) continue
      if (entry.name === "node_modules" || entry.name === "__pycache__") {
        continue
      }
      const rel = path.relative(rootPath, path.join(dir, entry.name))
      if (entry.isDirectory()) {
        results.push(`${rel}/`)
        await walk(path.join(dir, entry.name), depth + 1)
      } else {
        results.push(rel)
      }
    }
  }

  await walk(rootPath, 1)
  return results
}

/**
 * AI inference and auxiliary model tRPC procedures for the settings router.
 * Extracted from settings.ts for maintainability.
 */
export const aiProcedures = {
  /** Get auxiliary model config. */
  getAuxiliaryModelConfig: shieldedProcedure
    .output(settingSchemas.getAuxiliaryModelConfig.output)
    .query(async ({ ctx }) => {
      const { readAuxiliaryModelConf } = await import(
        "@/modules/settings/auxiliaryModelConfStore"
      )
      const conf = readAuxiliaryModelConf()
      // When SaaS source is selected, fetch quota from SaaS backend.
      if (conf.modelSource === "saas") {
        try {
          const { getSaasAccessToken } = await import(
            "@/ai/shared/context/requestContext"
          )
          const token = getSaasAccessToken()
          if (token) {
            const { getSaasClient } = await import("@/modules/saas/client")
            const saasClient = getSaasClient(token)
            const quotaRes = await saasClient.auxiliary.getQuota()
            return { ...conf, quota: quotaRes.quota }
          }
        } catch {
          // Quota fetch failure is non-critical.
        }
      }
      return conf
    }),
  /** Save auxiliary model config. */
  saveAuxiliaryModelConfig: shieldedProcedure
    .input(settingSchemas.saveAuxiliaryModelConfig.input)
    .output(settingSchemas.saveAuxiliaryModelConfig.output)
    .mutation(async ({ input }) => {
      const { readAuxiliaryModelConf, writeAuxiliaryModelConf } =
        await import("@/modules/settings/auxiliaryModelConfStore")
      const current = readAuxiliaryModelConf()
      const merged = {
        modelSource: input.modelSource ?? current.modelSource,
        localModelIds: input.localModelIds ?? current.localModelIds,
        cloudModelIds: input.cloudModelIds ?? current.cloudModelIds,
        capabilities: {
          ...current.capabilities,
          ...(input.capabilities ?? {}),
        },
      }
      writeAuxiliaryModelConf(merged)
      return { ok: true }
    }),
  /** Get SaaS auxiliary quota. */
  getAuxiliaryQuota: shieldedProcedure
    .output(settingSchemas.getAuxiliaryQuota.output)
    .query(async ({ ctx }) => {
      const { getSaasAccessToken } = await import(
        "@/ai/shared/context/requestContext"
      )
      const token = getSaasAccessToken()
      if (!token) {
        throw new Error(getErrorMessage('NOT_LOGGED_IN_CLOUD', ctx.lang))
      }
      const { getSaasClient } = await import("@/modules/saas/client")
      const saasClient = getSaasClient(token)
      return saasClient.auxiliary.getQuota()
    }),
  /** Get auxiliary capabilities list. */
  getAuxiliaryCapabilities: shieldedProcedure
    .output(settingSchemas.getAuxiliaryCapabilities.output)
    .query(async () => {
      const { CAPABILITY_KEYS, AUXILIARY_CAPABILITIES } = await import(
        "@/ai/services/auxiliaryCapabilities"
      )
      return CAPABILITY_KEYS.map((key) => {
        const cap = AUXILIARY_CAPABILITIES[key]!
        return {
          key: cap.key,
          label: cap.label,
          description: cap.description,
          triggers: cap.triggers,
          defaultPrompt: cap.defaultPrompt,
          outputMode: cap.outputMode,
          outputSchema: cap.outputSchema,
        }
      })
    }),

  testAuxiliaryCapability: shieldedProcedure
    .input(settingSchemas.testAuxiliaryCapability.input)
    .output(settingSchemas.testAuxiliaryCapability.output)
    .mutation(async ({ input, ctx }) => {
      const start = Date.now()
      try {
        const { AUXILIARY_CAPABILITIES, CAPABILITY_SCHEMAS } = await import(
          "@/ai/services/auxiliaryCapabilities"
        )
        const cap = AUXILIARY_CAPABILITIES[input.capabilityKey]
        if (!cap) {
          return {
            ok: false,
            result: null,
            error: `${getErrorMessage('UNKNOWN_CAPABILITY', ctx.lang)}: ${input.capabilityKey}`,
            durationMs: Date.now() - start,
          }
        }

        // Reuse the same model resolution logic as auxiliaryInfer.
        const { generateText, Output } = await import("ai")
        const { resolveChatModel } = await import(
          "@/ai/models/resolveChatModel"
        )
        const { readAuxiliaryModelConf } = await import(
          "@/modules/settings/auxiliaryModelConfStore"
        )

        const conf = readAuxiliaryModelConf()

        // Prompt priority: customPrompt param > saved config > default.
        const savedCustom = conf.capabilities[input.capabilityKey]?.customPrompt
        const systemPrompt =
          typeof input.customPrompt === "string"
            ? input.customPrompt
            : typeof savedCustom === "string"
              ? savedCustom
              : cap.defaultPrompt

        // SaaS branch — delegate test to SaaS backend
        if (conf.modelSource === "saas") {
          const { getSaasAccessToken } = await import(
            "@/ai/shared/context/requestContext"
          )
          const token = getSaasAccessToken()
          if (!token) {
            return {
              ok: false,
              result: null,
              error: getErrorMessage('NOT_LOGGED_IN_CLOUD', ctx.lang),
              durationMs: Date.now() - start,
            }
          }
          const { getSaasClient } = await import("@/modules/saas/client")
          const saasClient = getSaasClient(token)
          const res = await saasClient.auxiliary.infer({
            capabilityKey: input.capabilityKey,
            systemPrompt,
            context: input.context,
            outputMode: cap.outputMode === "text" ? "text" : "structured",
          })
          if (!res.ok) {
            return {
              ok: false,
              result: null,
              error: res.message,
              durationMs: Date.now() - start,
            }
          }
          return {
            ok: true,
            result: res.result,
            durationMs: Date.now() - start,
            usage: {
              inputTokens: res.usage.inputTokens,
              cachedInputTokens: 0,
              outputTokens: res.usage.outputTokens,
              totalTokens: res.usage.inputTokens + res.usage.outputTokens,
            },
          }
        }

        // Local/Cloud branch
        const modelIds =
          conf.modelSource === "cloud"
            ? conf.cloudModelIds
            : conf.localModelIds
        const chatModelId = modelIds[0]?.trim() || undefined

        if (!chatModelId) {
          return {
            ok: false,
            result: null,
            error: getErrorMessage('AUXILIARY_MODEL_NOT_CONFIGURED', ctx.lang),
            durationMs: Date.now() - start,
          }
        }

        const resolved = await resolveChatModel({
          chatModelId,
          chatModelSource: conf.modelSource,
        })

        if (cap.outputMode === "text") {
          const result = await generateText({
            model: resolved.model,
            system: systemPrompt,
            prompt: input.context,
          })
          return {
            ok: true,
            result: result.text,
            durationMs: Date.now() - start,
            usage: {
              inputTokens: result.usage?.inputTokens ?? 0,
              cachedInputTokens: result.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
              outputTokens: result.usage?.outputTokens ?? 0,
              totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
            },
          }
        }

        const schema =
          CAPABILITY_SCHEMAS[
            input.capabilityKey as keyof typeof CAPABILITY_SCHEMAS
          ]
        if (!schema) {
          return {
            ok: false,
            result: null,
            error: `能力 ${input.capabilityKey} 无结构化 schema`,
            durationMs: Date.now() - start,
          }
        }

        const result = await generateText({
          model: resolved.model,
          output: Output.object({ schema: schema as any }),
          system: systemPrompt,
          prompt: input.context,
        })

        return {
          ok: true,
          result: result.output,
          durationMs: Date.now() - start,
          usage: {
            inputTokens: result.usage?.inputTokens ?? 0,
            cachedInputTokens: result.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
          },
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err)
        return {
          ok: false,
          result: null,
          error: message,
          durationMs: Date.now() - start,
        }
      }
    }),

  inferProjectType: shieldedProcedure
    .input(settingSchemas.inferProjectType.input)
    .output(settingSchemas.inferProjectType.output)
    .mutation(async ({ input }) => {
      const rootPath = getProjectRootPath(input.projectId)
      if (!rootPath) {
        return { projectType: "general", confidence: 0 }
      }
      const config = await readProjectConfig(rootPath)

      // Skip if user manually set the type.
      if (config.typeManuallySet) {
        return {
          projectType: config.projectType ?? "general",
          icon: config.icon ?? undefined,
          confidence: 1,
        }
      }

      // Scan the first two levels of the file tree (max 100 entries).
      const fileList = await scanProjectFiles(rootPath, 2, 100)
      if (!fileList.length) {
        return { projectType: "general", confidence: 0 }
      }

      const context = fileList.join("\n")
      const { auxiliaryInfer } = await import(
        "@/ai/services/auxiliaryInferenceService"
      )
      const { CAPABILITY_SCHEMAS } = await import(
        "@/ai/services/auxiliaryCapabilities"
      )

      const result = await auxiliaryInfer({
        capabilityKey: "project.classify",
        context,
        schema: CAPABILITY_SCHEMAS["project.classify"],
        fallback: { type: "general" as const, icon: "", confidence: 0 },
        saasAccessToken: input.saasAccessToken,
      })

      // Write back to project.json if confidence is sufficient.
      if (result.confidence >= 0.3) {
        const metaPath = getProjectMetaPath(rootPath)
        const updated = { ...config, projectType: result.type }
        // Only set icon if user hasn't set one yet.
        if (!config.icon && result.icon) {
          updated.icon = result.icon
        }
        const tmpPath = `${metaPath}.${Date.now()}.tmp`
        await fs.writeFile(
          tmpPath,
          JSON.stringify(updated, null, 2),
          "utf-8",
        )
        await fs.rename(tmpPath, metaPath)
        try {
          await syncProjectsFromDisk(prisma as any)
        } catch (error) {
          // 逻辑：分类结果已写回 project.json，同步快照失败时仅告警，避免影响主流程。
          console.warn("[settings.inferProjectType] sync snapshot failed", error)
        }
      }

      return {
        projectType: result.type,
        icon: result.icon || undefined,
        confidence: result.confidence,
      }
    }),

  inferProjectName: shieldedProcedure
    .input(settingSchemas.inferProjectName.input)
    .output(settingSchemas.inferProjectName.output)
    .mutation(async ({ input }) => {
      const rootPath = getProjectRootPath(input.projectId)
      const config = rootPath ? await readProjectConfig(rootPath) : null
      const fileList = rootPath
        ? await scanProjectFiles(rootPath, 2, 30)
        : []

      const contextParts: string[] = []
      if (config?.title) contextParts.push(`Current name: ${config.title}`)
      if (config?.projectType) contextParts.push(`Type: ${config.projectType}`)
      if (fileList.length > 0)
        contextParts.push(`Files:\n${fileList.join("\n")}`)

      const context = contextParts.join("\n") || "Empty project"

      const { auxiliaryInfer } = await import(
        "@/ai/services/auxiliaryInferenceService"
      )
      const { CAPABILITY_SCHEMAS } = await import(
        "@/ai/services/auxiliaryCapabilities"
      )

      const result = await auxiliaryInfer({
        capabilityKey: "project.ephemeralName",
        context,
        schema: CAPABILITY_SCHEMAS["project.ephemeralName"],
        fallback: {
          title: config?.title ?? "Untitled",
          icon: config?.icon ?? "📁",
          type: (config?.projectType ?? "general") as any,
        },
        noCache: true,
        saasAccessToken: input.saasAccessToken,
      })

      return { title: result.title, icon: result.icon, type: result.type }
    }),

  generateChatSuggestions: shieldedProcedure
    .input(settingSchemas.generateChatSuggestions.input)
    .output(settingSchemas.generateChatSuggestions.output)
    .mutation(async ({ input }) => {
      const { readLatestEntry, appendEntry } = await import(
        "@/modules/settings/chatSuggestionsStore"
      )

      // Determine scope
      const scope = input.projectId
        ? `project:${input.projectId}`
        : "global"

      // Count current sessions for this scope
      const sessionCount = input.projectId
        ? await prisma.chatSession.count({ where: { projectId: input.projectId } })
        : await prisma.chatSession.count()

      // Check JSONL cache
      const cached = readLatestEntry(scope)
      if (cached && cached.sessionCount === sessionCount) {
        return { suggestions: cached.suggestions }
      }

      const contextParts: string[] = []

      if (input.projectId) {
        const rootPath = getProjectRootPath(input.projectId)
        if (rootPath) {
          const config = await readProjectConfig(rootPath)
          if (config?.title) contextParts.push(`Project: ${config.title}`)
          if (config?.projectType)
            contextParts.push(`Type: ${config.projectType}`)
        }
      }

      if (input.currentInput) {
        contextParts.push(`Current input: ${input.currentInput}`)
      } else {
        contextParts.push("The user just opened a new chat (empty conversation).")
      }

      const context = contextParts.join("\n")

      const { auxiliaryInfer } = await import(
        "@/ai/services/auxiliaryInferenceService"
      )
      const { CAPABILITY_SCHEMAS } = await import(
        "@/ai/services/auxiliaryCapabilities"
      )

      const result = await auxiliaryInfer({
        capabilityKey: "chat.suggestions",
        context,
        schema: CAPABILITY_SCHEMAS["chat.suggestions"],
        fallback: { suggestions: [] },
        saasAccessToken: input.saasAccessToken,
      })

      appendEntry(scope, sessionCount, result.suggestions)

      return { suggestions: result.suggestions }
    }),

  generateCommitMessage: shieldedProcedure
    .input(settingSchemas.generateCommitMessage.input)
    .output(settingSchemas.generateCommitMessage.output)
    .mutation(async ({ input }) => {
      const { getProjectGitDiff } = await import(
        "@openloaf/api/services/projectGitService"
      )
      const diffResult = await getProjectGitDiff(input.projectId)
      if (!diffResult.diff) {
        return { subject: "", body: "" }
      }
      const truncatedDiff =
        diffResult.diff.length > 3000
          ? `${diffResult.diff.slice(0, 3000)}\n... (truncated)`
          : diffResult.diff

      const { auxiliaryInfer } = await import(
        "@/ai/services/auxiliaryInferenceService"
      )
      const { CAPABILITY_SCHEMAS } = await import(
        "@/ai/services/auxiliaryCapabilities"
      )

      const result = await auxiliaryInfer({
        capabilityKey: "git.commitMessage",
        context: truncatedDiff,
        schema: CAPABILITY_SCHEMAS["git.commitMessage"],
        fallback: { subject: "", body: undefined },
        noCache: true,
        saasAccessToken: input.saasAccessToken,
      })

      return { subject: result.subject, body: result.body ?? "" }
    }),

  inferBoardName: shieldedProcedure
    .input(settingSchemas.inferBoardName.input)
    .output(settingSchemas.inferBoardName.output)
    .mutation(async ({ input }) => {
      let boardPath = ""
      const boardId = input.boardId?.trim()
      if (boardId) {
        const boardResult = await resolveBoardDirFromDb(boardId)
        if (!boardResult) return { title: "" }
        boardPath = path.join(boardResult.absDir, "index.tnboard.json")
      } else {
        const { getProjectRootPath } = await import(
          "@openloaf/api/services/vfsService"
        )
        const rootPath = input.projectId ? getProjectRootPath(input.projectId) : null
        if (!rootPath) return { title: "" }

        // boardFolderUri may be a full file:// URI or a relative path like .openloaf/boards/tnboard_xxx
        let folderName = input.boardFolderUri
        if (folderName.startsWith("file://")) {
          folderName = folderName.replace(/^file:\/\//, "")
        }
        folderName = path.basename(folderName)
        boardPath = path.join(
          rootPath,
          ".openloaf",
          "boards",
          folderName,
          "index.tnboard.json",
        )
      }

      let snapshot: any
      try {
        const raw = await fs.readFile(boardPath, "utf-8")
        snapshot = JSON.parse(raw)
      } catch {
        return { title: "" }
      }

      const markdown = boardSnapshotToMarkdown(snapshot, 200)
      if (!markdown.trim()) return { title: "" }

      const { auxiliaryInfer } = await import(
        "@/ai/services/auxiliaryInferenceService"
      )
      const { CAPABILITY_SCHEMAS } = await import(
        "@/ai/services/auxiliaryCapabilities"
      )

      const result = await auxiliaryInfer({
        capabilityKey: "file.title",
        context: markdown,
        schema: CAPABILITY_SCHEMAS["file.title"],
        fallback: { title: "" },
        noCache: true,
        saasAccessToken: input.saasAccessToken,
      })

      return { title: result.title }
    }),
}
