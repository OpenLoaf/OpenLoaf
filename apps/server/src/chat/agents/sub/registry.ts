import { BrowserSubAgent } from "./BrowserSubAgent";
import type { SubAgent } from "./SubAgent";

// 关键：MVP 先手动注册一个 subAgent；后续再替换为 DB 驱动
const SUB_AGENT_REGISTRY = new Map<string, SubAgent>([
  ["browser", new BrowserSubAgent()],
]);

export function listSubAgentNames() {
  return [...SUB_AGENT_REGISTRY.keys()];
}

export function getSubAgent(name: string): SubAgent | undefined {
  return SUB_AGENT_REGISTRY.get(name);
}

