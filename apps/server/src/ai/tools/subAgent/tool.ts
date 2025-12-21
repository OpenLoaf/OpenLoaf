import { deepseek } from "@ai-sdk/deepseek";
import { createAgentUIStream, tool, zodSchema, ToolLoopAgent } from "ai";
import type { UIMessage } from "ai";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { browserTools } from "@/ai/tools/browser";
import { systemTools } from "@/ai/tools/system";
import {
  getCurrentAgentFrame,
  getUiWriter,
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

function createBrowserSubAgent() {
  // 中文注释：子 agent 只做浏览器相关工具（open-url + tab snapshot）。
  return new ToolLoopAgent({
    model: deepseek("deepseek-chat"),
    instructions: `
你是 Teatime 的浏览器子 Agent。
- 输出必须是 Markdown。
- 先 open-url 打开页面；再通过 browser-get-current-tab / browser-get-tabs 获取快照并给出下一步操作建议。
`,
    tools: { ...browserTools, ...systemTools },
  });
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
    const writer = getUiWriter();
    if (!writer) throw new Error("UI writer is not available.");

    const parent = getCurrentAgentFrame();
    // 中文注释：只允许 master 调用 sub-agent，避免递归委派。
    if (!parent || parent.kind !== "master") {
      return { ok: false, error: { code: "NOT_ALLOWED", message: "仅 master agent 允许调用 subAgent。" } };
    }

    if (name !== "browser") {
      return { ok: false, error: { code: "NOT_FOUND", message: "仅支持 browser 子 agent。" } };
    }

    const agent = createBrowserSubAgent();
    pushAgentFrame(createSubFrame(parent.path, "browser"));

    const messages: UIMessage[] = [
      {
        id: `subAgent:user:${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: task }],
      } as any,
    ];

    let outputMarkdown = "";
    let resolveFinished: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    try {
      const stream = await createAgentUIStream({
        agent,
        messages: messages as any[],
        onError: () => "SubAgent error.",
        onFinish: ({ responseMessage }) => {
          if (responseMessage?.role === "assistant") {
            outputMarkdown = extractMarkdown(responseMessage as any);
          }
          popAgentFrame();
          resolveFinished?.();
        },
      });
      writer.merge(stream as any);
      // 中文注释：等待 sub-agent 完整结束，避免与主 agent 输出交叉。
      await finished;
      return { ok: true, data: { name: "browser", agentId: "browser", outputMarkdown } };
    } catch (err) {
      popAgentFrame();
      resolveFinished?.();
      throw err;
    }
  },
});
