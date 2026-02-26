import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  getActiveWorkspace,
  getProjectRootPath,
  getWorkspaceById,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@openloaf/api/services/vfsService";
import type { PromptContext } from "@/ai/shared/types";
import { loadSkillSummaries, type SkillSummary } from "@/ai/services/skillsLoader";
import { resolvePythonInstallInfo } from "@/ai/models/cli/pythonTool";
import { getAuthSessionSnapshot } from "@/modules/auth/tokenStore";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { logger } from "@/common/logger";
import { buildMasterAgentSections } from "@/ai/shared/promptBuilder";
import { assembleMemorySection } from "@/ai/shared/agentPromptAssembler";

/** Unknown value fallback. */
const UNKNOWN_VALUE = "unknown";
/** Project metadata folder name. */
const PROJECT_META_DIR = ".openloaf";
/** Project metadata file name. */
const PROJECT_META_FILE = "project.json";
/** Root rules file name. */
const ROOT_RULES_FILE = "AGENTS.md";

type WorkspaceSnapshot = {
  /** Workspace id. */
  id: string;
  /** Workspace name. */
  name: string;
  /** Workspace root path. */
  rootPath: string;
};

type ProjectSnapshot = {
  /** Project id. */
  id: string;
  /** Project name. */
  name: string;
  /** Project root path. */
  rootPath: string;
  /** Root AGENTS.md content. */
  rules: string;
};

type AccountSnapshot = {
  /** Account id. */
  id: string;
  /** Account display name. */
  name: string;
  /** Account email. */
  email: string;
};

type PythonRuntimeSnapshot = {
  /** Installed flag. */
  installed: boolean;
  /** Installed version. */
  version?: string;
  /** Binary path. */
  path?: string;
};

/** Normalize ignoreSkills values. */
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

/** Resolve ignoreSkills from workspace config. */
function resolveWorkspaceIgnoreSkills(workspaceId?: string): string[] {
  try {
    const workspace = workspaceId ? getWorkspaceById(workspaceId) : null;
    const target = workspace ?? getActiveWorkspace();
    return normalizeWorkspaceIgnoreKeys(target?.ignoreSkills);
  } catch {
    return [];
  }
}

/** Resolve ignoreSkills from project.json. */
function resolveProjectIgnoreSkills(projectRootPath?: string): string[] {
  if (!projectRootPath || projectRootPath === UNKNOWN_VALUE) return [];
  const metaPath = path.join(projectRootPath, PROJECT_META_DIR, PROJECT_META_FILE);
  if (!existsSync(metaPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as { ignoreSkills?: unknown };
    return normalizeIgnoreSkills(raw.ignoreSkills);
  } catch {
    return [];
  }
}

/** Resolve project id from project.json. */
function resolveProjectIdFromMeta(projectRootPath: string): string | null {
  const metaPath = path.join(projectRootPath, PROJECT_META_DIR, PROJECT_META_FILE);
  if (!existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as { projectId?: string };
    const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
    return projectId || null;
  } catch {
    return null;
  }
}

/** Normalize an absolute path for comparison. */
function normalizeFsPath(input: string): string {
  return path.resolve(input);
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

/** Read a text file if it exists. */
function readTextFileIfExists(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/** Resolve project display name from project metadata. */
function resolveProjectName(projectRootPath: string, fallbackId: string): string {
  const fallbackName =
    fallbackId && fallbackId !== UNKNOWN_VALUE
      ? fallbackId
      : path.basename(projectRootPath) || UNKNOWN_VALUE;
  const metaPath = path.join(projectRootPath, PROJECT_META_DIR, PROJECT_META_FILE);
  if (!existsSync(metaPath)) return fallbackName;
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as { title?: string | null };
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    // 逻辑：优先使用 project.json 的 title，缺失则回退。
    return title || fallbackName;
  } catch {
    return fallbackName;
  }
}

/** Resolve workspace metadata for prompt injection. */
function resolveWorkspaceSnapshot(workspaceId?: string): WorkspaceSnapshot {
  const workspace = workspaceId ? getWorkspaceById(workspaceId) : null;
  let fallbackWorkspace = workspace;
  try {
    fallbackWorkspace = fallbackWorkspace ?? getActiveWorkspace();
  } catch {
    // 逻辑：读取工作空间失败时回退为 unknown。
    fallbackWorkspace = fallbackWorkspace ?? null;
  }
  const resolvedId = fallbackWorkspace?.id ?? workspaceId ?? UNKNOWN_VALUE;
  const resolvedName = fallbackWorkspace?.name ?? UNKNOWN_VALUE;
  let resolvedRootPath = UNKNOWN_VALUE;
  try {
    resolvedRootPath =
      (workspaceId ? getWorkspaceRootPathById(workspaceId) : null) ??
      getWorkspaceRootPath();
  } catch {
    resolvedRootPath = UNKNOWN_VALUE;
  }
  return { id: resolvedId, name: resolvedName, rootPath: resolvedRootPath };
}

/** Resolve project metadata for prompt injection. */
function resolveProjectSnapshot(projectId?: string): ProjectSnapshot {
  const resolvedId = projectId ?? UNKNOWN_VALUE;
  const rootPath = projectId ? getProjectRootPath(projectId) : null;
  if (!rootPath) {
    return {
      id: resolvedId,
      name: resolvedId,
      rootPath: UNKNOWN_VALUE,
      rules: "未找到",
    };
  }
  const rulesPath = path.join(rootPath, ROOT_RULES_FILE);
  // 逻辑：直接读取项目根目录 AGENTS.md 并注入到提示词。
  const rules = readTextFileIfExists(rulesPath).trim() || "未找到";
  return {
    id: resolvedId,
    name: resolveProjectName(rootPath, resolvedId),
    rootPath,
    rules,
  };
}

/** Resolve account snapshot for prompt injection. */
function resolveAccountSnapshot(): AccountSnapshot {
  const snapshot = getAuthSessionSnapshot();
  if (!snapshot.loggedIn || !snapshot.user) {
    return { id: "未登录", name: "未登录", email: "未登录" };
  }
  return {
    id: snapshot.user.sub ?? UNKNOWN_VALUE,
    name: snapshot.user.name ?? UNKNOWN_VALUE,
    email: snapshot.user.email ?? UNKNOWN_VALUE,
  };
}

/** Resolve response language configuration for prompt injection. */
function resolveResponseLanguage(): string {
  let language = UNKNOWN_VALUE;
  try {
    language = readBasicConf().modelResponseLanguage;
  } catch {
    language = UNKNOWN_VALUE;
  }
  return language;
}

/** Resolve timezone string for prompt injection. */
function resolveTimezone(value?: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed) return trimmed;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // 逻辑：未传入时区时回退到服务器时区。
  return resolved || process.env.TZ || "UTC";
}

/** Resolve Python runtime snapshot. */
async function resolvePythonRuntimeSnapshot(): Promise<PythonRuntimeSnapshot> {
  try {
    return await resolvePythonInstallInfo();
  } catch (error) {
    logger.warn({ err: error }, "[chat] resolve python info failed");
    return { installed: false };
  }
}

/** Resolve filtered skill summaries with ignore rules applied. */
function resolveFilteredSkillSummaries(input: {
  workspaceId?: string;
  projectId?: string;
  workspaceRootPath?: string;
  projectRootPath?: string;
  parentProjectRootPaths: string[];
  selectedSkills: string[];
}): { summaries: SkillSummary[]; selectedSkills: string[] } {
  const skillSummaries = loadSkillSummaries({
    workspaceRootPath: input.workspaceRootPath || undefined,
    projectRootPath: input.projectRootPath || undefined,
    parentProjectRootPaths: input.parentProjectRootPaths,
  });
  const workspaceIgnoreSkills = resolveWorkspaceIgnoreSkills(input.workspaceId);
  const projectIgnoreSkills = resolveProjectIgnoreSkills(input.projectRootPath);
  const projectCandidates: Array<{ rootPath: string; projectId: string }> = [];
  if (input.projectRootPath && input.projectRootPath !== UNKNOWN_VALUE && input.projectId) {
    projectCandidates.push({ rootPath: input.projectRootPath, projectId: input.projectId });
  }
  for (const parentRootPath of input.parentProjectRootPaths) {
    const parentId = resolveProjectIdFromMeta(parentRootPath);
    if (!parentId) continue;
    projectCandidates.push({ rootPath: parentRootPath, projectId: parentId });
  }
  // 逻辑：忽略项同时作用于 workspace/project skill 列表与选择结果。
  const filteredSummaries = skillSummaries.filter((summary) => {
    if (summary.scope === "workspace") {
      const key = buildWorkspaceIgnoreKey(summary.folderName);
      if (workspaceIgnoreSkills.includes(key)) return false;
      return !projectIgnoreSkills.includes(key);
    }
    const key = buildProjectIgnoreKey({
      folderName: summary.folderName,
      ownerProjectId: resolveOwnerProjectId({
        skillPath: summary.path,
        candidates: projectCandidates,
      }),
      currentProjectId: input.projectId ?? null,
    });
    return !projectIgnoreSkills.includes(key);
  });
  const allowedSkillNames = new Set(filteredSummaries.map((summary) => summary.name));
  const filteredSelectedSkills = input.selectedSkills.filter((name) => allowedSkillNames.has(name));
  return { summaries: filteredSummaries, selectedSkills: filteredSelectedSkills };
}

/** Resolve prompt context for session preface. */
async function resolvePromptContext(input: {
  workspaceId?: string;
  projectId?: string;
  parentProjectRootPaths: string[];
  selectedSkills: string[];
  timezone?: string;
}): Promise<PromptContext> {
  const workspace = resolveWorkspaceSnapshot(input.workspaceId);
  const project = resolveProjectSnapshot(input.projectId);
  const account = resolveAccountSnapshot();
  const responseLanguage = resolveResponseLanguage();
  const platform = `${os.platform()} ${os.release()}`;
  const date = new Date().toDateString();
  const timezone = resolveTimezone(input.timezone);
  const python = await resolvePythonRuntimeSnapshot();
  const { summaries, selectedSkills } = resolveFilteredSkillSummaries({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    workspaceRootPath: workspace.rootPath,
    projectRootPath: project.rootPath,
    parentProjectRootPaths: input.parentProjectRootPaths,
    selectedSkills: input.selectedSkills,
  });
  return {
    workspace,
    project,
    account,
    responseLanguage,
    platform,
    date,
    timezone,
    python,
    skillSummaries: summaries,
    selectedSkills,
  };
}

/** Build session preface text for chat context. */
export async function buildSessionPrefaceText(input: {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  selectedSkills: string[];
  parentProjectRootPaths: string[];
  timezone?: string;
}): Promise<string> {
  const context = await resolvePromptContext({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    parentProjectRootPaths: input.parentProjectRootPaths,
    selectedSkills: input.selectedSkills,
    timezone: input.timezone,
  });
  const masterAgentSections = buildMasterAgentSections(context);
  // 逻辑：注入 memory 章节（workspace + parent projects + current project 合并）。
  const memorySection = assembleMemorySection({
    workspaceRootPath: context.workspace.rootPath !== UNKNOWN_VALUE ? context.workspace.rootPath : undefined,
    projectRootPath: context.project.rootPath !== UNKNOWN_VALUE ? context.project.rootPath : undefined,
    parentProjectRootPaths: input.parentProjectRootPaths,
  });
  const sections = [
    [
      "# 会话上下文（preface）",
      `- sessionId: ${input.sessionId}`,
      `- workspaceId: ${context.workspace.id}`,
      `- workspaceRootPath: ${context.workspace.rootPath}`,
      `- projectId: ${context.project.id}`,
      `- projectRootPath: ${context.project.rootPath}`,
    ].join("\n"),
    ...masterAgentSections,
    // 中文注释：注入 memory 章节，仅在存在 memory 文件时添加。
    ...(memorySection ? [memorySection] : []),
  ];
  return sections.join("\n\n");
}
