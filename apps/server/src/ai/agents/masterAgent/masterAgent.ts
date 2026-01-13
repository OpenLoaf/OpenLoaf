import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/ai/chat-stream/requestContext";
import { getProjectId, getWorkspaceId } from "@/ai/chat-stream/requestContext";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { getAuthSessionSnapshot } from "@/modules/auth/tokenStore";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import {
  getActiveWorkspace,
  getProjectRootPath,
  getWorkspaceById,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@tenas-ai/api/services/vfsService";
import { testApprovalToolDef } from "@tenas-ai/api/types/tools/approvalTest";
import {
  fileDeleteToolDef,
  fileListToolDef,
  fileReadToolDef,
  fileSearchToolDef,
  fileWriteToolDef,
  shellDestructiveToolDef,
  shellReadonlyToolDef,
  shellWriteToolDef,
  timeNowToolDef,
  webFetchToolDef,
  webSearchToolDef,
} from "@tenas-ai/api/types/tools/system";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";

/** Master agent display name. */
const MASTER_AGENT_NAME = "MasterAgent";
/** Master agent id. */
const MASTER_AGENT_ID = "master-agent";
/** Master agent tool ids. */
const MASTER_AGENT_TOOL_IDS = [
  timeNowToolDef.id,
  fileReadToolDef.id,
  fileListToolDef.id,
  fileSearchToolDef.id,
  fileWriteToolDef.id,
  fileDeleteToolDef.id,
  shellReadonlyToolDef.id,
  shellWriteToolDef.id,
  shellDestructiveToolDef.id,
  webFetchToolDef.id,
  webSearchToolDef.id,
  testApprovalToolDef.id,
  subAgentToolDef.id,
] as const;

/** Unknown value fallback. */
const UNKNOWN_VALUE = "unknown";
/** Project metadata folder name. */
const PROJECT_META_DIR = ".tenas";
/** Project metadata file name. */
const PROJECT_META_FILE = "project.json";
/** Root rules file name. */
const ROOT_RULES_FILE = "AGENTS.md";

export type MasterAgentModelInfo = {
  /** Model provider name. */
  provider: string;
  /** Model id. */
  modelId: string;
};

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

/** Read a text file if it exists. */
function readTextFileIfExists(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
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

/** Resolve account snapshot for prompt injection. */
function resolveAccountSnapshot(): AccountSnapshot {
  const snapshot = getAuthSessionSnapshot();
  if (!snapshot.loggedIn || !snapshot.user) {
    return { id: UNKNOWN_VALUE, name: UNKNOWN_VALUE, email: UNKNOWN_VALUE };
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

/**
 * Builds the system prompt for the master agent (MVP).
 */
function buildMasterAgentSystemPrompt(): string {
  const workspaceId = getWorkspaceId() ?? undefined;
  const projectId = getProjectId() ?? undefined;
  const workspace = resolveWorkspaceSnapshot(workspaceId);
  const project = resolveProjectSnapshot(projectId);
  const account = resolveAccountSnapshot();
  const responseLanguage = resolveResponseLanguage();
  const platform = `${os.platform()} ${os.release()}`;
  const date = new Date().toDateString();

  // 按“角色/语言/环境/规则/执行/分工/动态加载/完成条件”分段。
  const sections = [
    [
      "你是 Tenas 的 AI 助手，负责在当前项目范围内完成用户任务。",
      "- 输出必须是 Markdown。",
      "- 轻量任务必须亲自完成，复杂任务必须调用 subAgent 工具拆解处理。",
      "- 不得捏造事实，未知信息必须通过工具获取。",
    ].join("\n"),
    [
      "# 语言强制",
      `- 当前输出语言：${responseLanguage}`,
      "- 你的所有输出必须严格使用上述语言，不得混用或夹杂其他语言。",
    ].join("\n"),
    [
      "# 环境与身份",
      `- workspaceId: ${workspace.id}`,
      `- workspaceName: ${workspace.name}`,
      `- workspaceRootPath: ${workspace.rootPath}`,
      `- projectId: ${project.id}`,
      `- projectName: ${project.name}`,
      `- projectRootPath: ${project.rootPath}`,
      `- platform: ${platform}`,
      `- date: ${date}`,
      `- accountId: ${account.id}`,
      `- accountName: ${account.name}`,
      `- accountEmail: ${account.email}`,
    ].join("\n"),
    [
      "# 项目规则（已注入，必须严格遵守）",
      "<project-rules>",
      project.rules,
      "</project-rules>",
    ].join("\n"),
    [
      "# 执行规则（强制）",
      "- 工具优先：先用工具获取事实，再输出结论。",
      "- 工具结果必须先简要总结后再继续下一步。",
      "- 文件与命令工具仅允许访问 projectRootPath 内的路径。",
      "- 写入、删除或破坏性操作必须走审批流程。",
    ].join("\n"),
    [
      "# 输入中的文件引用（强制）",
      "- 用户输入里的 `@{...}` 代表文件引用，占位内容是项目内的文件路径。",
      "- 支持两种格式：`@{<path>}` 或 `@{<projectId>/<path>}`，其中 `<path>` 为项目根目录相对路径。",
      "- 可选行号范围：`@{<path>:<start>-<end>}`，表示关注指定行区间。",
      "- 若提供 `projectId/` 前缀，表示该文件属于指定项目；否则默认使用当前会话的 projectId。",
      "- 示例：`@{proj_6a5ba1eb-6c89-4bc6-a1a1-ca0ed1b2386d/年货节主图.xlsx}` 表示该 projectId 下的 `年货节主图.xlsx`。",
    ].join("\n"),
    [
      "# 任务分工（强制）",
      "- 轻量任务由你直接完成。",
      "- 复杂任务必须调用 subAgent 工具。",
      "- 复杂任务判定标准（满足任一条即视为复杂）：",
      "  1) 需要跨多个模块或目录协同修改；",
      "  2) 预计影响 3 个以上文件或涉及系统性重构；",
      "  3) 涉及架构/协议/全局规则调整；",
      "  4) 需要大量上下文分析或风险较高；",
      "  5) 无法在少量工具调用内完成。",
    ].join("\n"),
    [
      "# AGENTS 动态加载（强制）",
      "- 当你搜索文件或目录时，若结果所在目录存在 AGENTS.md，必须立即读取并遵守。",
      "- 多层规则冲突时，优先级：更深层目录 > 上层目录 > 根目录。",
    ].join("\n"),
    ["# 完成条件", "- 用户问题被解决，或给出明确可执行的下一步操作。"].join("\n"),
  ];

  return sections.join("\n\n");
}

/**
 * Creates the master agent instance (MVP).
 */
export function createMasterAgent(input: { model: LanguageModelV3 }) {
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildMasterAgentSystemPrompt(),
    tools: buildToolset(MASTER_AGENT_TOOL_IDS),
  });
}

/**
 * Creates the frame metadata for the master agent (MVP).
 */
export function createMasterAgentFrame(input: { model: MasterAgentModelInfo }): AgentFrame {
  // 中文注释：当前仅保留 MasterAgent，便于定位消息来源。
  return {
    kind: "master",
    name: MASTER_AGENT_NAME,
    agentId: MASTER_AGENT_ID,
    path: [MASTER_AGENT_NAME],
    model: input.model,
  };
}
