import { createAgentUIStream, generateId, tool, zodSchema } from "ai";
import type { UIMessage } from "ai";
import { requestContextManager } from "@/context/requestContext";
import { getSubAgent } from "@/chat/agents/sub/SubAgentDbRegistry";
import { saveChatMessageNode } from "@/chat/history";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";

function agentMetadataFromStack() {
  const frame = requestContextManager.getCurrentAgentFrame();
  if (!frame) return undefined;
  return {
    agent: {
      version: "agent-v1",
      kind: frame.kind,
      name: frame.name,
      id: frame.agentId,
      model: frame.model,
    },
  };
}

function extractMarkdownFromUiMessage(message: UIMessage): string {
  const parts = Array.isArray((message as any).parts) ? ((message as any).parts as any[]) : [];
  return parts
    .filter((p) => p?.type === "text" && typeof p?.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export const subAgentTool = tool({
  description: subAgentToolDef.description,
  inputSchema: zodSchema(subAgentToolDef.parameters),
  execute: async ({ name, task }) => {
    const writer = requestContextManager.getUIWriter();
    if (!writer) throw new Error("UI writer is not available.");

    const sessionId = requestContextManager.getSessionId();
    if (!sessionId) throw new Error("sessionId is required.");

    const parent = requestContextManager.getCurrentAgentFrame();
    // 关键：仅 master 允许调用 subAgent 工具，禁止 subAgent 内部再委派（避免嵌套与递归）。
    if (!parent || parent.kind !== "master") {
      return { ok: false, error: { code: "NOT_ALLOWED", message: "仅 master agent 允许调用 subAgent。" } };
    }

    const sub = await getSubAgent(name);
    if (!sub) {
      return { ok: false, error: { code: "NOT_FOUND", message: "未找到该 subAgent。" } };
    }

    const agent = sub.createAgent();

    const parentPath = parent?.path ?? ["master"];
    requestContextManager.pushAgentFrame(sub.createFrame(parentPath));

    // 关键：MVP 仅传递 task（由主 Agent 负责把上下文写进 task）
    const messages: UIMessage[] = [
      {
        id: `subAgent:user:${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: task }],
      } as any,
    ];

    // 关键：subAgent 的 UI stream 必须“阻塞”当前 tool，直到 subAgent 完整结束；
    // 否则主 agent 会在 tool 提前返回后继续生成，导致两路输出交叉/顺序错乱。
    let finishCalled = false;
    let outputMarkdown = "";
    let resolveStreamFinished: (() => void) | undefined;
    const streamFinished = new Promise<void>((resolve) => {
      resolveStreamFinished = resolve;
    });

    try {
      const stream = await createAgentUIStream({
        agent,
        messages: messages as any[],
        // 关键：服务端生成 messageId，确保可用于 DB 主键（Phase B）
        generateMessageId: generateId,
        onError: () => "SubAgent error.",
        messageMetadata: ({ part }) => {
          if (part.type === "finish") {
            return {
              ...(agentMetadataFromStack() ?? {}),
              totalUsage: (part as any).totalUsage,
            } as any;
          }
          if (part.type === "start") return agentMetadataFromStack() as any;
        },
        onFinish: async ({ isAborted, responseMessage }) => {
          try {
            if (isAborted) return;
            if (!responseMessage || responseMessage.role !== "assistant") return;

            // 关键：subAgent 工具的 output 需要给前端展示用（markdown 总结）。
            outputMarkdown = extractMarkdownFromUiMessage(responseMessage as any);

            // 关键：把 subAgent 标识写入 metadata，保存到 DB（用于历史回放 + 前端区分）
            const messageToSave: UIMessage = {
              ...responseMessage,
              metadata: {
                ...(responseMessage as any).metadata,
                ...(agentMetadataFromStack() ?? {}),
              },
            } as any;

            const parentMessageId = requestContextManager.getCurrentAssistantMessageId();
            if (!parentMessageId) throw new Error("parentMessageId is required.");
            await saveChatMessageNode({
              sessionId,
              message: { ...(messageToSave as any), parentMessageId } as any,
              parentMessageId,
            });
          } finally {
            finishCalled = true;
            resolveStreamFinished?.();
            requestContextManager.popAgentFrame();
          }
        },
      });

      writer.merge(stream as any);

      // 关键：等待 subAgent 完整输出结束，才允许主 agent 继续运行
      await streamFinished;

      return { ok: true, data: { name: sub.name, agentId: sub.agentId, outputMarkdown } };
    } catch (error) {
      // 关键：如果 stream 在创建/merge 阶段失败，onFinish 不会触发，需要手动清理 agent 栈
      if (!finishCalled) {
        try {
          requestContextManager.popAgentFrame();
        } catch {
          // ignore
        }
      }
      throw error;
    }
  },
});
