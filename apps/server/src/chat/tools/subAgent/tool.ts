import { createAgentUIStream, generateId, tool, zodSchema } from "ai";
import type { UIMessage } from "ai";
import { requestContextManager } from "@/context/requestContext";
import { decideAgentMode } from "@teatime-ai/api/common";
import { getSubAgent } from "@/chat/agents/sub/registry";
import { saveAndAppendMessage } from "@/chat/history";
import { setSubAgentToolRef } from "./globals";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";

function agentMetadataFromStack() {
  const frame = requestContextManager.getCurrentAgentFrame();
  if (!frame) return undefined;
  return {
    agent: {
      kind: frame.kind,
      name: frame.name,
      depth: frame.path.length - 1,
      path: frame.path,
    },
  };
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
    const stack = requestContextManager.getAgentStack();

    // 关键：递归/环检测（允许多重 subAgent，但不能无限递归）
    if (stack.some((f) => f.name === name)) {
      return { ok: false, error: { code: "RECURSION", message: "检测到 subAgent 递归调用。" } };
    }

    const maxDepth = parent?.maxDepth ?? 4;
    if (stack.length >= maxDepth) {
      return { ok: false, error: { code: "MAX_DEPTH", message: "subAgent 嵌套过深。" } };
    }

    if (parent && parent.allowedSubAgents.length > 0) {
      if (!parent.allowedSubAgents.includes(name)) {
        return { ok: false, error: { code: "NOT_ALLOWED", message: "当前 agent 不允许调用该 subAgent。" } };
      }
    }

    const sub = await getSubAgent(name);
    if (!sub) {
      return { ok: false, error: { code: "NOT_FOUND", message: "未找到该 subAgent。" } };
    }

    // 关键：mode 由 master 在请求上下文中确定（subAgent 侧不再自行判断 mode）
    const mode =
      requestContextManager.getAgentMode() ??
      decideAgentMode(requestContextManager.getContext()?.activeTab);
    const agent = sub.createAgent(mode);

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

            // 关键：把 subAgent 标识写入 metadata，保存到 DB（用于历史回放 + 前端区分）
            const messageToSave: UIMessage = {
              ...responseMessage,
              metadata: {
                ...(responseMessage as any).metadata,
                ...(agentMetadataFromStack() ?? {}),
              },
            } as any;

            await saveAndAppendMessage({ sessionId, incomingMessage: messageToSave });
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

      return { ok: true, data: { name: sub.name } };
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

// 关键：把 tool 暴露给 DB subAgent 装配（通过 globals 引用，避免循环依赖）
setSubAgentToolRef(subAgentTool);
