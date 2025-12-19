import type { AgentFrame } from "@/context/requestContext";

export abstract class SubAgent {
  abstract readonly name: string;
  /** subAgent 唯一标识（用于落库与追溯） */
  abstract readonly agentId: string;

  abstract createSystemPrompt(): string;
  // 关键：MVP 只要求可运行即可，避免被泛型类型限制
  abstract createAgent(): any;

  // 关键：用于前端区分该条消息是谁生成的
  createFrame(parentPath: string[]): AgentFrame {
    return {
      kind: "sub",
      name: this.name,
      agentId: this.agentId,
      path: [...parentPath, this.name],
    };
  }
}
