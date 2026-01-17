import { promises as fs } from "node:fs";
import path from "node:path";
import {
  BaseSettingRouter,
  getProjectRootPath,
  getWorkspaceRootPath,
  settingSchemas,
  shieldedProcedure,
  t,
} from "@tenas-ai/api";
import {
  getActiveWorkspace,
  resolveFilePathFromUri,
} from "@tenas-ai/api/services/vfsService";
import { getWorkspaces, setWorkspaces } from "@tenas-ai/api/services/workspaceConfig";
import {
  getProjectMetaPath,
  projectConfigSchema,
  readProjectConfig,
} from "@tenas-ai/api/services/projectTreeService";
import { resolveProjectAncestorRootUris } from "@tenas-ai/api/services/projectDbService";
import { prisma } from "@tenas-ai/db";
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
import { loadSkillSummaries } from "@/ai/agents/masterAgent/skillsLoader";

/** Normalize ignoreSkills list for persistence. */
function normalizeIgnoreSkills(values?: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const trimmed = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

/** Normalize workspace ignore keys to workspace: prefix. */
function normalizeWorkspaceIgnoreKeys(values?: unknown): string[] {
  const keys = normalizeIgnoreSkills(values);
  return keys
    .map((key) => (key.startsWith("workspace:") ? key : `workspace:${key}`))
    .filter((key) => key.startsWith("workspace:"));
}

/** Normalize a workspace ignore key. */
function normalizeWorkspaceIgnoreKey(ignoreKey: string): string {
  const trimmed = ignoreKey.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("workspace:") ? trimmed : `workspace:${trimmed}`;
}

/** Build workspace ignore key from folder name. */
function buildWorkspaceIgnoreKey(folderName: string): string {
  const trimmed = folderName.trim();
  return trimmed ? `workspace:${trimmed}` : "";
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
  const skillsRoot = normalizeFsPath(path.join(baseRootPath, ".tenas", "skills"));
  if (skillDir === skillsRoot || !skillDir.startsWith(`${skillsRoot}${path.sep}`)) {
    // 仅允许删除 .tenas/skills 目录内的技能。
    throw new Error("Skill path is outside scope.");
  }
  return { skillDir, skillsRoot };
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
              summary.scope === "workspace"
                ? buildWorkspaceIgnoreKey(summary.folderName)
                : buildProjectIgnoreKey({
                    folderName: summary.folderName,
                    ownerProjectId,
                    currentProjectId: input?.projectId ?? null,
                  });
            const isEnabled =
              summary.scope === "workspace"
                ? input?.projectId
                  ? !projectIgnoreSkills.includes(ignoreKey)
                  : !workspaceIgnoreSkills.includes(ignoreKey)
                : !projectIgnoreSkills.includes(ignoreKey);
            const isDeletable = input?.projectId
              ? summary.scope === "project" && ownerProjectId === input.projectId
              : summary.scope === "workspace";
            return { ...summary, ignoreKey, isEnabled, isDeletable };
          });
          // 工作空间级别关闭后不在项目列表展示。
          if (input?.projectId) {
            return items.filter(
              (item) =>
                item.scope !== "workspace" ||
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
          if (input.scope === "workspace") {
            updateWorkspaceIgnoreSkills({
              ignoreKey: normalizeWorkspaceIgnoreKey(ignoreKey),
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
          return { ok: true };
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
    });
  }
}

export const settingsRouterImplementation = SettingRouterImpl.createRouter();
