import { prisma } from "@teatime-ai/db";
import { systemTools } from "@/chat/tools/system";
import { browserReadonlyTools, browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { subAgentToolRef } from "@/chat/tools/subAgent";
import { requestContextManager } from "@/context/requestContext";
import type { AgentMode } from "@teatime-ai/api/common";
import { ToolLoopAgent, stepCountIs } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import type { SubAgent } from "./SubAgent";
import { BrowserSubAgent } from "./BrowserSubAgent";
import { SubAgent as SubAgentBase } from "./SubAgent";

// 关键：内置 subAgent（MVP fallback）
const BUILTIN_SUB_AGENTS = new Map<string, SubAgent>([["browser", new BrowserSubAgent()]]);

function toolMapByMode(mode: AgentMode) {
  const base = mode === "settings" ? browserReadonlyTools : browserTools;
  return {
    ...systemTools,
    ...base,
    ...(mode === "settings" ? {} : dbTools),
    subAgent: subAgentToolRef,
  } as any;
}

class DbSubAgent extends SubAgentBase {
  readonly name: string;
  allowedSubAgents: string[] = [];
  maxDepth = 4;
  maxSteps = 10;
  systemPrompt: string;
  toolKeys: string[];

  constructor(def: {
    name: string;
    systemPrompt: string;
    toolKeys: string[];
    allowedSubAgents?: string[];
    maxDepth?: number;
    maxSteps?: number;
  }) {
    super();
    this.name = def.name;
    this.systemPrompt = def.systemPrompt;
    this.toolKeys = def.toolKeys;
    this.allowedSubAgents = def.allowedSubAgents ?? [];
    if (typeof def.maxDepth === "number") this.maxDepth = def.maxDepth;
    if (typeof def.maxSteps === "number") this.maxSteps = def.maxSteps;
  }

  createTools(mode: AgentMode) {
    const map = toolMapByMode(mode);
    const tools: any = {};
    for (const key of this.toolKeys) {
      const tool = (map as any)[key];
      if (tool) tools[key] = tool;
    }
    return tools;
  }

  createSystemPrompt(_mode: AgentMode) {
    return this.systemPrompt;
  }

  createAgent(mode: AgentMode) {
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(mode),
      tools: this.createTools(mode),
      stopWhen: stepCountIs(this.maxSteps),
    });
  }
}

export async function getSubAgent(name: string): Promise<SubAgent | undefined> {
  const builtin = BUILTIN_SUB_AGENTS.get(name);
  if (builtin) return builtin;

  const workspaceId = requestContextManager.getWorkspaceId();
  if (!workspaceId) return undefined;

  // 关键：Prisma 类型需要 db:generate；这里用 any，避免阻塞开发
  const row = await (prisma as any).subAgentDefinition?.findUnique({
    where: { workspaceId_name: { workspaceId, name } },
  });
  if (!row || row.enabled !== true) return undefined;

  const toolKeys = Array.isArray(row.toolKeys) ? row.toolKeys : [];
  const allowedSubAgents = Array.isArray(row.allowedSubAgents) ? row.allowedSubAgents : [];
  const maxDepth = typeof row.maxDepth === "number" ? row.maxDepth : undefined;
  const maxSteps = typeof row.maxSteps === "number" ? row.maxSteps : undefined;

  return new DbSubAgent({
    name: row.name,
    systemPrompt: String(row.systemPrompt ?? ""),
    toolKeys: toolKeys.map((x: any) => String(x)),
    allowedSubAgents: allowedSubAgents.map((x: any) => String(x)),
    maxDepth,
    maxSteps,
  }) as any;
}
