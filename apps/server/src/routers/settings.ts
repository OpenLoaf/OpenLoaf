/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";
import {
  BaseSettingRouter,
  getProjectRootPath,
  settingSchemas,
  shieldedProcedure,
  t,
} from "@openloaf/api";
import {
  resolveFilePathFromUri,
} from "@openloaf/api/services/vfsService";
import { getOpenLoafRootDir, resolveScopedOpenLoafPath } from "@openloaf/config";
import {
  getProjectMetaPath,
  projectConfigSchema,
  readProjectConfig,
} from "@openloaf/api/services/projectTreeService";
import {
  resolveProjectAncestorRootUris,
  syncProjectsFromDisk,
} from "@openloaf/api/services/projectDbService";
import { prisma } from "@openloaf/db";
import {
  deleteSettingValueFromWeb,
  getBasicConfigForWeb,
  getProviderSettingsForWeb,
  getS3ProviderSettingsForWeb,
  getSettingsForWeb,
  setBasicConfigFromWeb,
  setSettingValueFromWeb,
} from "@/modules/settings/settingsService";
import {
  checkCliToolUpdate,
  getCliToolsStatus,
  installCliTool,
} from "@/ai/models/cli/cliToolService";
import {
  getCodexCliModels,
  getClaudeCodeCliModels,
} from "@/ai/models/cli/cliProviderEntry";
import { loadSkillSummaries } from "@/ai/services/skillsLoader";
import { readMemoryFile, resolveMemoryDir, writeMemoryFile } from "@/ai/shared/memoryLoader";
import { readAgentJson, resolveAgentDir } from "@/ai/shared/defaultAgentResolver";
import { loadAgentSummaries, readAgentConfigFromPath, serializeAgentToMarkdown } from "@/ai/services/agentConfigService";
import { CAPABILITY_GROUPS } from "@/ai/tools/capabilityGroups";
import { resolveSystemCliInfo } from "@/modules/settings/resolveSystemCliInfo";
import { resolveOfficeInfo } from "@/modules/settings/resolveOfficeInfo";
import { isSystemAgentId } from "@/ai/shared/systemAgentDefinitions";
import { getErrorMessage } from "@/shared/errorMessages";
import { getDefaultProjectStorageRootUri } from "@openloaf/api/services/appConfigService";

/** Normalize ignoreSkills list for persistence. */
function normalizeIgnoreSkills(values?: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const trimmed = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

/** Normalize global ignore keys. */
function normalizeGlobalIgnoreKeys(values?: unknown): string[] {
  const keys = normalizeIgnoreSkills(values);
  return Array.from(new Set(keys.map(normalizeGlobalIgnoreKey).filter(Boolean)));
}

/** Normalize a global ignore key. */
function normalizeGlobalIgnoreKey(ignoreKey: string): string {
  const trimmed = ignoreKey.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("global:")) return trimmed;
  if (trimmed.includes(":")) return "";
  return `global:${trimmed}`;
}

/** Build global ignore key from folder name. */
function buildGlobalIgnoreKey(folderName: string): string {
  const trimmed = folderName.trim();
  return trimmed ? `global:${trimmed}` : "";
}

/** Resolve the global skills directory path (~/.agents/skills). */
function resolveGlobalSkillsPath(): string {
  return path.join(homedir(), ".agents", "skills");
}

/** Resolve the global agents directory path (~/.agents/agents). */
function resolveGlobalAgentsPath(): string {
  return path.join(homedir(), ".agents", "agents");
}

/** Build project ignore key from folder name. */
function buildProjectIgnoreKey(input: {
  folderName: string;
  ownerProjectId?: string | null;
  currentProjectId?: string | null;
}): string {
  const trimmed = input.folderName.trim();
  if (!trimmed) return "";
  if (input.ownerProjectId && input.ownerProjectId !== input.currentProjectId) {
    return `${input.ownerProjectId}:${trimmed}`;
  }
  return trimmed;
}

/** Read ignoreSkills from project.json. */
async function readProjectIgnoreSkills(projectRootPath?: string): Promise<string[]> {
  if (!projectRootPath) return [];
  try {
    const config = await readProjectConfig(projectRootPath);
    return normalizeIgnoreSkills(config.ignoreSkills);
  } catch {
    return [];
  }
}

/** Read projectId from project.json. */
async function readProjectIdFromMeta(projectRootPath: string): Promise<string | null> {
  try {
    const metaPath = getProjectMetaPath(projectRootPath);
    const raw = JSON.parse(await fs.readFile(metaPath, "utf-8")) as {
      projectId?: string;
    };
    const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
    return projectId || null;
  } catch {
    return null;
  }
}

/** Write JSON file atomically. */
async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  // 原子写入避免读取到半写入状态。
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/** Update ignoreSkills in project.json. */
async function updateProjectIgnoreSkills(input: {
  projectRootPath: string;
  ignoreKey: string;
  enabled: boolean;
}): Promise<void> {
  const metaPath = getProjectMetaPath(input.projectRootPath);
  const raw = await fs.readFile(metaPath, "utf-8");
  const parsed = projectConfigSchema.parse(JSON.parse(raw));
  const current = normalizeIgnoreSkills(parsed.ignoreSkills);
  const normalizedKey = input.ignoreKey.trim();
  if (!normalizedKey) return;
  const nextIgnoreSkills = input.enabled
    ? current.filter((name) => name !== normalizedKey)
    : Array.from(new Set([...current, normalizedKey]));
  // 保留原有字段，仅更新 ignoreSkills。
  await writeJsonAtomic(metaPath, { ...parsed, ignoreSkills: nextIgnoreSkills });
}

/** Read ignoreSkills from global app config. */
function readGlobalIgnoreSkills(): string[] {
  try {
    const { getAppConfig } = require("@openloaf/api/services/appConfigService") as typeof import("@openloaf/api/services/appConfigService");
    const config = getAppConfig();
    return normalizeGlobalIgnoreKeys(config.ignoreSkills);
  } catch {
    return [];
  }
}

/** Update ignoreSkills in global app config. */
function updateGlobalIgnoreSkills(input: { ignoreKey: string; enabled: boolean }): void {
  const { getAppConfig, setAppConfig } = require("@openloaf/api/services/appConfigService") as typeof import("@openloaf/api/services/appConfigService");
  const config = getAppConfig();
  const normalizedKey = normalizeGlobalIgnoreKey(input.ignoreKey);
  if (!normalizedKey) return;
  const current = normalizeGlobalIgnoreKeys(config.ignoreSkills);
  const nextIgnoreSkills = input.enabled
    ? current.filter((name) => name !== normalizedKey)
    : Array.from(new Set([...current, normalizedKey]));
  setAppConfig({ ...config, ignoreSkills: nextIgnoreSkills });
}

/** Normalize an absolute path for comparison. */
function normalizeFsPath(input: string): string {
  return path.resolve(input);
}

/** Normalize skill path input to a filesystem path. */
function normalizeSkillPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) {
    return resolveFilePathFromUri(trimmed);
  }
  return normalizeFsPath(trimmed);
}

/** Resolve skill directory and scope root for deletion. */
function resolveSkillDeleteTarget(input: {
  scope: "global" | "project";
  projectId?: string;
  skillPath: string;
}): { skillDir: string; skillsRoot: string } {
  const baseRootPath =
    input.scope === "global"
      ? getOpenLoafRootDir()
      : input.projectId
        ? getProjectRootPath(input.projectId) ?? ""
        : "";
  if (!baseRootPath) {
    throw new Error("Project not found.");
  }
  const normalizedSkillPath = normalizeSkillPath(input.skillPath);
  if (!normalizedSkillPath || path.basename(normalizedSkillPath) !== "SKILL.md") {
    // 只允许删除技能目录，必须传入 SKILL.md 的路径。
    throw new Error("Invalid skill path.");
  }
  const skillDir = normalizeFsPath(path.dirname(normalizedSkillPath));
  const skillsRoot = normalizeFsPath(path.join(baseRootPath, ".agents", "skills"));
  if (skillDir === skillsRoot || !skillDir.startsWith(`${skillsRoot}${path.sep}`)) {
    // 仅允许删除 .agents/skills 目录内的技能。
    throw new Error("Skill path is outside scope.");
  }
  return { skillDir, skillsRoot };
}

/** Resolve agent directory and scope root for deletion. */
function resolveAgentDeleteTarget(input: {
  scope: "global" | "project";
  projectId?: string;
  agentPath: string;
}): { agentDir: string; agentsRoot: string } {
  const baseRootPath =
    input.scope === "global"
      ? getOpenLoafRootDir()
      : input.projectId
        ? getProjectRootPath(input.projectId) ?? ""
        : "";
  if (!baseRootPath) {
    throw new Error("Project not found.");
  }
  const normalizedAgentPath = normalizeSkillPath(input.agentPath);
  if (!normalizedAgentPath) {
    throw new Error("Invalid agent path.");
  }
  const baseName = path.basename(normalizedAgentPath);
  // 逻辑：支持 .openloaf/agents/<name>/agent.json 和 .agents/agents/<name>/AGENT.md 两种路径。
  const isOpenLoafAgent = baseName === "agent.json";
  const isLegacyAgent = baseName === "AGENT.md";
  if (!isOpenLoafAgent && !isLegacyAgent) {
    throw new Error("Invalid agent path.");
  }
  const agentDir = normalizeFsPath(path.dirname(normalizedAgentPath));
  const agentsRoot = isOpenLoafAgent
    ? normalizeFsPath(resolveScopedOpenLoafPath(baseRootPath, "agents"))
    : normalizeFsPath(path.join(baseRootPath, ".agents", "agents"));
  if (agentDir === agentsRoot || !agentDir.startsWith(`${agentsRoot}${path.sep}`)) {
    throw new Error("Agent path is outside scope.");
  }
  return { agentDir, agentsRoot };
}

/** Resolve owner project id from skill path. */
function resolveOwnerProjectId(input: {
  skillPath: string;
  candidates: Array<{ rootPath: string; projectId: string }>;
}): string | null {
  const normalizedSkillPath = normalizeFsPath(input.skillPath);
  let matched: { rootPath: string; projectId: string } | null = null;
  for (const candidate of input.candidates) {
    const normalizedRoot = normalizeFsPath(candidate.rootPath);
    if (
      normalizedSkillPath === normalizedRoot ||
      normalizedSkillPath.startsWith(`${normalizedRoot}${path.sep}`)
    ) {
      if (!matched || normalizedRoot.length > matched.rootPath.length) {
        matched = { rootPath: normalizedRoot, projectId: candidate.projectId };
      }
    }
  }
  return matched?.projectId ?? null;
}

export class SettingRouterImpl extends BaseSettingRouter {
  /** Settings read/write (server-side). */
  public static createRouter() {
    return t.router({
      getAll: shieldedProcedure
        .output(settingSchemas.getAll.output)
        .query(async () => {
          return await getSettingsForWeb();
        }),
      getProviders: shieldedProcedure
        .output(settingSchemas.getProviders.output)
        .query(async () => {
          return await getProviderSettingsForWeb();
        }),
      getS3Providers: shieldedProcedure
        .output(settingSchemas.getS3Providers.output)
        .query(async () => {
          return await getS3ProviderSettingsForWeb();
        }),
      getBasic: shieldedProcedure
        .output(settingSchemas.getBasic.output)
        .query(async () => {
          return await getBasicConfigForWeb();
        }),
      getProjectStorageRoot: shieldedProcedure
        .output(settingSchemas.getProjectStorageRoot.output)
        .query(async () => {
          return {
            rootUri: getDefaultProjectStorageRootUri(),
          };
        }),
      getCliToolsStatus: shieldedProcedure
        .output(settingSchemas.getCliToolsStatus.output)
        .query(async () => {
          return await getCliToolsStatus();
        }),
      /** Get system CLI info for settings UI. */
      systemCliInfo: shieldedProcedure
        .output(settingSchemas.systemCliInfo.output)
        .query(async () => {
          return await resolveSystemCliInfo();
        }),
      officeInfo: shieldedProcedure
        .output(settingSchemas.officeInfo.output)
        .query(async () => {
          return resolveOfficeInfo();
        }),
      /** Get Codex CLI available models. */
      getCodexModels: shieldedProcedure
        .output(settingSchemas.getCodexModels.output)
        .query(() => {
          return getCodexCliModels().map((m) => ({ id: m.id, name: m.name ?? m.id, tags: m.tags }));
        }),
      /** Get Claude Code CLI available models. */
      getClaudeCodeModels: shieldedProcedure
        .output(settingSchemas.getClaudeCodeModels.output)
        .query(() => {
          return getClaudeCodeCliModels().map((m) => ({ id: m.id, name: m.name ?? m.id, tags: m.tags }));
        }),
      /** List skills for settings UI. */
      getSkills: shieldedProcedure
        .input(settingSchemas.getSkills.input)
        .output(settingSchemas.getSkills.output)
        .query(async ({ input }) => {
          const projectRootPath = input?.projectId
            ? getProjectRootPath(input.projectId) ?? undefined
            : undefined;
          const parentProjectRootUris = input?.projectId
            ? await resolveProjectAncestorRootUris(prisma, input.projectId)
            : [];
          const parentRootEntries = parentProjectRootUris
            .map((rootUri) => {
              try {
                const rootPath = resolveFilePathFromUri(rootUri);
                return { rootUri, rootPath };
              } catch {
                return null;
              }
            })
            .filter(
              (entry): entry is { rootUri: string; rootPath: string } =>
                Boolean(entry),
            );
          const parentProjectRootPaths = parentRootEntries.map((entry) => entry.rootPath);
          const globalIgnoreSkills = readGlobalIgnoreSkills();
          const projectIgnoreSkills = await readProjectIgnoreSkills(projectRootPath);
          const summaries = loadSkillSummaries({
            projectRootPath,
            parentProjectRootPaths,
            globalSkillsPath: resolveGlobalSkillsPath(),
          });
          const projectCandidates: Array<{ rootPath: string; projectId: string }> = [];
          if (projectRootPath && input?.projectId) {
            projectCandidates.push({
              rootPath: projectRootPath,
              projectId: input.projectId,
            });
          }
          const parentProjectRows = parentProjectRootUris.length
            ? await prisma.project.findMany({
                where: { rootUri: { in: parentProjectRootUris }, isDeleted: false },
                select: { id: true, rootUri: true },
              })
            : [];
          const parentIdByRootUri = new Map(
            parentProjectRows.map((row) => [row.rootUri, row.id]),
          );
          for (const entry of parentRootEntries) {
            const parentId =
              (await readProjectIdFromMeta(entry.rootPath)) ??
              parentIdByRootUri.get(entry.rootUri) ??
              null;
            if (!parentId) continue;
            projectCandidates.push({
              rootPath: entry.rootPath,
              projectId: parentId,
            });
          }
          const items = summaries.map((summary) => {
            // 关键：ignoreKey 按 scope/父项目区分，避免同名冲突。
            const ownerProjectId =
              summary.scope === "project"
                ? resolveOwnerProjectId({
                    skillPath: summary.path,
                    candidates: projectCandidates,
                  })
                : null;
            const ignoreKey =
              summary.scope === "global"
                ? buildGlobalIgnoreKey(summary.folderName)
                : buildProjectIgnoreKey({
                      folderName: summary.folderName,
                      ownerProjectId,
                      currentProjectId: input?.projectId ?? null,
                    });
            const isEnabled =
              summary.scope === "global"
                ? input?.projectId
                  ? !projectIgnoreSkills.includes(ignoreKey)
                  : !globalIgnoreSkills.includes(ignoreKey)
                : !projectIgnoreSkills.includes(ignoreKey);
            // 全局技能不可删除（位于用户主目录）。
            const isDeletable = summary.scope === "global"
              ? false
              : input?.projectId
                ? summary.scope === "project" && ownerProjectId === input.projectId
                : false;
            return { ...summary, ignoreKey, isEnabled, isDeletable };
          });
          // 全局级别关闭后不在项目列表展示。
          if (input?.projectId) {
            return items.filter(
              (item) =>
                item.scope !== "global" ||
                !globalIgnoreSkills.includes(item.ignoreKey)
            );
          }
          return items;
        }),
      setSkillEnabled: shieldedProcedure
        .input(settingSchemas.setSkillEnabled.input)
        .output(settingSchemas.setSkillEnabled.output)
        .mutation(async ({ input, ctx }) => {
          const ignoreKey = input.ignoreKey.trim();
          if (!ignoreKey) {
            throw new Error(getErrorMessage('IGNORE_KEY_REQUIRED', ctx.lang));
          }
          // 全局技能共用 global 级别的 ignoreSkills 列表。
          if (input.scope === "global") {
            updateGlobalIgnoreSkills({
              ignoreKey,
              enabled: input.enabled,
            });
            return { ok: true };
          }
          const projectId = input.projectId?.trim();
          if (!projectId) {
            throw new Error(getErrorMessage('PROJECT_ID_REQUIRED', ctx.lang));
          }
          const projectRootPath = getProjectRootPath(projectId);
          if (!projectRootPath) {
            throw new Error(getErrorMessage('PROJECT_NOT_FOUND', ctx.lang));
          }
          await updateProjectIgnoreSkills({
            projectRootPath,
            ignoreKey,
            enabled: input.enabled,
          });
          return { ok: true };
        }),
      deleteSkill: shieldedProcedure
        .input(settingSchemas.deleteSkill.input)
        .output(settingSchemas.deleteSkill.output)
        .mutation(async ({ input }) => {
          const ignoreKey = input.ignoreKey.trim();
          if (!ignoreKey) {
            throw new Error("Ignore key is required.");
          }
          // 全局技能不允许从设置面板删除。
          if (input.scope === "global") {
            throw new Error("Global skills cannot be deleted from settings.");
          }
          if (input.scope === "project") {
            // 项目页只允许删除当前项目技能，禁止父项目。
            if (ignoreKey.includes(":")) {
              const prefix = ignoreKey.split(":")[0]?.trim();
              if (prefix && prefix !== input.projectId) {
                throw new Error("Parent project skills cannot be deleted here.");
              }
            }
          }
          const target = resolveSkillDeleteTarget({
            scope: input.scope,
            projectId: input.projectId,
            skillPath: input.skillPath,
          });
          await fs.rm(target.skillDir, { recursive: true, force: true });
          const projectId = input.projectId?.trim();
          if (!projectId) {
            throw new Error("Project id is required.");
          }
          const projectRootPath = getProjectRootPath(projectId);
          if (!projectRootPath) {
            throw new Error("Project not found.");
          }
          await updateProjectIgnoreSkills({
            projectRootPath,
            ignoreKey,
            enabled: true,
          });
          return { ok: true };
        }),
      /** List agents for settings UI. */
      getAgents: shieldedProcedure
        .input(settingSchemas.getAgents.input)
        .output(settingSchemas.getAgents.output)
        .query(async ({ input }) => {
          const projectRootPath = input?.projectId
            ? getProjectRootPath(input.projectId) ?? undefined
            : undefined;
          const parentProjectRootUris = input?.projectId
            ? await resolveProjectAncestorRootUris(prisma, input.projectId)
            : [];
          const parentRootEntries = parentProjectRootUris
            .map((rootUri) => {
              try {
                const rootPath = resolveFilePathFromUri(rootUri);
                return { rootUri, rootPath };
              } catch {
                return null;
              }
            })
            .filter(
              (entry): entry is { rootUri: string; rootPath: string } =>
                Boolean(entry),
            );
          const parentProjectRootPaths = parentRootEntries.map((e) => e.rootPath);
          const globalIgnoreSkills = readGlobalIgnoreSkills();
          const projectIgnoreSkills = await readProjectIgnoreSkills(projectRootPath);
          const summaries = loadAgentSummaries({
            projectRootPath,
            parentProjectRootPaths,
            globalAgentsPath: resolveGlobalAgentsPath(),
          });
          const projectCandidates: Array<{ rootPath: string; projectId: string }> = [];
          if (projectRootPath && input?.projectId) {
            projectCandidates.push({
              rootPath: projectRootPath,
              projectId: input.projectId,
            });
          }
          const parentProjectRows = parentProjectRootUris.length
            ? await prisma.project.findMany({
                where: { rootUri: { in: parentProjectRootUris }, isDeleted: false },
                select: { id: true, rootUri: true },
              })
            : [];
          const parentIdByRootUri = new Map(
            parentProjectRows.map((row) => [row.rootUri, row.id]),
          );
          for (const entry of parentRootEntries) {
            const parentId =
              (await readProjectIdFromMeta(entry.rootPath)) ??
              parentIdByRootUri.get(entry.rootUri) ??
              null;
            if (!parentId) continue;
            projectCandidates.push({
              rootPath: entry.rootPath,
              projectId: parentId,
            });
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
                : null;
            const ignoreKey =
              summary.scope === "global"
                ? buildGlobalIgnoreKey(summary.folderName)
                : buildProjectIgnoreKey({
                      folderName: summary.folderName,
                      ownerProjectId,
                      currentProjectId: input?.projectId ?? null,
                    });
            const isEnabled =
              summary.scope === "global"
                ? input?.projectId
                  ? !projectIgnoreSkills.includes(`agent:${ignoreKey}`)
                  : !globalIgnoreSkills.includes(`agent:${ignoreKey}`)
                : !projectIgnoreSkills.includes(`agent:${ignoreKey}`);
            const isOpenLoafAgent = summary.path.includes('.openloaf/agents/') || summary.path.includes('.openloaf\\agents\\');
            const isSysAgent = isOpenLoafAgent && isSystemAgentId(summary.folderName);
            const isDeletable = isSysAgent
              ? false
              : summary.scope === "global"
                ? false
                : input?.projectId
                  ? summary.scope === "project" && ownerProjectId === input.projectId
                  : false;
            const isInherited = summary.scope === "project" && Boolean(input?.projectId) && ownerProjectId !== input?.projectId;
            const isChildProject = childProjectPaths.has(summary.path)
            return { ...summary, ignoreKey, isEnabled, isDeletable, isInherited, isChildProject, isSystem: isSysAgent };
          });
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
            );
          }
          return userOnly;
        }),
      /** Toggle agent enabled state. */
      setAgentEnabled: shieldedProcedure
        .input(settingSchemas.setAgentEnabled.input)
        .output(settingSchemas.setAgentEnabled.output)
        .mutation(async ({ input }) => {
          const ignoreKey = `agent:${input.ignoreKey.trim()}`;
          if (!ignoreKey) {
            throw new Error("Ignore key is required.");
          }
          if (input.scope === "global") {
            updateGlobalIgnoreSkills({
              ignoreKey,
              enabled: input.enabled,
            });
            return { ok: true };
          }
          const projectId = input.projectId?.trim();
          if (!projectId) {
            throw new Error("Project id is required.");
          }
          const projectRootPath = getProjectRootPath(projectId);
          if (!projectRootPath) {
            throw new Error("Project not found.");
          }
          await updateProjectIgnoreSkills({
            projectRootPath,
            ignoreKey,
            enabled: input.enabled,
          });
          return { ok: true };
        }),
      /** Delete an agent folder. */
      deleteAgent: shieldedProcedure
        .input(settingSchemas.deleteAgent.input)
        .output(settingSchemas.deleteAgent.output)
        .mutation(async ({ input }) => {
          const ignoreKey = input.ignoreKey.trim();
          if (!ignoreKey) {
            throw new Error("Ignore key is required.");
          }
          // 逻辑：系统 Agent 不可删除。
          const folderName = ignoreKey.includes(":") ? ignoreKey.split(":").pop()! : ignoreKey;
          if (isSystemAgentId(folderName)) {
            throw new Error("System agents cannot be deleted.");
          }
          if (input.scope === "global") {
            throw new Error("Global agents cannot be deleted from settings.");
          }
          if (input.scope === "project") {
            if (ignoreKey.includes(":")) {
              const prefix = ignoreKey.split(":")[0]?.trim();
              if (prefix && prefix !== input.projectId) {
                throw new Error("Parent project agents cannot be deleted here.");
              }
            }
          }
          const target = resolveAgentDeleteTarget({
            scope: input.scope,
            projectId: input.projectId,
            agentPath: input.agentPath,
          });
          await fs.rm(target.agentDir, { recursive: true, force: true });
          const projectId = input.projectId?.trim();
          if (!projectId) {
            throw new Error("Project id is required.");
          }
          const projectRootPath = getProjectRootPath(projectId);
          if (!projectRootPath) {
            throw new Error("Project not found.");
          }
          await updateProjectIgnoreSkills({
            projectRootPath,
            ignoreKey: `agent:${ignoreKey}`,
            enabled: true,
          });
          return { ok: true };
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
          }));
        }),
      /** Get full agent detail by path. */
      getAgentDetail: shieldedProcedure
        .input(settingSchemas.getAgentDetail.input)
        .output(settingSchemas.getAgentDetail.output)
        .query(async ({ input }) => {
          // 逻辑：agent.json 路径走 .openloaf/agents/ 结构，AGENT.md 走旧结构。
          if (path.basename(input.agentPath) === "agent.json") {
            const { readAgentJson } = await import("@/ai/shared/defaultAgentResolver");
            const agentDir = path.dirname(input.agentPath);
            const descriptor = readAgentJson(agentDir);
            if (!descriptor) {
              throw new Error(`Agent not found at ${input.agentPath}`);
            }
            // 逻辑：读取同目录下的 prompt.md 作为 systemPrompt。
            const agentMdPath = path.join(agentDir, "prompt.md");
            let systemPrompt = "";
            try {
              const { readFileSync, existsSync } = await import("node:fs");
              if (existsSync(agentMdPath)) {
                systemPrompt = readFileSync(agentMdPath, "utf8").trim();
              }
            } catch { /* ignore */ }
            // 逻辑：prompt.md 不存在时，fallback 到内嵌模板的 systemPrompt。
            if (!systemPrompt) {
              const { getTemplate } = await import("@/ai/agent-templates");
              const folderName = path.basename(agentDir);
              const template = getTemplate(folderName);
              if (template?.systemPrompt) {
                systemPrompt = template.systemPrompt;
              }
            }
            const modelLocalIds = Array.isArray(descriptor.modelLocalIds)
              ? descriptor.modelLocalIds
              : [];
            const modelCloudIds = Array.isArray(descriptor.modelCloudIds)
              ? descriptor.modelCloudIds
              : [];
            const auxiliaryModelLocalIds = Array.isArray(
              descriptor.auxiliaryModelLocalIds,
            )
              ? descriptor.auxiliaryModelLocalIds
              : [];
            const auxiliaryModelCloudIds = Array.isArray(
              descriptor.auxiliaryModelCloudIds,
            )
              ? descriptor.auxiliaryModelCloudIds
              : [];
            const imageModelIds = Array.isArray(descriptor.imageModelIds)
              ? descriptor.imageModelIds
              : [];
            const videoModelIds = Array.isArray(descriptor.videoModelIds)
              ? descriptor.videoModelIds
              : [];
            const codeModelIds = Array.isArray(descriptor.codeModelIds)
              ? descriptor.codeModelIds
              : [];
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
            };
          }
          const config = readAgentConfigFromPath(input.agentPath, input.scope);
          if (!config) {
            throw new Error(`Agent not found at ${input.agentPath}`);
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
          };
        }),
      /** Save (create or update) an agent. */
      saveAgent: shieldedProcedure
        .input(settingSchemas.saveAgent.input)
        .output(settingSchemas.saveAgent.output)
        .mutation(async ({ input }) => {
          if (input.agentPath) {
            // 逻辑：更新已有 Agent。
            const { writeFileSync, existsSync: existsFsSync } = await import("node:fs");
            if (path.basename(input.agentPath) === "agent.json") {
              // 逻辑：.openloaf/agents/ 结构 — 更新 agent.json + AGENT.md。
              const agentDir = path.dirname(input.agentPath);
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
              };
              writeFileSync(input.agentPath, JSON.stringify(descriptor, null, 2), "utf8");
              // 逻辑：prompt 与模板默认相同 → 删除 prompt.md；不同 → 写入作为覆盖。
              const { getTemplate } = await import("@/ai/agent-templates");
              const folderName = path.basename(agentDir);
              const template = getTemplate(folderName);
              const promptMdPath = path.join(agentDir, "prompt.md");
              const isDefault = !input.systemPrompt?.trim()
                || input.systemPrompt.trim() === template?.systemPrompt?.trim();
              if (isDefault) {
                const { unlinkSync } = await import("node:fs");
                if (existsFsSync(promptMdPath)) {
                  try { unlinkSync(promptMdPath); } catch { /* ignore */ }
                }
              } else {
                writeFileSync(promptMdPath, input.systemPrompt!.trim(), "utf8");
              }
              return { ok: true, agentPath: input.agentPath };
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
            });
            writeFileSync(input.agentPath, content, "utf8");
            return { ok: true, agentPath: input.agentPath };
          }

          // 逻辑：创建新 Agent — 写入 .openloaf/agents/<name>/ 目录。
          const { mkdirSync, writeFileSync: writeFsSync } = await import("node:fs");
          const { resolveAgentsRootDir } = await import("@/ai/shared/defaultAgentResolver");

          let rootPath: string;
          if (input.scope === "project" && input.projectId) {
            rootPath = getProjectRootPath(input.projectId) ?? "";
            if (!rootPath) throw new Error("Project not found.");
          } else if (input.scope === "global") {
            rootPath = resolveGlobalAgentsPath();
            const sanitizedName = input.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
            const agentDir = path.join(rootPath, sanitizedName);
            mkdirSync(agentDir, { recursive: true });
            const filePath = path.join(agentDir, "AGENT.md");
            const content = serializeAgentToMarkdown({
              name: input.name,
              description: input.description,
              icon: input.icon,
              modelLocalIds: input.modelLocalIds,
              modelCloudIds: input.modelCloudIds,
              auxiliaryModelSource: input.auxiliaryModelSource,
              auxiliaryModelLocalIds: input.auxiliaryModelLocalIds,
              auxiliaryModelCloudIds: input.auxiliaryModelCloudIds,
              toolIds: input.toolIds,
              skills: input.skills,
              allowSubAgents: input.allowSubAgents,
              maxDepth: input.maxDepth,
              systemPrompt: input.systemPrompt,
            });
            writeFsSync(filePath, content, "utf8");
            return { ok: true, agentPath: filePath };
          } else {
            rootPath = getOpenLoafRootDir();
          }

          const sanitizedName = input.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
          const agentsRoot = resolveAgentsRootDir(rootPath);
          const agentDir = path.join(agentsRoot, sanitizedName);
          mkdirSync(agentDir, { recursive: true });
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
          };
          const jsonPath = path.join(agentDir, "agent.json");
          writeFsSync(jsonPath, JSON.stringify(descriptor, null, 2), "utf8");
          if (input.systemPrompt?.trim()) {
            writeFsSync(path.join(agentDir, "prompt.md"), input.systemPrompt.trim(), "utf8");
          }
          return { ok: true, agentPath: jsonPath };
        }),
      /** Copy a global agent to a project. */
      copyAgentToProject: shieldedProcedure
        .input(settingSchemas.copyAgentToProject.input)
        .output(settingSchemas.copyAgentToProject.output)
        .mutation(async ({ input }) => {
          const { mkdirSync, writeFileSync: writeFsSync, readFileSync, existsSync } = await import("node:fs");
          const { resolveAgentsRootDir } = await import("@/ai/shared/defaultAgentResolver");

          const projectRootPath = getProjectRootPath(input.projectId);
          if (!projectRootPath) throw new Error("Project not found.");

          // 逻辑：读取源 agent 配置。
          const sourceNormalized = normalizeSkillPath(input.sourceAgentPath);
          if (!sourceNormalized) throw new Error("Invalid source agent path.");
          const sourceBaseName = path.basename(sourceNormalized);
          const sourceDir = path.dirname(sourceNormalized);

          const targetFolderName = input.asMaster ? "master" : path.basename(sourceDir);
          const agentsRoot = resolveAgentsRootDir(projectRootPath);
          const targetDir = path.join(agentsRoot, targetFolderName);
          mkdirSync(targetDir, { recursive: true });

          if (sourceBaseName === "agent.json") {
            // 逻辑：.openloaf/agents/ 结构 — 复制 agent.json + prompt.md。
            const { readAgentJson } = await import("@/ai/shared/defaultAgentResolver");
            const descriptor = readAgentJson(sourceDir);
            if (!descriptor) throw new Error("Source agent not found.");
            const targetJsonPath = path.join(targetDir, "agent.json");
            writeFsSync(targetJsonPath, JSON.stringify(descriptor, null, 2), "utf8");
            const sourceMdPath = path.join(sourceDir, "prompt.md");
            if (existsSync(sourceMdPath)) {
              const mdContent = readFileSync(sourceMdPath, "utf8");
              writeFsSync(path.join(targetDir, "prompt.md"), mdContent, "utf8");
            }
            return { ok: true, agentPath: targetJsonPath };
          }

          // 逻辑：旧 .agents/agents/ 结构 — 复制 AGENT.md。
          const config = readAgentConfigFromPath(sourceNormalized, "global");
          if (!config) throw new Error("Source agent not found.");
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
          };
          const targetJsonPath = path.join(targetDir, "agent.json");
          writeFsSync(targetJsonPath, JSON.stringify(descriptor, null, 2), "utf8");
          if (config.systemPrompt?.trim()) {
            writeFsSync(path.join(targetDir, "prompt.md"), config.systemPrompt.trim(), "utf8");
          }
          return { ok: true, agentPath: targetJsonPath };
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async ({ input }) => {
          await setSettingValueFromWeb(input.key, input.value, input.category);
          return { ok: true };
        }),
      remove: shieldedProcedure
        .input(settingSchemas.remove.input)
        .output(settingSchemas.remove.output)
        .mutation(async ({ input }) => {
          await deleteSettingValueFromWeb(input.key, input.category);
          return { ok: true };
        }),
      installCliTool: shieldedProcedure
        .input(settingSchemas.installCliTool.input)
        .output(settingSchemas.installCliTool.output)
        .mutation(async ({ input }) => {
          const status = await installCliTool(input.id);
          return { ok: true, status };
        }),
      checkCliToolUpdate: shieldedProcedure
        .input(settingSchemas.checkCliToolUpdate.input)
        .output(settingSchemas.checkCliToolUpdate.output)
        .mutation(async ({ input }) => {
          const status = await checkCliToolUpdate(input.id);
          return { ok: true, status };
        }),
      setBasic: shieldedProcedure
        .input(settingSchemas.setBasic.input)
        .output(settingSchemas.setBasic.output)
        .mutation(async ({ input }) => {
          return await setBasicConfigFromWeb(input);
        }),
      /** Get memory content by scope ('user' = global, 'project' = project-level). */
      getMemory: shieldedProcedure
        .input(settingSchemas.getMemory.input)
        .output(settingSchemas.getMemory.output)
        .query(async ({ input }) => {
          const scope = input?.scope ?? 'user';
          if (scope === 'user') {
            const content = readMemoryFile(getOpenLoafRootDir());
            return { content };
          }
          // scope === 'project'
          const projectRootPath = input?.projectId
            ? getProjectRootPath(input.projectId) ?? undefined
            : undefined;
          if (!projectRootPath) return { content: '' };
          const content = readMemoryFile(projectRootPath);
          return { content };
        }),
      /** Get memory directory URI by scope ('user' = global, 'project' = project-level). */
      getMemoryDirUri: shieldedProcedure
        .input(settingSchemas.getMemoryDirUri.input)
        .output(settingSchemas.getMemoryDirUri.output)
        .query(async ({ input }) => {
          const scope = input?.scope ?? 'user';
          let rootPath: string | undefined;
          if (scope === 'user') {
            rootPath = getOpenLoafRootDir();
          } else {
            rootPath = input?.projectId
              ? getProjectRootPath(input.projectId) ?? undefined
              : undefined;
          }
          if (!rootPath) return { dirUri: '', indexUri: '' };
          const memoryDirPath = resolveMemoryDir(rootPath);
          const dirUri = pathToFileURL(memoryDirPath).href;
          const indexUri = pathToFileURL(path.join(memoryDirPath, 'MEMORY.md')).href;
          return { dirUri, indexUri };
        }),
      /** Save memory content by scope ('user' = global, 'project' = project-level). */
      saveMemory: shieldedProcedure
        .input(settingSchemas.saveMemory.input)
        .output(settingSchemas.saveMemory.output)
        .mutation(async ({ input }) => {
          const scope = input.scope ?? 'user';
          if (scope === 'user') {
            writeMemoryFile(getOpenLoafRootDir(), input.content);
            return { ok: true };
          }
          // scope === 'project'
          const rootPath = input.projectId
            ? getProjectRootPath(input.projectId)
            : null;
          if (!rootPath) return { ok: false };
          writeMemoryFile(rootPath, input.content);
          return { ok: true };
        }),
      /** Get skills for a sub-agent by name. */
      getAgentSkillsByName: shieldedProcedure
        .input(settingSchemas.getAgentSkillsByName.input)
        .output(settingSchemas.getAgentSkillsByName.output)
        .query(async ({ input }) => {
          const globalRootPath = getOpenLoafRootDir();
          const roots = [globalRootPath].filter(Boolean) as string[];
          for (const rootPath of roots) {
            const descriptor = readAgentJson(resolveAgentDir(rootPath, input.agentName));
            if (descriptor) {
              return { skills: Array.isArray(descriptor.skills) ? descriptor.skills : [] };
            }
          }
          return { skills: [] };
        }),
      /** Save skills for a sub-agent by name. */
      saveAgentSkillsByName: shieldedProcedure
        .input(settingSchemas.saveAgentSkillsByName.input)
        .output(settingSchemas.saveAgentSkillsByName.output)
        .mutation(async ({ input }) => {
          const globalRootPath = getOpenLoafRootDir();
          if (!globalRootPath) throw new Error("No global root");
          const agentDir = resolveAgentDir(globalRootPath, input.agentName);
          const descriptor = readAgentJson(agentDir);
          if (!descriptor) throw new Error(`Agent '${input.agentName}' not found`);
          const jsonPath = path.join(agentDir, "agent.json");
          const updated = { ...descriptor, skills: input.skills };
          await fs.writeFile(jsonPath, JSON.stringify(updated, null, 2), "utf8");
          return { ok: true };
        }),
      /** Get auxiliary model config. */
      getAuxiliaryModelConfig: shieldedProcedure
        .output(settingSchemas.getAuxiliaryModelConfig.output)
        .query(async ({ ctx }) => {
          const { readAuxiliaryModelConf } = await import(
            "@/modules/settings/auxiliaryModelConfStore"
          );
          const conf = readAuxiliaryModelConf();
          // When SaaS source is selected, fetch quota from SaaS backend.
          if (conf.modelSource === "saas") {
            try {
              const { getSaasAccessToken } = await import(
                "@/ai/shared/context/requestContext"
              );
              const token = getSaasAccessToken();
              if (token) {
                const { getSaasClient } = await import("@/modules/saas/client");
                const saasClient = getSaasClient(token);
                const quotaRes = await saasClient.auxiliary.getQuota();
                return { ...conf, quota: quotaRes.quota };
              }
            } catch {
              // Quota fetch failure is non-critical.
            }
          }
          return conf;
        }),
      /** Save auxiliary model config. */
      saveAuxiliaryModelConfig: shieldedProcedure
        .input(settingSchemas.saveAuxiliaryModelConfig.input)
        .output(settingSchemas.saveAuxiliaryModelConfig.output)
        .mutation(async ({ input }) => {
          const { readAuxiliaryModelConf, writeAuxiliaryModelConf } =
            await import("@/modules/settings/auxiliaryModelConfStore");
          const current = readAuxiliaryModelConf();
          const merged = {
            modelSource: input.modelSource ?? current.modelSource,
            localModelIds: input.localModelIds ?? current.localModelIds,
            cloudModelIds: input.cloudModelIds ?? current.cloudModelIds,
            capabilities: {
              ...current.capabilities,
              ...(input.capabilities ?? {}),
            },
          };
          writeAuxiliaryModelConf(merged);
          return { ok: true };
        }),
      /** Get SaaS auxiliary quota. */
      getAuxiliaryQuota: shieldedProcedure
        .output(settingSchemas.getAuxiliaryQuota.output)
        .query(async ({ ctx }) => {
          const { getSaasAccessToken } = await import(
            "@/ai/shared/context/requestContext"
          );
          const token = getSaasAccessToken();
          if (!token) {
            throw new Error(getErrorMessage('NOT_LOGGED_IN_CLOUD', ctx.lang));
          }
          const { getSaasClient } = await import("@/modules/saas/client");
          const saasClient = getSaasClient(token);
          return saasClient.auxiliary.getQuota();
        }),
      /** Get auxiliary capability definitions. */
      getAuxiliaryCapabilities: shieldedProcedure
        .output(settingSchemas.getAuxiliaryCapabilities.output)
        .query(async () => {
          const { CAPABILITY_KEYS, AUXILIARY_CAPABILITIES } = await import(
            "@/ai/services/auxiliaryCapabilities"
          );
          return CAPABILITY_KEYS.map((key) => {
            const cap = AUXILIARY_CAPABILITIES[key]!;
            return {
              key: cap.key,
              label: cap.label,
              description: cap.description,
              triggers: cap.triggers,
              defaultPrompt: cap.defaultPrompt,
              outputMode: cap.outputMode,
              outputSchema: cap.outputSchema,
            };
          });
        }),

      testAuxiliaryCapability: shieldedProcedure
        .input(settingSchemas.testAuxiliaryCapability.input)
        .output(settingSchemas.testAuxiliaryCapability.output)
        .mutation(async ({ input, ctx }) => {
          const start = Date.now();
          try {
            const { AUXILIARY_CAPABILITIES, CAPABILITY_SCHEMAS } = await import(
              "@/ai/services/auxiliaryCapabilities"
            );
            const cap = AUXILIARY_CAPABILITIES[input.capabilityKey];
            if (!cap) {
              return {
                ok: false,
                result: null,
                error: `${getErrorMessage('UNKNOWN_CAPABILITY', ctx.lang)}: ${input.capabilityKey}`,
                durationMs: Date.now() - start,
              };
            }

            // Reuse the same model resolution logic as auxiliaryInfer.
            const { generateObject, generateText } = await import("ai");
            const { resolveChatModel } = await import(
              "@/ai/models/resolveChatModel"
            );
            const { readAuxiliaryModelConf } = await import(
              "@/modules/settings/auxiliaryModelConfStore"
            );

            const conf = readAuxiliaryModelConf();

            // Prompt priority: customPrompt param > saved config > default.
            const savedCustom = conf.capabilities[input.capabilityKey]?.customPrompt;
            const systemPrompt =
              typeof input.customPrompt === "string"
                ? input.customPrompt
                : typeof savedCustom === "string"
                  ? savedCustom
                  : cap.defaultPrompt;

            // SaaS branch — delegate test to SaaS backend
            if (conf.modelSource === "saas") {
              const { getSaasAccessToken } = await import(
                "@/ai/shared/context/requestContext"
              );
              const token = getSaasAccessToken();
              if (!token) {
                return {
                  ok: false,
                  result: null,
                  error: getErrorMessage('NOT_LOGGED_IN_CLOUD', ctx.lang),
                  durationMs: Date.now() - start,
                };
              }
              const { getSaasClient } = await import("@/modules/saas/client");
              const saasClient = getSaasClient(token);
              const res = await saasClient.auxiliary.infer({
                capabilityKey: input.capabilityKey,
                systemPrompt,
                context: input.context,
                outputMode: cap.outputMode === "text" ? "text" : "structured",
              });
              if (!res.ok) {
                return {
                  ok: false,
                  result: null,
                  error: res.message,
                  durationMs: Date.now() - start,
                };
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
              };
            }

            // Local/Cloud branch
            const modelIds =
              conf.modelSource === "cloud"
                ? conf.cloudModelIds
                : conf.localModelIds;
            const chatModelId = modelIds[0]?.trim() || undefined;

            if (!chatModelId) {
              return {
                ok: false,
                result: null,
                error: getErrorMessage('AUXILIARY_MODEL_NOT_CONFIGURED', ctx.lang),
                durationMs: Date.now() - start,
              };
            }

            const resolved = await resolveChatModel({
              chatModelId,
              chatModelSource: conf.modelSource,
            });

            if (cap.outputMode === "text") {
              const result = await generateText({
                model: resolved.model,
                system: systemPrompt,
                prompt: input.context,
              });
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
              };
            }

            const schema =
              CAPABILITY_SCHEMAS[
                input.capabilityKey as keyof typeof CAPABILITY_SCHEMAS
              ];
            if (!schema) {
              return {
                ok: false,
                result: null,
                error: `能力 ${input.capabilityKey} 无结构化 schema`,
                durationMs: Date.now() - start,
              };
            }

            const result = await generateObject({
              model: resolved.model,
              schema,
              system: systemPrompt,
              prompt: input.context,
            });

            return {
              ok: true,
              result: result.object,
              durationMs: Date.now() - start,
              usage: {
                inputTokens: result.usage?.inputTokens ?? 0,
                cachedInputTokens: result.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
                outputTokens: result.usage?.outputTokens ?? 0,
                totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
              },
            };
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : String(err);
            return {
              ok: false,
              result: null,
              error: message,
              durationMs: Date.now() - start,
            };
          }
        }),

      inferProjectType: shieldedProcedure
        .input(settingSchemas.inferProjectType.input)
        .output(settingSchemas.inferProjectType.output)
        .mutation(async ({ input }) => {
          const rootPath = getProjectRootPath(input.projectId);
          if (!rootPath) {
            return { projectType: "general", confidence: 0 };
          }
          const config = await readProjectConfig(rootPath);

          // Skip if user manually set the type.
          if (config.typeManuallySet) {
            return {
              projectType: config.projectType ?? "general",
              icon: config.icon ?? undefined,
              confidence: 1,
            };
          }

          // Scan the first two levels of the file tree (max 100 entries).
          const fileList = await scanProjectFiles(rootPath, 2, 100);
          if (!fileList.length) {
            return { projectType: "general", confidence: 0 };
          }

          const context = fileList.join("\n");
          const { auxiliaryInfer } = await import(
            "@/ai/services/auxiliaryInferenceService"
          );
          const { CAPABILITY_SCHEMAS } = await import(
            "@/ai/services/auxiliaryCapabilities"
          );

          const result = await auxiliaryInfer({
            capabilityKey: "project.classify",
            context,
            schema: CAPABILITY_SCHEMAS["project.classify"],
            fallback: { type: "general" as const, icon: "", confidence: 0 },
          });

          // Write back to project.json if confidence is sufficient.
          if (result.confidence >= 0.3) {
            const metaPath = getProjectMetaPath(rootPath);
            const updated = { ...config, projectType: result.type };
            // Only set icon if user hasn't set one yet.
            if (!config.icon && result.icon) {
              updated.icon = result.icon;
            }
            const tmpPath = `${metaPath}.${Date.now()}.tmp`;
            await fs.writeFile(
              tmpPath,
              JSON.stringify(updated, null, 2),
              "utf-8",
            );
            await fs.rename(tmpPath, metaPath);
            try {
              await syncProjectsFromDisk(prisma as any);
            } catch (error) {
              // 逻辑：分类结果已写回 project.json，同步快照失败时仅告警，避免影响主流程。
              console.warn("[settings.inferProjectType] sync snapshot failed", error);
            }
          }

          return {
            projectType: result.type,
            icon: result.icon || undefined,
            confidence: result.confidence,
          };
        }),

      inferProjectName: shieldedProcedure
        .input(settingSchemas.inferProjectName.input)
        .output(settingSchemas.inferProjectName.output)
        .mutation(async ({ input }) => {
          const rootPath = getProjectRootPath(input.projectId);
          const config = rootPath ? await readProjectConfig(rootPath) : null;
          const fileList = rootPath
            ? await scanProjectFiles(rootPath, 2, 30)
            : [];

          const contextParts: string[] = [];
          if (config?.title) contextParts.push(`Current name: ${config.title}`);
          if (config?.projectType) contextParts.push(`Type: ${config.projectType}`);
          if (fileList.length > 0)
            contextParts.push(`Files:\n${fileList.join("\n")}`);

          const context = contextParts.join("\n") || "Empty project";

          const { auxiliaryInfer } = await import(
            "@/ai/services/auxiliaryInferenceService"
          );
          const { CAPABILITY_SCHEMAS } = await import(
            "@/ai/services/auxiliaryCapabilities"
          );

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
          });

          return { title: result.title, icon: result.icon, type: result.type };
        }),

      generateChatSuggestions: shieldedProcedure
        .input(settingSchemas.generateChatSuggestions.input)
        .output(settingSchemas.generateChatSuggestions.output)
        .mutation(async ({ input }) => {
          const { readLatestEntry, appendEntry } = await import(
            "@/modules/settings/chatSuggestionsStore"
          );

          // Determine scope
          const scope = input.projectId
            ? `project:${input.projectId}`
            : "global";

          // Count current sessions for this scope
          const sessionCount = input.projectId
            ? await prisma.chatSession.count({ where: { projectId: input.projectId } })
            : await prisma.chatSession.count();

          // Check JSONL cache
          const cached = readLatestEntry(scope);
          if (cached && cached.sessionCount === sessionCount) {
            return { suggestions: cached.suggestions };
          }

          const contextParts: string[] = [];

          if (input.projectId) {
            const rootPath = getProjectRootPath(input.projectId);
            if (rootPath) {
              const config = await readProjectConfig(rootPath);
              if (config?.title) contextParts.push(`Project: ${config.title}`);
              if (config?.projectType)
                contextParts.push(`Type: ${config.projectType}`);
            }
          }

          if (input.currentInput) {
            contextParts.push(`Current input: ${input.currentInput}`);
          } else {
            contextParts.push("The user just opened a new chat (empty conversation).");
          }

          const context = contextParts.join("\n");

          const { auxiliaryInfer } = await import(
            "@/ai/services/auxiliaryInferenceService"
          );
          const { CAPABILITY_SCHEMAS } = await import(
            "@/ai/services/auxiliaryCapabilities"
          );

          const result = await auxiliaryInfer({
            capabilityKey: "chat.suggestions",
            context,
            schema: CAPABILITY_SCHEMAS["chat.suggestions"],
            fallback: { suggestions: [] },
          });

          appendEntry(scope, sessionCount, result.suggestions);

          return { suggestions: result.suggestions };
        }),

      generateCommitMessage: shieldedProcedure
        .input(settingSchemas.generateCommitMessage.input)
        .output(settingSchemas.generateCommitMessage.output)
        .mutation(async ({ input }) => {
          const { getProjectGitDiff } = await import(
            "@openloaf/api/services/projectGitService"
          );
          const diffResult = await getProjectGitDiff(input.projectId);
          if (!diffResult.diff) {
            return { subject: "", body: "" };
          }
          const truncatedDiff =
            diffResult.diff.length > 3000
              ? `${diffResult.diff.slice(0, 3000)}\n... (truncated)`
              : diffResult.diff;

          const { auxiliaryInfer } = await import(
            "@/ai/services/auxiliaryInferenceService"
          );
          const { CAPABILITY_SCHEMAS } = await import(
            "@/ai/services/auxiliaryCapabilities"
          );

          const result = await auxiliaryInfer({
            capabilityKey: "git.commitMessage",
            context: truncatedDiff,
            schema: CAPABILITY_SCHEMAS["git.commitMessage"],
            fallback: { subject: "", body: undefined },
            noCache: true,
          });

          return { subject: result.subject, body: result.body ?? "" };
        }),

      inferBoardName: shieldedProcedure
        .input(settingSchemas.inferBoardName.input)
        .output(settingSchemas.inferBoardName.output)
        .mutation(async ({ input }) => {
          const { getProjectRootPath } = await import(
            "@openloaf/api/services/vfsService"
          );
          const rootPath = input.projectId ? getProjectRootPath(input.projectId) : null;
          if (!rootPath) return { title: "" };

          // boardFolderUri may be a full file:// URI or a relative path like .openloaf/boards/tnboard_xxx
          let folderName = input.boardFolderUri;
          if (folderName.startsWith("file://")) {
            folderName = folderName.replace(/^file:\/\//, "");
          }
          folderName = path.basename(folderName);
          const boardPath = path.join(
            rootPath,
            ".openloaf",
            "boards",
            folderName,
            "index.tnboard.json",
          );

          let snapshot: any;
          try {
            const raw = await fs.readFile(boardPath, "utf-8");
            snapshot = JSON.parse(raw);
          } catch {
            return { title: "" };
          }

          const markdown = boardSnapshotToMarkdown(snapshot, 200);
          if (!markdown.trim()) return { title: "" };

          const { auxiliaryInfer } = await import(
            "@/ai/services/auxiliaryInferenceService"
          );
          const { CAPABILITY_SCHEMAS } = await import(
            "@/ai/services/auxiliaryCapabilities"
          );
          const { runWithContext } = await import(
            "@/ai/shared/context/requestContext"
          );

          const result = await runWithContext(
            {
              sessionId: "",
              cookies: {},
              saasAccessToken: input.saasAccessToken,
            },
            () =>
              auxiliaryInfer({
                capabilityKey: "file.title",
                context: markdown,
                schema: CAPABILITY_SCHEMAS["file.title"],
                fallback: { title: "" },
                noCache: true,
              }),
          );

          return { title: result.title };
        }),
    });
  }
}

/** Convert a board snapshot JSON to a markdown summary for AI naming. */
function boardSnapshotToMarkdown(snapshot: any, maxLines: number): string {
  const nodes: any[] = snapshot?.nodes ?? [];
  if (nodes.length === 0) return "";

  const lines: string[] = [];

  // Node type distribution overview
  const typeCounts: Record<string, number> = {};
  for (const node of nodes) {
    const t = node.type || "unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  lines.push(
    `## Overview: ${Object.entries(typeCounts).map(([k, v]) => `${k}(${v})`).join(", ")}`,
  );
  lines.push("");

  for (const node of nodes) {
    if (lines.length >= maxLines) break;
    const type = node.type || "unknown";
    const props = node.props ?? node.data?.props ?? node.data ?? {};

    switch (type) {
      case "text": {
        const value = typeof props.value === "string" ? props.value : "";
        if (value) lines.push(`- [Text] ${value.slice(0, 200)}`);
        break;
      }
      case "link": {
        const parts = [props.title, props.url, props.description].filter(Boolean);
        if (parts.length) lines.push(`- [Link] ${parts.join(" | ")}`);
        break;
      }
      case "image": {
        const fileName = props.fileName || props.src || props.url;
        if (fileName) lines.push(`- [Image] ${fileName}`);
        break;
      }
      case "image-generate":
      case "image_generate": {
        const prompt = props.promptText || props.prompt;
        if (prompt) lines.push(`- [ImageGen] ${prompt}`);
        break;
      }
      case "video-generate":
      case "video_generate": {
        const prompt = props.promptText || props.prompt;
        if (prompt) lines.push(`- [VideoGen] ${prompt}`);
        break;
      }
      case "group": {
        const children = Array.isArray(node.children) ? node.children.length
          : Array.isArray(node.data?.children) ? node.data.children.length : 0;
        lines.push(`- [Group] ${children} children`);
        break;
      }
      case "chat_input": {
        const inputText = props.inputText || "";
        if (inputText) lines.push(`- [ChatInput] ${inputText.slice(0, 200)}`);
        break;
      }
      case "chat_message": {
        const msgText = props.messageText || props.content || "";
        const imageUrls = Array.isArray(props.resolvedImageUrls) ? props.resolvedImageUrls : [];
        const parts: string[] = [];
        if (msgText) parts.push(msgText.slice(0, 200));
        if (imageUrls.length) parts.push(`${imageUrls.length} image(s)`);
        if (parts.length) lines.push(`- [ChatMessage] ${parts.join(" | ")}`);
        else lines.push("- [ChatMessage]");
        break;
      }
      case "stroke":
        // Skip strokes — not helpful for naming
        break;
      default:
        lines.push(`- [${type}]`);
        break;
    }
  }

  return lines.slice(0, maxLines).join("\n");
}

/** Scan project files (first N levels, max entries) for classification context. */
async function scanProjectFiles(
  rootPath: string,
  maxDepth: number,
  maxEntries: number,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth || results.length >= maxEntries) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxEntries) break;
      // Skip hidden directories and common non-essential directories.
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "__pycache__") {
        continue;
      }
      const rel = path.relative(rootPath, path.join(dir, entry.name));
      if (entry.isDirectory()) {
        results.push(`${rel}/`);
        await walk(path.join(dir, entry.name), depth + 1);
      } else {
        results.push(rel);
      }
    }
  }

  await walk(rootPath, 1);
  return results;
}

export const settingsRouterImplementation = SettingRouterImpl.createRouter();
