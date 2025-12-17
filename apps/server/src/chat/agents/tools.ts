import { browserReadonlyTools, browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { subAgentTool } from "@/chat/tools/subAgent";
import { systemTools } from "@/chat/tools/system";
import type { AgentMode } from "@teatime-ai/api/common";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { timeNowToolDef } from "@teatime-ai/api/types/tools/system";

export function createToolsByMode(mode: AgentMode) {
  // 关键：通过“只暴露允许的 tools”做权限边界（MVP）
  if (mode === "settings") {
    return {
      ...systemTools,
      ...browserReadonlyTools,
      [subAgentToolDef.id]: subAgentTool,
    };
  }

  return {
    [timeNowToolDef.id]: systemTools[timeNowToolDef.id],
    // ...browserTools,
    ...dbTools,
    [subAgentToolDef.id]: subAgentTool,
  };
}
