/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  getProjectRootPath,
} from "@openloaf/api/services/vfsService";
import { getOpenLoafRootDir } from "@openloaf/config";
import type { PromptContext } from "@/ai/shared/types";
import type { ClientPlatform } from "@openloaf/api/types/platform";
import { loadSkillSummaries, type SkillSummary } from "@/ai/services/skillsLoader";
import { resolvePythonInstallInfo } from "@/ai/models/cli/pythonTool";
import { getAuthSessionSnapshot } from "@/modules/auth/tokenStore";
import { getSaasAccessToken } from "@/ai/shared/context/requestContext";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { logger } from "@/common/logger";
import {
  buildSessionContextSection,
  buildProjectRulesSection,
  buildSkillsSummarySection,
} from "@/ai/shared/promptBuilder";
import { assembleMemoryBlocks } from "@/ai/shared/agentPromptAssembler";
import { getMcpToolIds } from "@/ai/tools/toolRegistry";
import { getMcpCatalogEntries } from "@openloaf/api/types/tools/toolCatalog";
import { mcpClientManager } from "@/ai/services/mcpClientManager";
// import { collectAvailableAgents, buildSubAgentListSection } from "@/ai/shared/subAgentPrefaceBuilder";
import { getEnabledMcpServers } from "@/services/mcpConfigService";

/** Unknown value fallback. */
const UNKNOWN_VALUE = "unknown";
/** Project metadata folder name. */
const PROJECT_META_DIR = ".openloaf";
/** Project metadata file name. */
const PROJECT_META_FILE = "project.json";
/** Root rules file name. */
const ROOT_RULES_FILE = "AGENTS.md";

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

/** Decode JWT payload without signature verification. */
function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Resolve account snapshot for prompt injection. */
function resolveAccountSnapshot(): AccountSnapshot {
  // 优先从 tokenStore 内存获取（适用于服务端直接持有 token 的场景）。
  const snapshot = getAuthSessionSnapshot();
  if (snapshot.loggedIn && snapshot.user) {
    return {
      id: snapshot.user.sub ?? UNKNOWN_VALUE,
      name: snapshot.user.name ?? UNKNOWN_VALUE,
      email: snapshot.user.email ?? UNKNOWN_VALUE,
    };
  }
  // 回退：从当前请求的 SaaS access token 解析用户信息。
  try {
    const saasToken = getSaasAccessToken();
    if (saasToken) {
      const payload = decodeJwtPayloadUnsafe(saasToken);
      if (payload) {
        const sub = typeof payload.sub === "string" ? payload.sub : undefined;
        const name = typeof payload.name === "string" ? payload.name : undefined;
        const email = typeof payload.email === "string" ? payload.email : undefined;
        if (sub || name || email) {
          return {
            id: sub ?? UNKNOWN_VALUE,
            name: name ?? UNKNOWN_VALUE,
            email: email ?? UNKNOWN_VALUE,
          };
        }
      }
    }
  } catch { /* fallback */ }
  return { id: "未登录", name: "未登录", email: "未登录" };
}

/** Resolve response language configuration for prompt injection. */
function resolveResponseLanguage(): string {
  try {
    const conf = readBasicConf();
    // Use UI language directly
    return conf.uiLanguage ?? "zh-CN";
  } catch {
    return UNKNOWN_VALUE;
  }
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
  projectId?: string;
  projectRootPath?: string;
  parentProjectRootPaths: string[];
  selectedSkills: string[];
}): { summaries: SkillSummary[]; selectedSkills: string[] } {
  const globalSkillsPath = path.join(os.homedir(), ".agents", "skills");
  const skillSummaries = loadSkillSummaries({
    projectRootPath: input.projectRootPath || undefined,
    parentProjectRootPaths: input.parentProjectRootPaths,
    globalSkillsPath,
  });
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
  // 逻辑：忽略项作用于 project skill 列表与选择结果。
  const filteredSummaries = skillSummaries.filter((summary) => {
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
  const allowedSkillNames = new Set(filteredSummaries.flatMap((summary) => [summary.name, summary.originalName]));
  const filteredSelectedSkills = input.selectedSkills.filter((name) => allowedSkillNames.has(name));
  // 逻辑：如果 agent config 中启用了特定技能（非空数组），只保留这些技能的摘要。
  // 空数组 = 全部启用（向后兼容）。
  const activeSkillNames = filteredSelectedSkills.length > 0
    ? new Set(filteredSelectedSkills)
    : null;
  const activeSummaries = activeSkillNames
    ? filteredSummaries.filter((summary) => activeSkillNames.has(summary.name) || activeSkillNames.has(summary.originalName))
    : filteredSummaries;
  return { summaries: activeSummaries, selectedSkills: filteredSelectedSkills };
}

/** Resolve prompt context for session preface. */
async function resolvePromptContext(input: {
  projectId?: string;
  parentProjectRootPaths: string[];
  selectedSkills: string[];
  timezone?: string;
}): Promise<PromptContext> {
  const project = resolveProjectSnapshot(input.projectId);
  const account = resolveAccountSnapshot();
  const responseLanguage = resolveResponseLanguage();
  const platform = `${os.platform()} ${os.release()}`;
  const date = new Date().toDateString();
  const timezone = resolveTimezone(input.timezone);
  const python = await resolvePythonRuntimeSnapshot();
  const { summaries, selectedSkills } = resolveFilteredSkillSummaries({
    projectId: input.projectId,
    projectRootPath: project.rootPath,
    parentProjectRootPaths: input.parentProjectRootPaths,
    selectedSkills: input.selectedSkills,
  });
  return {
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

/**
 * Build builtin skills block for system prompt injection.
 * Returns a single <system-skills> block string, or empty string if none.
 */
function buildBuiltinSkillsSystemBlock(
  summaries: PromptContext["skillSummaries"],
): string {
  const builtinSkills = summaries.filter((s) => s.scope === "builtin");
  if (builtinSkills.length === 0) return "";
  const content = buildSkillsSummarySection(builtinSkills);
  if (!content) return "";
  return `<system-skills desc="内置技能，需要加载时使用 tool-search 加载">\n${content}\n</system-skills>`;
}

/**
 * Build user (global) and project skills blocks for chat preface.
 * Returns an array of blocks (0-2 items).
 */
function buildUserProjectSkillsBlocks(
  summaries: PromptContext["skillSummaries"],
): string[] {
  const globalSkills = summaries.filter((s) => s.scope === "global");
  const projectSkills = summaries.filter((s) => s.scope === "project");
  const blocks: string[] = [];

  if (globalSkills.length > 0) {
    const content = buildSkillsSummarySection(globalSkills);
    if (content) {
      blocks.push(
        `<system-user-skills desc="用户全局技能，需要加载时使用 tool-search 加载">\n${content}\n</system-user-skills>`,
      );
    }
  }
  if (projectSkills.length > 0) {
    const content = buildSkillsSummarySection(projectSkills);
    if (content) {
      blocks.push(
        `<system-project-skills desc="项目技能，需要加载时使用 tool-search 加载">\n${content}\n</system-project-skills>`,
      );
    }
  }
  return blocks;
}

/** Build context blocks — each section wrapped in its own semantic tag. */
function buildContextBlocks(input: {
  sessionId: string;
  context: PromptContext;
  parentProjectRootPaths: string[];
  clientPlatform?: ClientPlatform;
}): string[] {
  const { sessionId, context, parentProjectRootPaths } = input;
  const blocks: string[] = [];

  // 项目规则（仅有内容时）
  if (context.project.rules && context.project.rules !== "未找到") {
    blocks.push(
      `<system-project-rules desc="项目规则，来自 AGENTS.md">\n${buildProjectRulesSection(context)}\n</system-project-rules>`,
    );
  }

  // TODO: 可用子 Agent 列表 — 暂时禁用，待后续重新整理后恢复

  // NOTE: 执行规则 + 任务分工已移至 hardRules.ts <agent-directives>

  // 会话上下文（含语言设置，放到最底部）
  blocks.push(
    `<system-session-context desc="当前会话环境信息">\n${buildSessionContextSection(sessionId, context)}\n</system-session-context>`,
  );

  return blocks.filter((s) => s.trim());
}

/** Result of building session preface. */
export type SessionPrefaceResult = {
  /** Preface text injected as user message (skills/MCP/context/memory). */
  prefaceText: string;
  /** Builtin skills text appended to system prompt (instructions). */
  builtinSkillsText: string;
};

/** Build session preface text for chat context. */
export async function buildSessionPrefaceText(input: {
  sessionId: string;
  projectId?: string;
  selectedSkills: string[];
  parentProjectRootPaths: string[];
  timezone?: string;
  clientPlatform?: ClientPlatform;
}): Promise<SessionPrefaceResult> {
  // Ensure MCP servers are connected so getMcpToolIds() returns tools
  const projectRoot = input.projectId
    ? getProjectRootPath(input.projectId) ?? undefined
    : undefined
  await mcpClientManager.ensureEnabledServersConnected(projectRoot)

  const context = await resolvePromptContext({
    projectId: input.projectId,
    parentProjectRootPaths: input.parentProjectRootPaths,
    selectedSkills: input.selectedSkills,
    timezone: input.timezone,
  });

  // ★ 内置 skills → system prompt（instructions 末尾）
  const builtinSkillsText = buildBuiltinSkillsSystemBlock(context.skillSummaries);

  // ★ 用户/项目 skills → preface（user message）
  const skillsBlocks = buildUserProjectSkillsBlocks(context.skillSummaries);

  // MCP tools — 按 scope 分组
  const mcpBlocks = buildMcpToolsBlocks(projectRoot);

  // 会话上下文 + 项目配置
  const contextBlocks = buildContextBlocks({
    sessionId: input.sessionId,
    context,
    parentProjectRootPaths: input.parentProjectRootPaths,
    clientPlatform: input.clientPlatform,
  });

  // Memory 独立块
  let userHomePath: string | undefined;
  try {
    userHomePath = getOpenLoafRootDir();
  } catch {
    userHomePath = undefined;
  }
  const memoryBlocks = assembleMemoryBlocks({
    userHomePath,
    projectRootPath: context.project.rootPath !== UNKNOWN_VALUE ? context.project.rootPath : undefined,
    parentProjectRootPaths: input.parentProjectRootPaths,
  });

  const prefaceText = [...skillsBlocks, ...mcpBlocks, ...contextBlocks, ...memoryBlocks]
    .filter(Boolean)
    .join("\n\n");

  return { prefaceText, builtinSkillsText };
}

/**
 * Build MCP tools blocks, split by scope (global → system-user-mcp, project → system-project-mcp).
 * Each MCP tool entry uses its own XML tag for consistency.
 */
function buildMcpToolsBlocks(projectRoot?: string): string[] {
  const mcpToolIds = getMcpToolIds();
  if (mcpToolIds.length === 0) return [];

  const mcpEntries = getMcpCatalogEntries();

  // Build server name → scope map from config
  let serverScopeMap: Map<string, 'global' | 'project'>;
  try {
    const servers = getEnabledMcpServers(projectRoot);
    serverScopeMap = new Map(servers.map((s) => [s.name, s.scope]));
  } catch {
    serverScopeMap = new Map();
  }

  // Group by server name, then split by scope
  type ToolEntry = { id: string; label: string; description: string };
  const globalTools = new Map<string, ToolEntry[]>();
  const projectTools = new Map<string, ToolEntry[]>();

  for (const id of mcpToolIds) {
    const parts = id.split('__');
    const serverName = parts[1] ?? 'unknown';
    const entry = mcpEntries.find((e) => e.id === id);
    const toolEntry: ToolEntry = {
      id,
      label: entry?.label ?? id,
      description: entry?.description ?? '',
    };
    const scope = serverScopeMap.get(serverName) ?? 'global';
    const target = scope === 'project' ? projectTools : globalTools;
    if (!target.has(serverName)) target.set(serverName, []);
    target.get(serverName)!.push(toolEntry);
  }

  const buildBlock = (
    tag: string,
    desc: string,
    toolsByServer: Map<string, ToolEntry[]>,
  ): string => {
    const lines: string[] = [
      '# MCP 外部工具',
      '使用前需先通过 tool-search 工具加载（在 names 参数中传入工具 ID）。',
      '',
    ];
    for (const [serverName, tools] of toolsByServer) {
      lines.push(`## ${serverName}`);
      for (const t of tools) {
        const toolDesc = t.description ? ` — ${t.description}` : '';
        lines.push(`\t<${t.id}>${t.label}${toolDesc}</${t.id}>`);
      }
      lines.push('');
    }
    return `<${tag} desc="${desc}">\n${lines.join('\n').trim()}\n</${tag}>`;
  };

  const blocks: string[] = [];
  if (globalTools.size > 0) {
    blocks.push(buildBlock('system-user-mcp', '用户全局 MCP 工具', globalTools));
  }
  if (projectTools.size > 0) {
    blocks.push(buildBlock('system-project-mcp', '项目 MCP 工具', projectTools));
  }
  return blocks;
}
