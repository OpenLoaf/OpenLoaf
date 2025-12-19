import { prisma } from "@teatime-ai/db";
import { requestContextManager } from "@/context/requestContext";
import { ToolLoopAgent, stepCountIs } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import type { SubAgent } from "./SubAgent";
import { BrowserSubAgent } from "./BrowserSubAgent";
import { SubAgent as SubAgentBase } from "./SubAgent";
import { browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { systemTools } from "@/chat/tools/system";

// 关键：内置 subAgent（MVP fallback）
const BUILTIN_SUB_AGENTS = new Map<string, SubAgent>([["browser", new BrowserSubAgent()]]);

class DbSubAgent extends SubAgentBase {
  readonly name: string;
  readonly agentId: string;
  maxSteps = 10;
  systemPrompt: string;
  toolKeys: string[];

  constructor(def: {
    id: string;
    name: string;
    systemPrompt: string;
    toolKeys: string[];
    maxSteps?: number;
  }) {
    super();
    this.agentId = def.id;
    this.name = def.name;
    this.systemPrompt = def.systemPrompt;
    this.toolKeys = def.toolKeys;
    if (typeof def.maxSteps === "number") this.maxSteps = def.maxSteps;
  }

  /**
   * 返回 subAgent 的系统提示词（DB 配置）。
   */
  createSystemPrompt() {
    return this.systemPrompt;
  }

  /**
   * 创建 subAgent（从 tool 池中按 toolKeys 精确挑选）。
   */
  createAgent() {
    const basePool = { ...systemTools, ...browserTools, ...dbTools };
    const tools: any = {};
    for (const key of this.toolKeys) {
      const tool = (basePool as any)?.[key];
      if (tool) tools[key] = tool;
    }

    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(),
      tools,
      stopWhen: stepCountIs(this.maxSteps),
    });
  }
}

/**
 * subAgent DB Registry：根据 subAgent 名称从「内置 subAgent + 数据库配置」解析出可运行实例。
 */
export class SubAgentDbRegistry {
  /**
   * 根据名称获取 subAgent 实例；未找到或未启用则返回 undefined。
   */
  async getSubAgent(name: string): Promise<SubAgent | undefined> {
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
    const maxSteps = typeof row.maxSteps === "number" ? row.maxSteps : undefined;

    return new DbSubAgent({
      id: String(row.id),
      name: row.name,
      systemPrompt: String(row.systemPrompt ?? ""),
      toolKeys: toolKeys.map((x: any) => String(x)),
      maxSteps,
    }) as any;
  }
}

export const subAgentDbRegistry = new SubAgentDbRegistry();

// 兼容旧调用方式：保留函数导出，避免大面积改动
export async function getSubAgent(name: string): Promise<SubAgent | undefined> {
  return subAgentDbRegistry.getSubAgent(name);
}
