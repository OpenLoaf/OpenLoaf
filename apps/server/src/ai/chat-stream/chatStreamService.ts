import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { generateId, generateImage, type UIMessage } from "ai";
import { type ChatModelSource, type ModelDefinition } from "@tenas-ai/api/common";
import type { TenasImageMetadataV1 } from "@tenas-ai/api/types/image";
import type { TenasUIMessage, TokenUsage } from "@tenas-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { resolveImageModel } from "@/ai/resolveImageModel";
import {
  setChatModel,
  setAbortSignal,
  setCodexOptions,
  setParentProjectRootPaths,
  getWorkspaceId,
  getProjectId,
} from "@/ai/chat-stream/requestContext";
import { logger } from "@/common/logger";
import {
  getProjectRootPath,
  getActiveWorkspace,
  getWorkspaceById,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@tenas-ai/api/services/vfsService";
import { loadSkillSummaries, type SkillSummary } from "@/ai/agents/masterAgent/skillsLoader";
import { resolveParentProjectRootPaths } from "@/ai/utils/projectRoots";
import { parseCommandAtStart } from "@/ai/pipeline/commandParser";
import { resolvePythonInstallInfo } from "@/ai/models/cli/pythonTool";
import { getAuthSessionSnapshot } from "@/modules/auth/tokenStore";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { normalizePromptForImageEdit } from "./imageEditNormalizer";
import { resolveImagePrompt, type GenerateImagePrompt } from "./imagePrompt";
import {
  resolveImageSaveDirectory,
  saveGeneratedImages,
  saveGeneratedImagesToDirectory,
} from "./imageStorage";
import {
  createChatImageErrorResult,
  formatImageErrorMessage,
  formatInvalidRequestMessage,
  initRequestContext,
  loadAndPrepareMessageChain,
  saveLastMessageAndResolveParent,
} from "./chatStreamHelpers";
import { resolveCodexRequestOptions, resolveImageGenerateOptions } from "./messageOptionResolver";
import {
  resolveExplicitModelDefinition,
  resolvePreviousChatModelId,
  resolveRequiredInputTags,
} from "./modelResolution";
import type { ChatStreamRequest } from "./chatStreamTypes";
import {
  clearSessionErrorMessage,
  ensureSessionPreface,
  resolveRightmostLeafId,
  saveMessage,
  setSessionErrorMessage,
} from "./messageStore";
import type { ChatImageRequest, ChatImageRequestResult } from "./chatImageTypes";
import { buildTimingMetadata } from "./metadataBuilder";
import {
  createChatStreamResponse,
  createErrorStreamResponse,
  createImageStreamResponse,
} from "./streamOrchestrator";

type ImageModelRequest = {
  /** Session id. */
  sessionId: string;
  /** Incoming UI messages. */
  messages: UIMessage[];
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[];
  /** Abort signal for image generation. */
  abortSignal: AbortSignal;
  /** Image model id. */
  chatModelId?: string;
  /** Image model source. */
  chatModelSource?: ChatModelSource;
  /** Optional model definition. */
  modelDefinition?: ModelDefinition | null;
  /** Optional request message id. */
  requestMessageId?: string;
  /** Optional response message id. */
  responseMessageId?: string;
  /** Optional trigger source. */
  trigger?: string;
  /** Optional board id. */
  boardId?: string | null;
  /** Optional image save directory uri. */
  imageSaveDir?: string;
};

type ImageModelResult = {
  /** Image parts for immediate response. */
  imageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Persisted image parts for message storage. */
  persistedImageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Revised prompt text. */
  revisedPrompt?: string;
  /** Agent metadata for persistence. */
  agentMetadata: Record<string, unknown>;
  /** Token usage for metadata. */
  totalUsage?: TokenUsage;
};

/** Unknown value fallback. */
const UNKNOWN_VALUE = "unknown";
/** Project metadata folder name. */
const PROJECT_META_DIR = ".tenas";
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

type PromptContext = {
  /** Workspace snapshot. */
  workspace: WorkspaceSnapshot;
  /** Project snapshot. */
  project: ProjectSnapshot;
  /** Account snapshot. */
  account: AccountSnapshot;
  /** Response language. */
  responseLanguage: string;
  /** Platform info. */
  platform: string;
  /** Date string. */
  date: string;
  /** Python runtime snapshot. */
  python: PythonRuntimeSnapshot;
  /** Filtered skill summaries. */
  skillSummaries: SkillSummary[];
  /** Filtered selected skills. */
  selectedSkills: string[];
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

/** Build skills summary section for a session preface. */
function buildSkillsSummarySection(summaries: SkillSummary[]): string {
  const lines = [
    "# Skills 列表（摘要）",
    "- 仅注入 YAML front matter（name/description）。",
    "- 需要完整说明请使用工具读取对应 SKILL.md。",
  ];

  if (summaries.length === 0) {
    lines.push("- 未发现可用 skills。");
    return lines.join("\n");
  }

  for (const summary of summaries) {
    lines.push(
      `- ${summary.name} [${summary.scope}] ${summary.description} (path: \`${summary.path}\`)`,
    );
  }
  return lines.join("\n");
}

/** Build selected skills section for a session preface. */
function buildSelectedSkillsSection(
  selectedSkills: string[],
  summaries: SkillSummary[],
): string {
  const lines = ["# 已选择技能（来自 /skill/ 指令）"];
  if (selectedSkills.length === 0) {
    lines.push("- 无");
    return lines.join("\n");
  }

  const summaryMap = new Map(summaries.map((summary) => [summary.name, summary]));
  for (const name of selectedSkills) {
    const summary = summaryMap.get(name);
    if (!summary) {
      lines.push(`- ${name} (未找到对应 SKILL.md)`);
      continue;
    }
    lines.push(`- ${summary.name} [${summary.scope}] (path: \`${summary.path}\`)`);
  }
  return lines.join("\n");
}

/** Build Python runtime section for a session preface. */
function buildPythonRuntimeSection(python: PythonRuntimeSnapshot): string {
  const version = python.version ?? UNKNOWN_VALUE;
  const pathValue = python.path ?? UNKNOWN_VALUE;
  const installedLabel = python.installed ? "已安装" : "未安装";
  return [
    "# Python 运行时",
    `- 安装状态: ${installedLabel}`,
    `- version: ${version}`,
    `- path: ${pathValue}`,
  ].join("\n");
}

/** Resolve prompt context for session preface. */
async function resolvePromptContext(input: {
  workspaceId?: string;
  projectId?: string;
  parentProjectRootPaths: string[];
  selectedSkills: string[];
}): Promise<PromptContext> {
  const workspace = resolveWorkspaceSnapshot(input.workspaceId);
  const project = resolveProjectSnapshot(input.projectId);
  const account = resolveAccountSnapshot();
  const responseLanguage = resolveResponseLanguage();
  const platform = `${os.platform()} ${os.release()}`;
  const date = new Date().toDateString();
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
    python,
    skillSummaries: summaries,
    selectedSkills,
  };
}

/** Build master agent context sections for session preface. */
function buildMasterAgentContextSections(context: PromptContext): string[] {
  const skillsSummarySection = buildSkillsSummarySection(context.skillSummaries);
  const selectedSkillsSection = buildSelectedSkillsSection(
    context.selectedSkills,
    context.skillSummaries,
  );
  return [
    [
      "# 语言强制",
      `- 当前输出语言：${context.responseLanguage}`,
      "- 你的所有输出必须严格使用上述语言，不得混用或夹杂其他语言。",
    ].join("\n"),
    [
      "# 环境与身份",
      `- workspaceId: ${context.workspace.id}`,
      `- workspaceName: ${context.workspace.name}`,
      `- workspaceRootPath: ${context.workspace.rootPath}`,
      `- projectId: ${context.project.id}`,
      `- projectName: ${context.project.name}`,
      `- projectRootPath: ${context.project.rootPath}`,
      `- platform: ${context.platform}`,
      `- date: ${context.date}`,
      `- accountId: ${context.account.id}`,
      `- accountName: ${context.account.name}`,
      `- accountEmail: ${context.account.email}`,
    ].join("\n"),
    buildPythonRuntimeSection(context.python),
    [
      "# 项目规则（已注入，必须严格遵守）",
      "<project-rules>",
      context.project.rules,
      "</project-rules>",
    ].join("\n"),
    skillsSummarySection,
    selectedSkillsSection,
    [
      "# 执行规则（强制）",
      "- 工具优先：先用工具获取事实，再输出结论。",
      "- 工具结果必须先简要总结后再继续下一步。",
      "- 文件与命令工具仅允许访问 projectRootPath 内的路径。",
      "- 路径参数禁止使用 URL Encoding 编码，必须保持原始路径字符。",
      "- 文件读取类工具必须先判断路径是否为目录；若为目录需改用目录列举工具或提示用户改传文件。",
      "- 写入、删除或破坏性操作必须走审批流程。",
    ].join("\n"),
    [
      "# 输入中的文件引用（强制）",
      "- 用户输入里的 `@...` 代表文件引用，占位内容是项目内的相对路径。",
      "- 标准格式：`@path/to/file`（默认当前项目根目录）。",
      "- 跨项目格式：`@[projectId]/path/to/file`（@ 可省略，核心是 `[projectId]/`）。",
      "- 可选行号范围：`@path/to/file:<start>-<end>`，表示关注指定行区间。",
      "- 系统插入的文件引用会优先使用当前会话的 projectId。",
      "- 示例：`@[proj_6a5ba1eb-6c89-4bc6-a1a1-ca0ed1b2386d]/年货节主图.xlsx`。",
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
  ].filter((section) => section.trim().length > 0);
}

/** Normalize selected skills input. */
function normalizeSelectedSkills(input?: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const candidates = input.filter((value): value is string => typeof value === "string");
  // 逻辑：只保留非空字符串，并按输入顺序去重。
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of candidates) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/** Extract plain text from UI message parts. */
function extractTextFromParts(parts: unknown[]): string {
  const items = Array.isArray(parts) ? (parts as any[]) : [];
  return items
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

/** Check whether the message is a compact command request. */
function isCompactCommandMessage(message: TenasUIMessage | undefined): boolean {
  if (!message || message.role !== "user") return false;
  if ((message as any)?.messageKind === "compact_prompt") return true;
  const text = extractTextFromParts(message.parts ?? []);
  const command = parseCommandAtStart(text);
  return command?.id === "summary-history";
}

/** Build the compact prompt text sent to the model. */
function buildCompactPromptText(): string {
  return [
    "# 任务",
    "请对当前对话进行压缩摘要，供后续继续对话使用。",
    "要求：",
    "- 保留明确需求、约束、决策、关键事实。",
    "- 保留重要数据、参数、文件路径、命令、接口信息。",
    "- 标注未完成事项与风险。",
    "- 用精简要点，不要展开推理过程。",
    "输出格式：",
    "## 摘要",
    "## 关键决策",
    "## 待办",
    "## 风险/疑点",
    "## 涉及文件",
  ].join("\n");
}

/** Build a session preface message for compaction context. */
async function buildSessionPrefaceMessage(input: {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  selectedSkills: string[];
  parentProjectRootPaths: string[];
}): Promise<TenasUIMessage> {
  const context = await resolvePromptContext({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    parentProjectRootPaths: input.parentProjectRootPaths,
    selectedSkills: input.selectedSkills,
  });
  const masterAgentSections = buildMasterAgentContextSections(context);
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
  ];

  return {
    id: generateId(),
    role: "user",
    parentMessageId: null,
    messageKind: "session_preface",
    parts: [{ type: "text", text: sections.join("\n\n") }],
  };
}

/** Error with HTTP status for image requests. */
class ChatImageRequestError extends Error {
  /** HTTP status code. */
  status: number;

  /** Create a request error with HTTP status. */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Run chat stream and return SSE response. */
export async function runChatStream(input: {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
}): Promise<Response> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    tabId,
    chatModelId,
    chatModelSource,
    workspaceId,
    projectId,
    boardId,
    trigger,
  } = input.request;

  const selectedSkills = normalizeSelectedSkills((input.request as any)?.selectedSkills);
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    tabId,
    workspaceId,
    projectId,
    boardId,
    selectedSkills,
    requestSignal: input.requestSignal,
    messageId,
  });

  const lastMessage = incomingMessages.at(-1) as TenasUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求无效：缺少最后一条消息。",
    });
  }

  // 逻辑：在首条用户消息前确保 preface 已落库。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedWorkspaceId = getWorkspaceId() ?? workspaceId ?? undefined;
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  await ensureSessionPreface({
    sessionId,
    message: await buildSessionPrefaceMessage({
      sessionId,
      workspaceId: resolvedWorkspaceId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
    }),
    createdAt: requestStartAt,
    workspaceId: resolvedWorkspaceId,
    projectId: resolvedProjectId,
    boardId: boardId ?? undefined,
  });

  const isCompactCommand = isCompactCommandMessage(lastMessage);
  let leafMessageId = "";
  let assistantParentUserId: string | null = null;
  let includeCompactPrompt = false;

  if (isCompactCommand) {
    // 中文注释：/summary-history 指令走压缩流程，先写 compact_prompt 再生成 summary。
    if (!lastMessage || lastMessage.role !== "user") {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求无效：压缩指令必须来自用户消息。",
      });
    }

    const explicitParent =
      typeof lastMessage.parentMessageId === "string" || lastMessage.parentMessageId === null
        ? (lastMessage.parentMessageId as string | null)
        : undefined;
    const parentMessageId =
      explicitParent === undefined
        ? await resolveRightmostLeafId(sessionId)
        : explicitParent;
    if (!parentMessageId) {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: "请求失败：找不到可压缩的对话节点。",
      });
    }

    const compactPromptMessage: TenasUIMessage = {
      id: lastMessage.id,
      role: "user",
      parentMessageId,
      messageKind: "compact_prompt",
      parts: [{ type: "text", text: buildCompactPromptText() }],
    };

    try {
      const saved = await saveMessage({
        sessionId,
        message: compactPromptMessage,
        parentMessageId,
        createdAt: requestStartAt,
      });
      leafMessageId = saved.id;
      assistantParentUserId = saved.id;
      includeCompactPrompt = true;
    } catch (err) {
      logger.error({ err }, "[chat] save compact prompt failed");
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId,
        errorText: "请求失败：保存压缩指令出错。",
      });
    }
  } else {
    // 流程：保存最后一条消息 -> 补全历史链路 -> 解析模型 -> 启动 SSE stream 并落库 assistant。
    const saveResult = await saveLastMessageAndResolveParent({
      sessionId,
      lastMessage,
      requestStartAt,
      formatInvalid: (message) => `请求无效：${message}`,
      formatSaveError: (message) => `请求失败：${message}`,
    });
    if (!saveResult.ok) {
      return createErrorStreamResponse({
        sessionId,
        assistantMessageId,
        parentMessageId: await resolveRightmostLeafId(sessionId),
        errorText: saveResult.errorText,
      });
    }

    leafMessageId = saveResult.leafMessageId;
    assistantParentUserId = saveResult.assistantParentUserId;
  }

  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    includeCompactPrompt,
    formatError: (message) => `请求失败：${message}`,
  });
  if (!chainResult.ok) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: assistantParentUserId ?? (await resolveRightmostLeafId(sessionId)),
      errorText: chainResult.errorText,
    });
  }

  const { messages, modelMessages } = chainResult;
  setCodexOptions(resolveCodexRequestOptions(messages as UIMessage[]));
  setParentProjectRootPaths(parentProjectRootPaths);

  if (!assistantParentUserId) {
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId: await resolveRightmostLeafId(sessionId),
      errorText: "请求失败：找不到父消息。",
    });
  }
  const parentMessageId = assistantParentUserId;

  let agentMetadata: Record<string, unknown> = {};
  let masterAgent: ReturnType<typeof createMasterAgentRunner>;

  try {
    const explicitModelDefinition = await resolveExplicitModelDefinition(chatModelId);
    if (
      explicitModelDefinition?.tags?.includes("image_generation") ||
      explicitModelDefinition?.tags?.includes("image_edit")
    ) {
      logger.debug({}, "[chat] route to image stream");
      return await runImageModelStream({
        sessionId,
        assistantMessageId,
        parentMessageId,
        requestStartAt,
        messages: modelMessages as UIMessage[],
        metadataMessages: messages as UIMessage[],
        abortSignal: abortController.signal,
        chatModelId: chatModelId ?? undefined,
        chatModelSource,
        modelDefinition: explicitModelDefinition,
        requestMessageId: parentMessageId,
        responseMessageId: assistantMessageId,
        trigger,
        boardId,
      });
    }

    // 按输入能力与历史偏好选择模型，失败时直接返回错误流。
    const requiredTags = !chatModelId ? resolveRequiredInputTags(messages as UIMessage[]) : [];
    const preferredChatModelId = !chatModelId
      ? resolvePreviousChatModelId(messages as UIMessage[])
      : null;
    const resolved = await resolveChatModel({
      chatModelId,
      chatModelSource,
      requiredTags,
      preferredChatModelId,
    });
    masterAgent = createMasterAgentRunner({
      model: resolved.model,
      modelInfo: resolved.modelInfo,
    });
    setChatModel(resolved.model);
    agentMetadata = {
      id: masterAgent.frame.agentId,
      name: masterAgent.frame.name,
      kind: masterAgent.frame.kind,
      model: masterAgent.frame.model,
      chatModelId: resolved.chatModelId,
      modelDefinition: resolved.modelDefinition,
    };
  } catch (err) {
    logger.error(
      {
        err,
        sessionId,
        chatModelId,
        chatModelSource,
      },
      "[chat] resolve chat model failed",
    );
    const errorText = err instanceof Error ? `请求失败：${err.message}` : "请求失败：模型解析失败。";
    return createErrorStreamResponse({
      sessionId,
      assistantMessageId,
      parentMessageId,
      errorText,
    });
  }

  return createChatStreamResponse({
    sessionId,
    assistantMessageId,
    parentMessageId,
    requestStartAt,
    modelMessages: modelMessages as UIMessage[],
    agentRunner: masterAgent,
    agentMetadata,
    abortController,
    assistantMessageKind: isCompactCommand ? "compact_summary" : undefined,
  });
}

/** Run chat image request and return JSON-friendly result. */
export async function runChatImageRequest(input: {
  /** Chat request payload. */
  request: ChatImageRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
}): Promise<ChatImageRequestResult> {
  const {
    sessionId,
    messages: incomingMessages,
    messageId,
    clientId,
    tabId,
    chatModelId,
    chatModelSource,
    workspaceId,
    projectId,
    boardId,
    imageSaveDir,
    trigger,
  } = input.request;

  const selectedSkills = normalizeSelectedSkills((input.request as any)?.selectedSkills);
  const { abortController, assistantMessageId, requestStartAt } = initRequestContext({
    sessionId,
    cookies: input.cookies,
    clientId,
    tabId,
    workspaceId,
    projectId,
    boardId,
    selectedSkills,
    requestSignal: input.requestSignal,
    messageId,
  });

  const lastMessage = incomingMessages.at(-1) as TenasUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    const errorText = formatInvalidRequestMessage("缺少最后一条消息。");
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(400, errorText);
  }

  // 逻辑：在首条用户消息前确保 preface 已落库。
  const parentProjectRootPaths = await resolveParentProjectRootPaths(projectId);
  const resolvedWorkspaceId = getWorkspaceId() ?? workspaceId ?? undefined;
  const resolvedProjectId = getProjectId() ?? projectId ?? undefined;
  await ensureSessionPreface({
    sessionId,
    message: await buildSessionPrefaceMessage({
      sessionId,
      workspaceId: resolvedWorkspaceId,
      projectId: resolvedProjectId,
      selectedSkills,
      parentProjectRootPaths,
    }),
    createdAt: requestStartAt,
    workspaceId: resolvedWorkspaceId,
    projectId: resolvedProjectId,
    boardId: boardId ?? undefined,
  });

  // 流程：
  // 1) 保存最后一条消息并确定父消息
  // 2) 加载消息链并替换图片输入
  // 3) 解析图片模型并生成图片
  // 4) 保存图片与 assistant 消息，返回完整 message
  const saveResult = await saveLastMessageAndResolveParent({
    sessionId,
    lastMessage,
    requestStartAt,
    formatInvalid: formatInvalidRequestMessage,
    formatSaveError: formatImageErrorMessage,
  });
  if (!saveResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: saveResult.errorText });
    return createChatImageErrorResult(saveResult.status, saveResult.errorText);
  }

  const { leafMessageId, assistantParentUserId } = saveResult;
  const chainResult = await loadAndPrepareMessageChain({
    sessionId,
    leafMessageId,
    assistantParentUserId,
    formatError: formatImageErrorMessage,
  });
  if (!chainResult.ok) {
    await setSessionErrorMessage({ sessionId, errorMessage: chainResult.errorText });
    return createChatImageErrorResult(400, chainResult.errorText);
  }
  const { messages, modelMessages } = chainResult;

  try {
    const explicitModelDefinition = await resolveExplicitModelDefinition(chatModelId);
    const imageResult = await generateImageModelResult({
      sessionId,
      messages: modelMessages as UIMessage[],
      metadataMessages: messages as UIMessage[],
      abortSignal: abortController.signal,
      chatModelId,
      chatModelSource,
      modelDefinition: explicitModelDefinition,
      requestMessageId: assistantParentUserId ?? undefined,
      responseMessageId: assistantMessageId,
      trigger,
      boardId,
      imageSaveDir,
    });

    const timingMetadata = buildTimingMetadata({
      startedAt: requestStartAt,
      finishedAt: new Date(),
    });
    const usageMetadata = imageResult.totalUsage ? { totalUsage: imageResult.totalUsage } : {};
    const mergedMetadata: Record<string, unknown> = {
      ...usageMetadata,
      ...timingMetadata,
      ...(Object.keys(imageResult.agentMetadata).length > 0
        ? { agent: imageResult.agentMetadata }
        : {}),
    };

    const revisedPromptPart = imageResult.revisedPrompt
      ? [
          {
            type: "data-revised-prompt" as const,
            data: { text: imageResult.revisedPrompt },
          },
        ]
      : [];
    const messageParts = [...imageResult.persistedImageParts, ...revisedPromptPart];

    const message: TenasUIMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: messageParts,
      parentMessageId: assistantParentUserId,
      metadata: mergedMetadata,
    };

    await saveMessage({
      sessionId,
      message,
      parentMessageId: assistantParentUserId,
      allowEmpty: false,
      createdAt: requestStartAt,
    });
    await clearSessionErrorMessage({ sessionId });

    return { ok: true, response: { sessionId, message } };
  } catch (err) {
    logger.error({ err, sessionId, chatModelId }, "[chat] image request failed");
    if (err instanceof ChatImageRequestError) {
      const errorText = formatImageErrorMessage(err);
      await setSessionErrorMessage({ sessionId, errorMessage: errorText });
      return createChatImageErrorResult(err.status, errorText);
    }
    const errorText = formatImageErrorMessage(err);
    await setSessionErrorMessage({ sessionId, errorMessage: errorText });
    return createChatImageErrorResult(500, errorText);
  }
}

/** Generate image result for chat image flows. */
async function generateImageModelResult(input: ImageModelRequest): Promise<ImageModelResult> {
  const resolvedPrompt = resolveImagePrompt(input.messages);
  if (!resolvedPrompt) {
    throw new ChatImageRequestError("缺少图片生成提示词。", 400);
  }
  const modelId = input.chatModelId?.trim() ?? "";
  if (!modelId) {
    throw new ChatImageRequestError("未指定图片模型。", 400);
  }

  setAbortSignal(input.abortSignal);
  const resolved = await resolveImageModel({ imageModelId: modelId });
  let prompt = resolvedPrompt.prompt;
  if (resolvedPrompt.hasMask && typeof prompt !== "string") {
    prompt = await normalizePromptForImageEdit({
      prompt,
      images: resolvedPrompt.images,
      mask: resolvedPrompt.mask,
      sessionId: input.sessionId,
      modelProviderId: resolved.modelInfo.provider,
      modelAdapterId: resolved.modelInfo.adapterId,
      abortSignal: input.abortSignal,
    });
  }
  const promptText = resolvePromptText(prompt);
  const promptTextLength =
    typeof prompt === "string" ? prompt.length : prompt.text?.length ?? 0;
  const promptImageCount = typeof prompt === "string" ? 0 : prompt.images.length;
  const promptHasMask = typeof prompt === "string" ? false : Boolean(prompt.mask);
  logger.debug(
    {
      promptLength: promptTextLength,
      imageCount: promptImageCount,
      hasMask: promptHasMask,
    },
    "[chat] start image stream",
  );
  const imageOptions = resolveImageGenerateOptions(input.messages as UIMessage[]);
  const requestedCount = imageOptions?.n ?? 1;
  const maxImagesPerCall =
    typeof (resolved.model as any).maxImagesPerCall === "number"
      ? Math.max(1, Math.floor((resolved.model as any).maxImagesPerCall))
      : undefined;
  // 中文注释：模型可能限制单次图片数量，超出则向下裁剪。
  const safeCount = maxImagesPerCall
    ? Math.min(Math.max(1, requestedCount), maxImagesPerCall)
    : Math.max(1, requestedCount);
  const { n: _ignoredCount, size: rawSize, aspectRatio: rawAspectRatio, ...restImageOptions } =
    imageOptions ?? {};
  // 中文注释：SDK 需要 size 为 "{number}x{number}" 模板字面量类型，运行时仍用正则兜底。
  const safeSize =
    typeof rawSize === "string" && /^\d+x\d+$/u.test(rawSize)
      ? (rawSize as `${number}x${number}`)
      : undefined;
  // 中文注释：SDK 需要 aspectRatio 为 "{number}:{number}" 模板字面量类型，运行时仍用正则兜底。
  const safeAspectRatio =
    typeof rawAspectRatio === "string" && /^\d+:\d+$/u.test(rawAspectRatio)
      ? (rawAspectRatio as `${number}:${number}`)
      : undefined;
  const result = await generateImage({
    model: resolved.model,
    prompt,
    n: safeCount,
    ...(restImageOptions ?? {}),
    ...(safeSize ? { size: safeSize } : {}),
    ...(safeAspectRatio ? { aspectRatio: safeAspectRatio } : {}),
    abortSignal: input.abortSignal,
  });
  const revisedPrompt = resolveRevisedPrompt(result.providerMetadata);
  const imageParts = result.images.flatMap((image) => {
    const mediaType = image.mediaType || "image/png";
    const base64 = image.base64?.trim();
    if (!base64) return [];
    const url = base64.startsWith("data:")
      ? base64
      : `data:${mediaType};base64,${base64}`;
    return [
      {
        type: "file" as const,
        url,
        mediaType,
      },
    ];
  });
  logger.debug(
    {
      imageCount: imageParts.length,
    },
    "[chat] image parts prepared",
  );
  if (imageParts.length === 0) {
    throw new Error("图片生成结果为空。");
  }

  // 逻辑：生成图片元信息用于持久化与预览查询。
  const metadataPayload = buildImageMetadata({
    sessionId: input.sessionId,
    prompt: promptText,
    revisedPrompt,
    modelId: resolved.modelInfo.modelId,
    chatModelId: input.chatModelId,
    chatModelSource: input.chatModelSource,
    providerId: resolved.modelInfo.provider,
    requestMessageId: input.requestMessageId,
    responseMessageId: input.responseMessageId,
    trigger: input.trigger,
    boardId: input.boardId,
    imageOptions: {
      n: safeCount,
      size: safeSize,
      aspectRatio: safeAspectRatio,
    },
    messages: input.metadataMessages ?? input.messages,
  });

  const usage = result.usage ?? undefined;
  const totalUsage: TokenUsage | undefined =
    usage && (usage.inputTokens ?? usage.outputTokens ?? usage.totalTokens) != null
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        }
      : undefined;
  const workspaceId = getWorkspaceId();
  if (!workspaceId) {
    throw new Error("workspaceId 缺失，无法保存图片");
  }
  const projectId = getProjectId();
  const imageSaveDirRaw =
    typeof input.imageSaveDir === "string" ? input.imageSaveDir.trim() : "";
  if (imageSaveDirRaw) {
    const resolvedSaveDir = await resolveImageSaveDirectory({
      imageSaveDir: imageSaveDirRaw,
      workspaceId,
      projectId: projectId || undefined,
    });
    if (!resolvedSaveDir) {
      throw new ChatImageRequestError("imageSaveDir 无效。", 400);
    }
    // 按用户指定目录落盘，失败时直接抛错反馈。
    await saveGeneratedImagesToDirectory({
      images: result.images,
      directory: resolvedSaveDir,
      metadata: metadataPayload,
    });
  }
  // 保存到本地磁盘，落库使用相对路径。
  const persistedImageParts = await saveGeneratedImages({
    images: result.images,
    workspaceId,
    sessionId: input.sessionId,
    projectId: projectId || undefined,
    metadata: metadataPayload,
  });
  logger.debug(
    {
      persistedImageCount: persistedImageParts.length,
    },
    "[chat] image attachments saved",
  );

  const agentMetadata = {
    id: "master-agent",
    name: "MasterAgent",
    kind: "master",
    model: resolved.modelInfo,
    chatModelId: resolved.imageModelId,
    modelDefinition: resolved.modelDefinition ?? input.modelDefinition,
  };

  return {
    imageParts,
    persistedImageParts,
    revisedPrompt,
    agentMetadata,
    totalUsage,
  };
}

/** 生成图片并返回 SSE 响应。 */
async function runImageModelStream(input: {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string;
  requestStartAt: Date;
  messages: UIMessage[];
  /** Raw UI messages for metadata. */
  metadataMessages?: UIMessage[];
  abortSignal: AbortSignal;
  chatModelId?: string;
  chatModelSource?: ChatModelSource;
  modelDefinition?: ModelDefinition;
  requestMessageId?: string;
  responseMessageId?: string;
  trigger?: string;
  boardId?: string | null;
}): Promise<Response> {
  try {
    const imageResult = await generateImageModelResult({
      sessionId: input.sessionId,
      messages: input.messages,
      metadataMessages: input.metadataMessages,
      abortSignal: input.abortSignal,
      chatModelId: input.chatModelId,
      chatModelSource: input.chatModelSource,
      modelDefinition: input.modelDefinition,
      requestMessageId: input.requestMessageId,
      responseMessageId: input.responseMessageId,
      trigger: input.trigger,
      boardId: input.boardId,
    });
    return await createImageStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      requestStartAt: input.requestStartAt,
      imageParts: imageResult.imageParts,
      persistedImageParts: imageResult.persistedImageParts,
      revisedPrompt: imageResult.revisedPrompt,
      agentMetadata: imageResult.agentMetadata,
      totalUsage: imageResult.totalUsage,
    });
  } catch (err) {
    const modelId = input.chatModelId?.trim() ?? "";
    logger.error({ err, sessionId: input.sessionId, chatModelId: modelId }, "[chat] image stream failed");
    const errorText = formatImageErrorMessage(err);
    return createErrorStreamResponse({
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      errorText,
    });
  }
}

/** Resolve revised prompt from provider metadata. */
function resolveRevisedPrompt(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const providers = Object.values(metadata as Record<string, any>);
  for (const provider of providers) {
    const images = provider?.images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      const revisedPrompt =
        typeof image.revisedPrompt === "string"
          ? image.revisedPrompt
          : typeof image.revised_prompt === "string"
            ? image.revised_prompt
            : "";
      const trimmed = revisedPrompt.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

type SanitizedRequestParts = {
  /** Sanitized parts for metadata. */
  parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
  /** Metadata flags derived from sanitization. */
  flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean };
  /** Warning messages for logs. */
  warnings: string[];
};

/** Resolve prompt text from image prompt payload. */
function resolvePromptText(prompt: GenerateImagePrompt): string {
  if (typeof prompt === "string") return prompt.trim();
  return typeof prompt.text === "string" ? prompt.text.trim() : "";
}

/** Resolve the latest user message in a message list. */
function resolveLatestUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as UIMessage;
    if (message?.role === "user") return message;
  }
  return null;
}

/** Sanitize request parts for metadata persistence. */
function sanitizeRequestParts(parts: unknown[]): SanitizedRequestParts {
  const sanitized: Array<{ type: string; text?: string; url?: string; mediaType?: string }> = [];
  const warnings: string[] = [];
  const flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean } = {};
  let dataUrlCount = 0;
  let binaryCount = 0;

  for (const rawPart of parts) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    const type = typeof part.type === "string" ? part.type : "";
    if (type === "text") {
      if (typeof part.text === "string" && part.text.trim()) {
        sanitized.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (type === "file") {
      const mediaType = typeof part.mediaType === "string" ? part.mediaType : undefined;
      const url = typeof part.url === "string" ? part.url : "";
      if (url.startsWith("data:")) {
        // 逻辑：data url 不写入元信息，改为占位符。
        dataUrlCount += 1;
        flags.hasDataUrlOmitted = true;
        sanitized.push({ type: "file", url: "[data-url-omitted]", mediaType });
        continue;
      }
      if (!url) {
        // 逻辑：未知二进制内容不写入元信息，改为占位符。
        binaryCount += 1;
        flags.hasBinaryOmitted = true;
        sanitized.push({ type: "file", url: "[binary-omitted]", mediaType });
        continue;
      }
      sanitized.push({ type: "file", url, mediaType });
    }
  }

  if (dataUrlCount > 0) {
    warnings.push(`metadata omitted ${dataUrlCount} data url(s)`);
  }
  if (binaryCount > 0) {
    warnings.push(`metadata omitted ${binaryCount} binary part(s)`);
  }

  return { parts: sanitized, flags, warnings };
}

/** Build image metadata payload for persistence. */
function buildImageMetadata(input: {
  sessionId: string;
  prompt: string;
  revisedPrompt?: string;
  modelId: string;
  chatModelId?: string;
  chatModelSource?: ChatModelSource;
  providerId?: string;
  requestMessageId?: string;
  responseMessageId?: string;
  trigger?: string;
  boardId?: string | null;
  imageOptions?: { n?: number; size?: string; aspectRatio?: string };
  messages: UIMessage[];
}): TenasImageMetadataV1 {
  const latestUser = resolveLatestUserMessage(input.messages);
  const rawParts = Array.isArray((latestUser as any)?.parts) ? ((latestUser as any).parts as unknown[]) : [];
  const sanitized = sanitizeRequestParts(rawParts);
  if (sanitized.warnings.length > 0) {
    logger.warn(
      { sessionId: input.sessionId, warnings: sanitized.warnings },
      "[chat] image metadata sanitized",
    );
  }
  const workspaceId = getWorkspaceId();
  const projectId = getProjectId();

  return {
    version: 1,
    chatSessionId: input.sessionId,
    prompt: input.prompt,
    revised_prompt: input.revisedPrompt,
    modelId: input.modelId,
    chatModelId: input.chatModelId,
    modelSource: input.chatModelSource,
    providerId: input.providerId,
    workspaceId: workspaceId || undefined,
    projectId: projectId || undefined,
    boardId: input.boardId || undefined,
    trigger: input.trigger,
    requestMessageId:
      input.requestMessageId ?? (typeof (latestUser as any)?.id === "string" ? (latestUser as any).id : undefined),
    responseMessageId: input.responseMessageId,
    createdAt: new Date().toISOString(),
    imageOptions: input.imageOptions,
    request: {
      parts: sanitized.parts,
      metadata: (latestUser as any)?.metadata,
    },
    flags: sanitized.flags,
    warnings: sanitized.warnings.length > 0 ? sanitized.warnings : undefined,
  };
}
