import { prisma } from "@teatime-ai/db";
import { requestContextManager } from "@/context/requestContext";
import type { AgentMode } from "@teatime-ai/api/common";
import { ToolLoopAgent, stepCountIs } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import type { SubAgent } from "./SubAgent";
import { BrowserSubAgent } from "./BrowserSubAgent";
import { SubAgent as SubAgentBase } from "./SubAgent";
import { browserReadonlyTools, browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { systemTools } from "@/chat/tools/system";
import { subAgentToolRef } from "@/chat/tools/subAgent/globals";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";

// 关键：内置 subAgent（MVP fallback）
const BUILTIN_SUB_AGENTS = new Map<string, SubAgent>([["browser", new BrowserSubAgent()]]);

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

  createSystemPrompt(_mode: AgentMode) {
    return this.systemPrompt;
  }

  createAgent(mode: AgentMode) {
    const basePool =
      mode === "settings"
        ? {
            ...systemTools,
            ...browserReadonlyTools,
            ...(subAgentToolRef ? { [subAgentToolDef.id]: subAgentToolRef } : {}),
          }
        : {
            ...systemTools,
            ...browserTools,
            ...dbTools,
            ...(subAgentToolRef ? { [subAgentToolDef.id]: subAgentToolRef } : {}),
          };
    const tools: any = {};
    for (const key of this.toolKeys) {
      const tool = (basePool as any)?.[key];
      if (tool) tools[key] = tool;
    }

    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(mode),
      tools,
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
