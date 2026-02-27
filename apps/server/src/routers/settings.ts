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
import { homedir } from "node:os";
import {
  BaseSettingRouter,
  getProjectRootPath,
  getWorkspaceRootPath,
  settingSchemas,
  shieldedProcedure,
  t,
} from "@openloaf/api";
import {
  getActiveWorkspace,
  resolveFilePathFromUri,
} from "@openloaf/api/services/vfsService";
import { getWorkspaces, setWorkspaces } from "@openloaf/api/services/workspaceConfig";
import {
  getProjectMetaPath,
  projectConfigSchema,
  readProjectConfig,
} from "@openloaf/api/services/projectTreeService";
import { resolveProjectAncestorRootUris } from "@openloaf/api/services/projectDbService";
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
import { loadSkillSummaries } from "@/ai/services/skillsLoader";
import { resolveMemoryContent } from "@/ai/shared/memoryLoader";
import { readAgentJson, resolveAgentDir } from "@/ai/shared/defaultAgentResolver";
import { loadAgentSummaries, readAgentConfigFromPath, serializeAgentToMarkdown } from "@/ai/services/agentConfigService";
import { CAPABILITY_GROUPS } from "@/ai/tools/capabilityGroups";
import { resolveSystemCliInfo } from "@/modules/settings/resolveSystemCliInfo";
import { resolveOfficeInfo } from "@/modules/settings/resolveOfficeInfo";
import { isSystemAgentId } from "@/ai/shared/systemAgentDefinitions";

/** Normalize ignoreSkills list for persistence. */
function normalizeIgnoreSkills(values?: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const trimmed = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

/** Normalize workspace ignore keys to workspace: or global: prefix. */
function normalizeWorkspaceIgnoreKeys(values?: unknown): string[] {
  const keys = normalizeIgnoreSkills(values);
  return keys
    .map((key) => {
      if (key.startsWith("workspace:") || key.startsWith("global:")) return key;
      return `workspace:${key}`;
    })
    .filter((key) => key.startsWith("workspace:") || key.startsWith("global:"));
}

/** Normalize a workspace-level ignore key (workspace: or global: prefix). */
function normalizeWorkspaceIgnoreKey(ignoreKey: string): string {
  const trimmed = ignoreKey.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("workspace:") || trimmed.startsWith("global:")) return trimmed;
  return `workspace:${trimmed}`;
}

/** Build workspace ignore key from folder name. */
function buildWorkspaceIgnoreKey(folderName: string): string {
  const trimmed = folderName.trim();
  return trimmed ? `workspace:${trimmed}` : "";
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

/** Read ignoreSkills from active workspace config. */
function readWorkspaceIgnoreSkills(): string[] {
  try {
    const workspace = getActiveWorkspace();
    return normalizeWorkspaceIgnoreKeys(workspace.ignoreSkills);
  } catch {
    return [];
  }
}

/** Update ignoreSkills in active workspace config. */
function updateWorkspaceIgnoreSkills(input: { ignoreKey: string; enabled: boolean }): void {
  const workspaces = getWorkspaces();
  const activeIndex = workspaces.findIndex((workspace) => workspace.isActive);
  const targetIndex = activeIndex >= 0 ? activeIndex : 0;
  const target = workspaces[targetIndex];
  if (!target) {
    throw new Error("Active workspace not found.");
  }
  const normalizedKey = normalizeWorkspaceIgnoreKey(input.ignoreKey);
  if (!normalizedKey) return;
  const current = normalizeWorkspaceIgnoreKeys(target.ignoreSkills);
  const nextIgnoreSkills = input.enabled
    ? current.filter((name) => name !== normalizedKey)
    : Array.from(new Set([...current, normalizedKey]));
  const nextWorkspaces = workspaces.map((workspace, index) =>
    index === targetIndex ? { ...workspace, ignoreSkills: nextIgnoreSkills } : workspace
  );
  setWorkspaces(nextWorkspaces);
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
  scope: "workspace" | "project";
  projectId?: string;
  skillPath: string;
}): { skillDir: string; skillsRoot: string } {
  const baseRootPath =
    input.scope === "workspace"
      ? getWorkspaceRootPath()
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
  scope: "workspace" | "project";
  projectId?: string;
  agentPath: string;
}): { agentDir: string; agentsRoot: string } {
  const baseRootPath =
    input.scope === "workspace"
      ? getWorkspaceRootPath()
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
    ? normalizeFsPath(path.join(baseRootPath, ".openloaf", "agents"))
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
      /** List skills for settings UI. */
      getSkills: shieldedProcedure
        .input(settingSchemas.getSkills.input)
        .output(settingSchemas.getSkills.output)
        .query(async ({ input }) => {
          const workspaceRootPath = getWorkspaceRootPath();
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
          const workspaceIgnoreSkills = readWorkspaceIgnoreSkills();
          const projectIgnoreSkills = await readProjectIgnoreSkills(projectRootPath);
          const summaries = loadSkillSummaries({
            workspaceRootPath,
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
                : summary.scope === "workspace"
                  ? buildWorkspaceIgnoreKey(summary.folderName)
                  : buildProjectIgnoreKey({
                      folderName: summary.folderName,
                      ownerProjectId,
                      currentProjectId: input?.projectId ?? null,
                    });
            const isEnabled =
              summary.scope === "global"
                ? input?.projectId
                  ? !projectIgnoreSkills.includes(ignoreKey)
                  : !workspaceIgnoreSkills.includes(ignoreKey)
                : summary.scope === "workspace"
                  ? input?.projectId
                    ? !projectIgnoreSkills.includes(ignoreKey)
                    : !workspaceIgnoreSkills.includes(ignoreKey)
                  : !projectIgnoreSkills.includes(ignoreKey);
            // 全局技能不可删除（位于用户主目录）。
            const isDeletable = summary.scope === "global"
              ? false
              : input?.projectId
                ? summary.scope === "project" && ownerProjectId === input.projectId
                : summary.scope === "workspace";
            return { ...summary, ignoreKey, isEnabled, isDeletable };
          });
          // 工作空间级别或全局级别关闭后不在项目列表展示。
          if (input?.projectId) {
            return items.filter(
              (item) =>
                (item.scope !== "workspace" && item.scope !== "global") ||
                !workspaceIgnoreSkills.includes(item.ignoreKey)
            );
          }
          return items;
        }),
      setSkillEnabled: shieldedProcedure
        .input(settingSchemas.setSkillEnabled.input)
        .output(settingSchemas.setSkillEnabled.output)
        .mutation(async ({ input }) => {
          const ignoreKey = input.ignoreKey.trim();
          if (!ignoreKey) {
            throw new Error("Ignore key is required.");
          }
          // 全局技能与工作空间技能共用 workspace 级别的 ignoreSkills 列表。
          if (input.scope === "workspace" || input.scope === "global") {
            updateWorkspaceIgnoreSkills({
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
            // 项目页只允许删除当前项目技能，禁止 workspace/父项目。
            if (ignoreKey.startsWith("workspace:")) {
              throw new Error("Workspace skills cannot be deleted here.");
            }
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
          if (input.scope === "workspace") {
            updateWorkspaceIgnoreSkills({ ignoreKey, enabled: true });
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
            enabled: true,
          });
          return { ok: true };
        }),
      /** List agents for settings UI. */
      getAgents: shieldedProcedure
        .input(settingSchemas.getAgents.input)
        .output(settingSchemas.getAgents.output)
        .query(async ({ input }) => {
          const workspaceRootPath = getWorkspaceRootPath();
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
          const workspaceIgnoreSkills = readWorkspaceIgnoreSkills();
          const projectIgnoreSkills = await readProjectIgnoreSkills(projectRootPath);
          const summaries = loadAgentSummaries({
            workspaceRootPath,
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
            const workspace = getActiveWorkspace()
            if (workspace) {
              const allProjects = await prisma.project.findMany({
                where: { workspaceId: workspace.id, isDeleted: false },
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
                : summary.scope === "workspace"
                  ? buildWorkspaceIgnoreKey(summary.folderName)
                  : buildProjectIgnoreKey({
                      folderName: summary.folderName,
                      ownerProjectId,
                      currentProjectId: input?.projectId ?? null,
                    });
            const isEnabled =
              summary.scope === "global"
                ? input?.projectId
                  ? !projectIgnoreSkills.includes(`agent:${ignoreKey}`)
                  : !workspaceIgnoreSkills.includes(`agent:${ignoreKey}`)
                : summary.scope === "workspace"
                  ? input?.projectId
                    ? !projectIgnoreSkills.includes(`agent:${ignoreKey}`)
                    : !workspaceIgnoreSkills.includes(`agent:${ignoreKey}`)
                  : !projectIgnoreSkills.includes(`agent:${ignoreKey}`);
            const isOpenLoafAgent = summary.path.includes('.openloaf/agents/') || summary.path.includes('.openloaf\\agents\\');
            const isSysAgent = isOpenLoafAgent && isSystemAgentId(summary.folderName);
            const isDeletable = isSysAgent
              ? false
              : summary.scope === "global"
                ? false
                : input?.projectId
                  ? summary.scope === "project" && ownerProjectId === input.projectId
                  : summary.scope === "workspace";
            const isInherited = summary.scope === "project" && Boolean(input?.projectId) && ownerProjectId !== input?.projectId;
            const isChildProject = childProjectPaths.has(summary.path)
            return { ...summary, ignoreKey, isEnabled, isDeletable, isInherited, isChildProject, isSystem: isSysAgent };
          });
          // 逻辑：scopeFilter 过滤 — 仅返回指定 scope 的 agent。
          const scopeFilter = input?.scopeFilter
          const scopeFiltered = scopeFilter && scopeFilter !== 'all'
            ? items.filter((item) => item.scope === scopeFilter)
            : items
          if (input?.projectId) {
            return scopeFiltered.filter(
              (item) =>
                (item.scope !== "workspace" && item.scope !== "global") ||
                !workspaceIgnoreSkills.includes(`agent:${item.ignoreKey}`),
            );
          }
          return scopeFiltered;
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
          if (input.scope === "workspace" || input.scope === "global") {
            updateWorkspaceIgnoreSkills({
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
            if (ignoreKey.startsWith("workspace:")) {
              throw new Error("Workspace agents cannot be deleted here.");
            }
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
          if (input.scope === "workspace") {
            updateWorkspaceIgnoreSkills({ ignoreKey: `agent:${ignoreKey}`, enabled: true });
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
            // 逻辑：读取同目录下的 AGENT.md 作为 systemPrompt。
            const agentMdPath = path.join(agentDir, "AGENT.md");
            let systemPrompt = "";
            try {
              const { readFileSync, existsSync } = await import("node:fs");
              if (existsSync(agentMdPath)) {
                systemPrompt = readFileSync(agentMdPath, "utf8").trim();
              }
            } catch { /* ignore */ }
            // 逻辑：AGENT.md 不存在时，fallback 到内嵌模板的 systemPrompt。
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
                toolIds: input.toolIds,
                skills: input.skills,
                allowSubAgents: input.allowSubAgents,
                maxDepth: input.maxDepth,
              };
              writeFileSync(input.agentPath, JSON.stringify(descriptor, null, 2), "utf8");
              // 逻辑：prompt 与模板默认相同 → 删除 AGENT.md；不同 → 写入作为覆盖。
              const { getTemplate } = await import("@/ai/agent-templates");
              const folderName = path.basename(agentDir);
              const template = getTemplate(folderName);
              const agentMdPath = path.join(agentDir, "AGENT.md");
              const isDefault = !input.systemPrompt?.trim()
                || input.systemPrompt.trim() === template?.systemPrompt?.trim();
              if (isDefault) {
                const { unlinkSync } = await import("node:fs");
                if (existsFsSync(agentMdPath)) {
                  try { unlinkSync(agentMdPath); } catch { /* ignore */ }
                }
              } else {
                writeFileSync(agentMdPath, input.systemPrompt!.trim(), "utf8");
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
            rootPath = getWorkspaceRootPath();
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
            toolIds: input.toolIds,
            skills: input.skills,
            allowSubAgents: input.allowSubAgents,
            maxDepth: input.maxDepth,
          };
          const jsonPath = path.join(agentDir, "agent.json");
          writeFsSync(jsonPath, JSON.stringify(descriptor, null, 2), "utf8");
          if (input.systemPrompt?.trim()) {
            writeFsSync(path.join(agentDir, "AGENT.md"), input.systemPrompt.trim(), "utf8");
          }
          return { ok: true, agentPath: jsonPath };
        }),
      /** Copy a workspace agent to a project. */
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
            // 逻辑：.openloaf/agents/ 结构 — 复制 agent.json + AGENT.md。
            const { readAgentJson } = await import("@/ai/shared/defaultAgentResolver");
            const descriptor = readAgentJson(sourceDir);
            if (!descriptor) throw new Error("Source agent not found.");
            const targetJsonPath = path.join(targetDir, "agent.json");
            writeFsSync(targetJsonPath, JSON.stringify(descriptor, null, 2), "utf8");
            const sourceMdPath = path.join(sourceDir, "AGENT.md");
            if (existsSync(sourceMdPath)) {
              const mdContent = readFileSync(sourceMdPath, "utf8");
              writeFsSync(path.join(targetDir, "AGENT.md"), mdContent, "utf8");
            }
            return { ok: true, agentPath: targetJsonPath };
          }

          // 逻辑：旧 .agents/agents/ 结构 — 复制 AGENT.md。
          const config = readAgentConfigFromPath(sourceNormalized, "workspace");
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
            toolIds: config.toolIds,
            skills: config.skills,
            allowSubAgents: config.allowSubAgents,
            maxDepth: config.maxDepth,
          };
          const targetJsonPath = path.join(targetDir, "agent.json");
          writeFsSync(targetJsonPath, JSON.stringify(descriptor, null, 2), "utf8");
          if (config.systemPrompt?.trim()) {
            writeFsSync(path.join(targetDir, "AGENT.md"), config.systemPrompt.trim(), "utf8");
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
      /** Get merged memory content for the master agent. */
      getMemory: shieldedProcedure
        .input(settingSchemas.getMemory.input)
        .output(settingSchemas.getMemory.output)
        .query(async ({ input }) => {
          const workspaceRootPath = getWorkspaceRootPath();
          const projectRootPath = input?.projectId
            ? getProjectRootPath(input.projectId) ?? undefined
            : undefined;
          const parentProjectRootUris = input?.projectId
            ? await resolveProjectAncestorRootUris(prisma, input.projectId)
            : [];
          const parentProjectRootPaths = parentProjectRootUris
            .map((rootUri) => {
              try {
                return resolveFilePathFromUri(rootUri);
              } catch {
                return null;
              }
            })
            .filter((p): p is string => Boolean(p));
          const content = resolveMemoryContent({
            workspaceRootPath,
            projectRootPath,
            parentProjectRootPaths,
          });
          return { content };
        }),
      /** Get skills for a sub-agent by name. */
      getAgentSkillsByName: shieldedProcedure
        .input(settingSchemas.getAgentSkillsByName.input)
        .output(settingSchemas.getAgentSkillsByName.output)
        .query(async ({ input }) => {
          const workspaceRootPath = getWorkspaceRootPath();
          const roots = [workspaceRootPath].filter(Boolean) as string[];
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
          const workspaceRootPath = getWorkspaceRootPath();
          if (!workspaceRootPath) throw new Error("No workspace root");
          const agentDir = resolveAgentDir(workspaceRootPath, input.agentName);
          const descriptor = readAgentJson(agentDir);
          if (!descriptor) throw new Error(`Agent '${input.agentName}' not found`);
          const jsonPath = path.join(agentDir, "agent.json");
          const updated = { ...descriptor, skills: input.skills };
          await fs.writeFile(jsonPath, JSON.stringify(updated, null, 2), "utf8");
          return { ok: true };
        }),
    });
  }
}

export const settingsRouterImplementation = SettingRouterImpl.createRouter();
