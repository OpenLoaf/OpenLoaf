import { generateId, tool, zodSchema, type UIMessage } from "ai";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import {
  BROWSER_SUB_AGENT_NAME,
  createBrowserSubAgent,
} from "@/ai/agents/subagent/browserSubAgent";
import {
  DOCUMENT_ANALYSIS_SUB_AGENT_NAME,
  createDocumentAnalysisSubAgent,
} from "@/ai/agents/subagent/documentAnalysisSubAgent";
import {
  TEST_APPROVAL_SUB_AGENT_NAME,
  createTestApprovalSubAgent,
} from "@/ai/agents/subagent/testApprovalSubAgent";
import { saveMessage } from "@/ai/services/chat/repositories/messageStore";
import { buildModelMessages } from "@/ai/shared/messageConverter";
import { logger } from "@/common/logger";
import { getChatModel, getSessionId, getUiWriter } from "@/ai/shared/context/requestContext";

/**
 * Builds sub-agent messages for streaming execution.
 */
function buildSubAgentMessages(input: { task: string }) {
  return [
    {
      id: generateId(),
      role: "user",
      parts: [{ type: "text", text: input.task }],
    },
  ] as const;
}

type SubAgentHistoryMetadata = {
  toolCallId: string;
  actionName?: string;
  name?: string;
  task?: string;
};

/** Normalize toolCallId input. */
function getToolCallId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Persist sub-agent history with full parts. */
async function saveSubAgentHistory(input: {
  sessionId: string;
  toolCallId: string;
  actionName?: string;
  name?: string;
  task: string;
  parts: unknown[];
  createdAt: Date;
}) {
  await saveMessage({
    sessionId: input.sessionId,
    message: {
      id: `subagent:${input.toolCallId}`,
      role: "subagent" as any,
      parts: input.parts,
      metadata: {
        toolCallId: input.toolCallId,
        actionName: input.actionName,
        name: input.name,
        task: input.task,
      } satisfies SubAgentHistoryMetadata,
    } as any,
    parentMessageId: null,
    createdAt: input.createdAt,
    allowEmpty: true,
  });
}

/**
 * Sub-agent tool (MVP).
 */
export const subAgentTool = tool({
  description: subAgentToolDef.description,
  inputSchema: zodSchema(subAgentToolDef.parameters),
  execute: async ({ actionName, name, task }, options) => {
    const model = getChatModel();
    if (!model) {
      throw new Error("chat model is not available.");
    }

    if (
      name !== BROWSER_SUB_AGENT_NAME &&
      name !== DOCUMENT_ANALYSIS_SUB_AGENT_NAME &&
      name !== TEST_APPROVAL_SUB_AGENT_NAME
    ) {
      // 逻辑：仅允许已注册的子Agent，避免未知子Agent执行。
      throw new Error(
        `unsupported sub-agent: ${name}. only ${BROWSER_SUB_AGENT_NAME}, ${DOCUMENT_ANALYSIS_SUB_AGENT_NAME} and ${TEST_APPROVAL_SUB_AGENT_NAME} are allowed.`,
      );
    }

    const writer = getUiWriter();
    const toolCallId = getToolCallId(options.toolCallId);
    if (!toolCallId) {
      throw new Error("toolCallId is required for sub-agent execution.");
    }
    const sessionId = getSessionId();
    const startedAt = new Date();
    logger.info(
      {
        toolCallId,
        name,
        hasWriter: Boolean(writer),
        hasSessionId: Boolean(sessionId),
      },
      "[sub-agent] start",
    );

    if (writer) {
      writer.write({
        type: "data-sub-agent-start",
        data: { toolCallId, name, task },
      } as any);
    }

    // 逻辑：按名称选择子Agent实例，保持工具集合最小化。
    const agent =
      name === DOCUMENT_ANALYSIS_SUB_AGENT_NAME
        ? createDocumentAnalysisSubAgent({ model })
        : name === TEST_APPROVAL_SUB_AGENT_NAME
          ? createTestApprovalSubAgent({ model })
          : createBrowserSubAgent({ model });
    const subAgentMessages = buildSubAgentMessages({ task }) as unknown as UIMessage[];
    const modelMessages = await buildModelMessages(subAgentMessages, agent.tools);
    const result = await agent.stream({
      messages: modelMessages as any,
      abortSignal: options.abortSignal,
    });
    logger.info(
      {
        toolCallId,
        name,
        hasWriter: Boolean(writer),
      },
      "[sub-agent] stream ready",
    );

    let outputText = "";
    let responseParts: unknown[] = [];
    const uiStream = result.toUIMessageStream({
      originalMessages: subAgentMessages as any[],
      generateMessageId: () => generateId(),
      onFinish: ({ responseMessage }) => {
        const parts = Array.isArray(responseMessage?.parts) ? responseMessage.parts : [];
        responseParts = parts;
      },
    });
    try {
      // 逻辑：转发子Agent的 UIMessageChunk，让前端复用渲染逻辑。
      const reader = uiStream.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const type = (value as any)?.type;
        if (type === "text-delta") {
          const delta = (value as any)?.delta;
          if (delta) outputText += String(delta);
          if (writer && delta) {
            writer.write({
              type: "data-sub-agent-delta",
              data: { toolCallId, delta },
            } as any);
          }
        }
        if (!writer) continue;
        writer.write({
          type: "data-sub-agent-chunk",
          data: { toolCallId, chunk: value },
        } as any);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "sub-agent failed";
      if (writer) {
        writer.write({
          type: "data-sub-agent-error",
          data: { toolCallId, errorText },
        } as any);
      }
      if (sessionId) {
        await saveSubAgentHistory({
          sessionId,
          toolCallId,
          actionName,
          name,
          task,
          parts: [{ type: "text", text: errorText }],
          createdAt: startedAt,
        });
      }
      throw err;
    }

    const finalizedParts =
      responseParts.length > 0
        ? responseParts
        : outputText
          ? [{ type: "text", text: outputText }]
          : [];

    if (sessionId) {
      await saveSubAgentHistory({
        sessionId,
        toolCallId,
        actionName,
        name,
        task,
        parts: finalizedParts,
        createdAt: startedAt,
      });
    }

    if (writer) {
      writer.write({
        type: "data-sub-agent-end",
        data: { toolCallId, output: outputText },
      } as any);
    }
    logger.info(
      {
        toolCallId,
        name,
        outputLength: outputText.length,
      },
      "[sub-agent] finish",
    );

    return finalizedParts[finalizedParts.length - 1] ?? null;
  },
});
