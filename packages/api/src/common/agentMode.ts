import type { Tab } from "./tabs/types";

export type AgentMode = "project" | "settings";

export function decideAgentMode(activeTab: Tab | undefined): AgentMode {
  // MVP：仅用 base.component 判断场景；后续再扩展更细路由
  const component = activeTab?.base?.component;
  if (component === "settings-page") return "settings";
  return "project";
}
