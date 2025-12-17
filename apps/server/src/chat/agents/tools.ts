import { browserReadonlyTools, browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { systemTools } from "@/chat/tools/system";
import type { AgentMode } from "./mode";

export function createToolsByMode(mode: AgentMode) {
  // 关键：通过“只暴露允许的 tools”做权限边界（MVP）
  if (mode === "settings") {
    return {
      ...systemTools,
      ...browserReadonlyTools,
    };
  }

  return {
    ...systemTools,
    ...browserTools,
    ...dbTools,
  };
}

