import { createAgentUIStream, readUIMessageStream, tool, zodSchema } from "ai";
import type { UIMessage } from "ai";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { createBrowserWorkerAgent } from "@/ai/agents/createBrowserWorkerAgent";
import {
  getCurrentAgentFrame,
  popAgentFrame,
  pushAgentFrame,
  type AgentFrame,
} from "@/common/requestContext";

function extractMarkdown(message: UIMessage): string {
  const parts = Array.isArray((message as any).parts) ? ((message as any).parts as any[]) : [];
  return parts
    .filter((p) => p?.type === "text" && typeof p?.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function createSubFrame(parentPath: string[], name: string): AgentFrame {
  return {
    kind: "sub",
    name,
    agentId: name,
    path: [...parentPath, name],
    model: { provider: "deepseek", modelId: "deepseek-chat" },
  };
}

/**
 * sub-agent tool（MVP）：
 * - 仅支持内置 browser 子 agent
 * - 不做消息落库（cloud-server 版本再做持久化/回放）
 */
export const subAgentTool = tool({
  description: subAgentToolDef.description,
  inputSchema: zodSchema(subAgentToolDef.parameters),
  execute: async ({ name, task }) => {
    const parent = getCurrentAgentFrame();
    // 中文注释：只允许 master 调用 sub-agent，避免递归委派。
    if (!parent || parent.kind !== "master") {
      return { ok: false, error: { code: "NOT_ALLOWED", message: "仅 master agent 允许调用 subAgent。" } };
    }

    const normalizedName = String(name ?? "").trim().toLowerCase();
    if (normalizedName !== "browser" && normalizedName !== "stagehand") {
      return { ok: false, error: { code: "NOT_FOUND", message: "仅支持 browser/stagehand 子 agent。" } };
    }

    const agent = createBrowserWorkerAgent();
    pushAgentFrame(createSubFrame(parent.path, "browser"));

    const messages: UIMessage[] = [
      {
        id: `subAgent:user:${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: task }],
      } as any,
    ];

    let outputMarkdown = "";
    try {
      const stream = await createAgentUIStream({
        agent,
        messages: messages as any[],
      });

      // 中文注释：sub-agent 的 UI 行为（open-url/browser-command 等）仍会通过共享 writer 下发；
      // 这里只在服务端消费 sub-agent 的文本输出，避免把另一条 UIMessageStream 协议 merge 进主流。
      const messageStream = readUIMessageStream({ stream: stream as any });
      for await (const message of messageStream as any) {
        if (message?.role === "assistant") outputMarkdown = extractMarkdown(message as any);
      }

      popAgentFrame();
      return { ok: true, data: { name: "browser", agentId: "browser", outputMarkdown } };
    } catch (err) {
      popAgentFrame();
      throw err;
    }
  },
});
