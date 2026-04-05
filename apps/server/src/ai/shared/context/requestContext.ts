/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { UIMessageStreamWriter } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { AsyncLocalStorage } from "node:async_hooks";
import type { CodexRequestOptions } from "@/ai/models/cli/codex/codexOptions";
import type { ClaudeCodeRequestOptions } from "@/ai/services/chat/messageOptionResolver";
import type { ChatPageContext } from "@openloaf/api/types/message";
import type { ClientPlatform } from "@openloaf/api/types/platform";
import type { UpdatePlanArgs } from "@openloaf/api/types/tools/runtime";

export type AgentKind = "master" | "secretary" | "pm" | "specialist";

export type AgentFrame = {
  kind: AgentKind;
  name: string;
  agentId: string;
  path: string[];
  model?: { provider: string; modelId: string };
  /** Associated task ID (for PM/Specialist agents). */
  taskId?: string;
  /** Associated project ID (for PM/Specialist agents). */
  projectId?: string;
};

export type RequestContext = {
  /** Chat session id for this request. */
  sessionId: string;
  /** Cookie snapshot for this request. */
  cookies: Record<string, string>;
  /** Web client id for session association. */
  clientId?: string;
  /** Client timezone (IANA). */
  timezone?: string;
  /** Project id for this request. */
  projectId?: string;
  /** Board id for this request. */
  boardId?: string;
  /** Tab id for UI event targeting. */
  tabId?: string;
  /** Active UI stream writer for tool chunks. */
  uiWriter?: UIMessageStreamWriter<any>;
  /** Abort signal for cooperative cancellation. */
  abortSignal?: AbortSignal;
  /** Resolved chat model for tool execution. */
  chatModel?: LanguageModelV3;
  /** Codex request options for this request. */
  codexOptions?: CodexRequestOptions;
  /** Claude Code request options for this request. */
  claudeCodeOptions?: ClaudeCodeRequestOptions;
  /** Assistant message id for the current streaming response. */
  assistantMessageId?: string;
  /** Assistant parent message id for the current streaming response. */
  assistantParentMessageId?: string | null;
  /** Assistant message path for the current streaming response. */
  assistantMessagePath?: string;
  /** Latest plan update for the current request. */
  planUpdate?: UpdatePlanArgs;
  /** Current plan number for PLAN_{no}.md file naming. */
  currentPlanNo?: number;
  /** Whether a full plan has already been created in this request (prevents planNo increment on re-full). */
  planNoAllocated?: boolean;
  /** Selected skills for this request. */
  selectedSkills?: string[];
  /** Tool approval payloads keyed by toolCallId. */
  toolApprovalPayloads?: Record<string, Record<string, unknown>>;
  /** Parent project root paths resolved from database. */
  parentProjectRootPaths?: string[];
  /** Agent frame stack for nested agents. */
  agentStack?: AgentFrame[];
  /** SaaS access token for cloud API calls. */
  saasAccessToken?: string;
  /** Selected image generation model id. */
  imageModelId?: string;
  /** Selected video generation model id. */
  videoModelId?: string;
  /** Whether simple tool approvals should be auto-approved. */
  autoApproveTools?: boolean;
  /** Whether this request runs in supervision mode (autonomous task). */
  supervisionMode?: boolean;
  /** Task ID when running within an autonomous task. */
  taskId?: string;
  /** Runtime Task ID (session-scoped) currently owned by this Agent. Only Master or direct sub-agents have this set. Do NOT propagate to sub-sub-agents. */
  runtimeTaskId?: string;
  /** CLI tool execution summary buffer. */
  cliSummary?: string;
  /** Claude Code SDK session UUID (for persist/resume). */
  cliSessionId?: string;
  /** Session preface text (only set for first message in a CLI session). */
  cliSessionPreface?: string;
  /** SDK assistant UUID for resumeSessionAt (rewind target). */
  cliRewindTarget?: string;
  /** Accumulated credits consumed by SaaS provider. */
  creditsConsumed?: number;
  /** Client platform for conditional tool registration. */
  clientPlatform?: ClientPlatform;
  /** Web app version for SaaS metadata. */
  webVersion?: string;
  /** Server version for SaaS metadata. */
  serverVersion?: string;
  /** Desktop (Electron) app version for SaaS metadata. */
  desktopVersion?: string;
  /** Page context for AI agent skill auto-loading. */
  pageContext?: ChatPageContext;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** 设置本次请求上下文（每次 /chat/sse 都会调用一次）。 */
export function setRequestContext(ctx: RequestContext) {
  storage.enterWith(ctx);
}

/** 获取本次请求上下文（可能为空）。 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** 获取会话 id（用于落库/日志/权限边界）。 */
export function getSessionId(): string | undefined {
  return getRequestContext()?.sessionId;
}

/** Get cookies snapshot. */
function getCookies(): Record<string, string> | undefined {
  return getRequestContext()?.cookies;
}

/** Get projectId (MVP: from request context). */
export function getProjectId(): string | undefined {
  return getRequestContext()?.projectId;
}

/** Get boardId (MVP: from request context). */
export function getBoardId(): string | undefined {
  return getRequestContext()?.boardId;
}

/** 获取 web clientId（用于会话隔离）。 */
export function getClientId(): string | undefined {
  return getRequestContext()?.clientId;
}

/** Get client timezone (IANA). */
/** 获取当前应用 TabId（用于绑定 UI 操作目标）。 */
export function getTabId(): string | undefined {
  return getRequestContext()?.tabId;
}

/** 设置 UI writer（tools 需要往前端推送 chunk）。 */
export function setUiWriter(writer: UIMessageStreamWriter<any>) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.uiWriter = writer;
}

/** 获取 UI writer（可能为空）。 */
export function getUiWriter(): UIMessageStreamWriter<any> | undefined {
  return getRequestContext()?.uiWriter;
}

/** 设置 abortSignal（stopGenerating 需要协作式中断）。 */
export function setAbortSignal(signal: AbortSignal) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.abortSignal = signal;
}

/** 获取 abortSignal（可能为空）。 */
export function getAbortSignal(): AbortSignal | undefined {
  return getRequestContext()?.abortSignal;
}

/** Sets the resolved chat model for this request. */
export function setChatModel(model: LanguageModelV3) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.chatModel = model;
}

/** Gets the resolved chat model for this request. */
export function getChatModel(): LanguageModelV3 | undefined {
  return getRequestContext()?.chatModel;
}

/** Sets Codex request options for this request. */
export function setCodexOptions(options: CodexRequestOptions | undefined) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.codexOptions = options;
}

/** Gets Codex request options for this request. */
export function getCodexOptions(): CodexRequestOptions | undefined {
  return getRequestContext()?.codexOptions;
}

/** Sets Claude Code request options for this request. */
export function setClaudeCodeOptions(options: ClaudeCodeRequestOptions | undefined) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.claudeCodeOptions = options;
}

/** Gets Claude Code request options for this request. */
export function getClaudeCodeOptions(): ClaudeCodeRequestOptions | undefined {
  return getRequestContext()?.claudeCodeOptions;
}

/** Set parent project root paths for this request. */
export function setParentProjectRootPaths(rootPaths?: string[]) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.parentProjectRootPaths = rootPaths && rootPaths.length > 0 ? [...rootPaths] : undefined;
}

/** Get parent project root paths for this request. */
/** Consume tool approval payload by toolCallId. */
export function consumeToolApprovalPayload(
  toolCallId: string,
): Record<string, unknown> | undefined {
  const ctx = getRequestContext();
  if (!ctx?.toolApprovalPayloads) return undefined;
  const payload = ctx.toolApprovalPayloads[toolCallId];
  if (payload) {
    delete ctx.toolApprovalPayloads[toolCallId];
  }
  return payload;
}

/** Sets the assistant message id for this request. */
export function setAssistantMessageId(messageId: string) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.assistantMessageId = messageId;
}

/** Gets the assistant message id for this request. */
export function getAssistantMessageId(): string | undefined {
  return getRequestContext()?.assistantMessageId;
}

/** Sets the assistant parent message id for this request. */
export function setAssistantParentMessageId(parentMessageId: string | null) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.assistantParentMessageId = parentMessageId;
}

/** Gets the assistant parent message id for this request. */
export function getAssistantParentMessageId(): string | null | undefined {
  return getRequestContext()?.assistantParentMessageId;
}

/**
 * Sets the latest plan update for this request.
 */
export function setPlanUpdate(planUpdate: UpdatePlanArgs) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.planUpdate = planUpdate;
}

/**
 * Gets the latest plan update for this request.
 */
export function getPlanUpdate(): UpdatePlanArgs | undefined {
  return getRequestContext()?.planUpdate;
}

/** Get current plan number. */
export function getCurrentPlanNo(): number | undefined {
  return getRequestContext()?.currentPlanNo;
}

/** Set current plan number. */
export function setCurrentPlanNo(planNo: number) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.currentPlanNo = planNo;
}

/** Check if a plan number has been allocated in this request. */
export function isPlanNoAllocated(): boolean {
  return getRequestContext()?.planNoAllocated === true;
}

/** Mark that a plan number has been allocated in this request. */
export function markPlanNoAllocated() {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.planNoAllocated = true;
}

/** 获取 agent 栈（MVP：用于打标消息来源）。 */
function getAgentStack(): AgentFrame[] {
  const ctx = getRequestContext();
  if (!ctx) return [];
  if (!ctx.agentStack) ctx.agentStack = [];
  return ctx.agentStack;
}

/** 获取当前 agent frame（栈顶）。 */
/** 入栈一个 agent frame（用于打标消息来源）。 */
export function pushAgentFrame(frame: AgentFrame) {
  getAgentStack().push(frame);
}

/** 出栈一个 agent frame。 */
export function popAgentFrame(): AgentFrame | undefined {
  const stack = getAgentStack();
  return stack.pop();
}

/** Sets the SaaS access token for this request. */
export function setSaasAccessToken(token: string | undefined) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.saasAccessToken = token;
}

/** Gets the SaaS access token for this request. */
export function getSaasAccessToken(): string | undefined {
  return getRequestContext()?.saasAccessToken;
}

/** Sets the media model ids for this request. */
export function setMediaModelIds(ids: { image?: string; video?: string }) {
  const ctx = getRequestContext();
  if (!ctx) return;
  if (ids.image !== undefined) ctx.imageModelId = ids.image || undefined;
  if (ids.video !== undefined) ctx.videoModelId = ids.video || undefined;
}

/** Gets the media model id by kind. */
export function getMediaModelId(kind: "image" | "video"): string | undefined {
  const ctx = getRequestContext();
  if (!ctx) return undefined;
  return kind === "image" ? ctx.imageModelId : ctx.videoModelId;
}

/** Run an async function within a restored RequestContext (for fire-and-forget sub-agents). */
export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/** Get the accumulated CLI tool execution summary. */
export function getCliSummary(): string | undefined {
  return getRequestContext()?.cliSummary;
}

/** Set CLI session id and optional preface for Claude Code persist/resume. */
export function setCliSession(id: string, preface?: string): void {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.cliSessionId = id;
  ctx.cliSessionPreface = preface;
}

/** Get CLI session id (Claude Code SDK UUID). */
export function getCliSessionId(): string | undefined {
  return getRequestContext()?.cliSessionId;
}

/** Set CLI rewind target (SDK assistant UUID for resumeSessionAt). */
export function setCliRewindTarget(uuid: string): void {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.cliRewindTarget = uuid;
}

/** Get CLI rewind target (SDK assistant UUID for resumeSessionAt). */
export function getCliRewindTarget(): string | undefined {
  return getRequestContext()?.cliRewindTarget;
}

/** Add credits consumed by SaaS provider. */
export function addCreditsConsumed(credits: number): void {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.creditsConsumed = (ctx.creditsConsumed ?? 0) + credits;
}

/** Get accumulated credits consumed. */
export function getCreditsConsumed(): number | undefined {
  return getRequestContext()?.creditsConsumed;
}

/** Get page context for skill auto-loading. */
export function getPageContext(): ChatPageContext | undefined {
  return getRequestContext()?.pageContext;
}

/** Get Runtime Task ID currently owned by this Agent frame. */
export function getRuntimeTaskId(): string | undefined {
  return getRequestContext()?.runtimeTaskId;
}

/** Set Runtime Task ID for this Agent frame (used when Agent tool assigns a task to a sub-agent). */
export function setRuntimeTaskId(taskId: string | undefined): void {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.runtimeTaskId = taskId;
}

/** Check if current Agent frame is the Master Agent (stack depth 1 = top-level master). */
export function isMasterAgent(): boolean {
  const ctx = getRequestContext();
  if (!ctx) return false;
  const stack = ctx.agentStack ?? [];
  // Master runs at stack depth exactly 1 (its own frame pushed). Sub-agents are at depth >= 2.
  // Depth 0 means no agent frame pushed yet (tool called outside stream context) — deny.
  return stack.length === 1;
}

