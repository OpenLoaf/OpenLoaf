import type { AgentMode } from "@/chat/agents/mode";
import type { AgentFrame } from "@/context/requestContext";
import type { ToolSet } from "ai";

export const DEFAULT_SUBAGENT_MAX_DEPTH = 4;

export abstract class SubAgent {
  abstract readonly name: string;
  abstract readonly displayName: string;

  // 允许在该 subAgent 内继续委派的 subAgent 列表
  allowedSubAgents: string[] = [];

  // 最大嵌套深度（从 master 开始算）
  maxDepth = DEFAULT_SUBAGENT_MAX_DEPTH;

  abstract createTools(mode: AgentMode): ToolSet;
  abstract createInstructions(mode: AgentMode): string;
  // 关键：MVP 只要求可运行即可，避免被泛型类型限制
  abstract createAgent(mode: AgentMode): any;

  // 关键：用于前端区分该条消息是谁生成的
  createFrame(parentPath: string[]): AgentFrame {
    return {
      kind: "sub",
      name: this.name,
      allowedSubAgents: this.allowedSubAgents,
      maxDepth: this.maxDepth,
      path: [...parentPath, this.name],
    };
  }
}
