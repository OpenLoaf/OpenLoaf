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
import {
  resolveMessagePathById,
  resolveNextMessagePath,
  saveMessage,
} from "@/ai/services/chat/repositories/messageStore";
import { buildModelMessages } from "@/ai/shared/messageConverter";
import { logger } from "@/common/logger";
import {
  getAssistantMessageId,
  getAssistantMessagePath,
  getAssistantParentMessageId,
  getChatModel,
  getSessionId,
  getUiWriter,
  setAssistantMessagePath,
} from "@/ai/shared/context/requestContext";
import { registerFrontendToolPending } from "@/ai/tools/pendingRegistry";

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
  /** Optional path override for sub-agent history. */
  pathOverride?: string;
  /** Parent message id for aligning with assistant. */
  parentMessageId?: string | null;
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
    parentMessageId: input.parentMessageId ?? null,
    ...(input.pathOverride ? { pathOverride: input.pathOverride } : {}),
    createdAt: input.createdAt,
    allowEmpty: true,
  });
}

/** Sub-agent approval gate metadata. */
type ApprovalGate = {
  approvalId: string;
  toolCallId: string;
  part: any;
};

/** Resolve approval gate from sub-agent parts. */
function resolveApprovalGate(parts: unknown[]): ApprovalGate | null {
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const approval = (part as { approval?: { id?: unknown; approved?: unknown } }).approval;
    const approvalId = typeof approval?.id === "string" ? approval.id : "";
    if (!approvalId) continue;
    if (approval?.approved === true || approval?.approved === false) continue;
    const toolCallId =
      typeof (part as { toolCallId?: unknown }).toolCallId === "string"
        ? String((part as { toolCallId?: string }).toolCallId)
        : "";
    if (!toolCallId) continue;
    return { approvalId, toolCallId, part };
  }
  return null;
}

/** Update approval status on parts. */
function applyApprovalDecision(input: {
  parts: unknown[];
  approvalId: string;
  approved: boolean;
}) {
  for (const part of input.parts) {
    if (!part || typeof part !== "object") continue;
    const approval = (part as { approval?: { id?: unknown } }).approval;
    const currentId = typeof approval?.id === "string" ? approval.id : "";
    if (currentId !== input.approvalId) continue;
    (part as any).approval = { ...approval, approved: input.approved };
    // 逻辑：审批已响应，避免重复停在 approval-requested。
    (part as any).state = "approval-responded";
  }
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
    const assistantMessageId = getAssistantMessageId();
    const assistantParentMessageId = getAssistantParentMessageId() ?? null;
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

    let outputText = "";
    let responseParts: unknown[] = [];
    let approvalGate: ApprovalGate | null = null;
    let approvalWaitTimeoutSec = 60;

    const runSubAgentStream = async () => {
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

      const uiStream = result.toUIMessageStream({
        originalMessages: subAgentMessages as any[],
        generateMessageId: () => generateId(),
        onFinish: ({ responseMessage }) => {
          const parts = Array.isArray(responseMessage?.parts) ? responseMessage.parts : [];
          responseParts = parts;
        },
      });

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
    };
    try {
      // 逻辑：转发子Agent的 UIMessageChunk，让前端复用渲染逻辑。
      await runSubAgentStream();
      approvalGate = resolveApprovalGate(responseParts);
      if (approvalGate) {
        const timeoutValue = (approvalGate.part as { timeoutSec?: unknown }).timeoutSec;
        if (Number.isFinite(timeoutValue)) {
          approvalWaitTimeoutSec = Math.max(1, Math.floor(Number(timeoutValue)));
        }
        logger.info(
          { toolCallId, approvalId: approvalGate.approvalId },
          "[sub-agent] approval requested",
        );
        const ack = await registerFrontendToolPending({
          toolCallId: approvalGate.approvalId,
          timeoutSec: approvalWaitTimeoutSec,
        });
        if (ack.status !== "success") {
          throw new Error(ack.errorText || "sub-agent approval failed");
        }
        const approved = Boolean(
          ack.output &&
            typeof ack.output === "object" &&
            (ack.output as { approved?: unknown }).approved === true,
        );
        applyApprovalDecision({
          parts: responseParts,
          approvalId: approvalGate.approvalId,
          approved,
        });
        // 逻辑：将审批响应写回子代理上下文，继续执行工具。
        subAgentMessages.push({
          id: generateId(),
          role: "assistant",
          parts: responseParts as any[],
        } as any);
        outputText = "";
        responseParts = [];
        approvalGate = null;
        await runSubAgentStream();
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
        let assistantMessagePath: string | null | undefined = getAssistantMessagePath();
        if (!assistantMessagePath && assistantMessageId) {
          assistantMessagePath = await resolveMessagePathById({
            sessionId,
            messageId: assistantMessageId,
          });
          if (assistantMessagePath) {
            setAssistantMessagePath(assistantMessagePath);
          }
        }
        if (!assistantMessagePath) {
          // 逻辑：优先复用主 assistant 的路径，避免子 Agent 产生新分支。
          assistantMessagePath = await resolveNextMessagePath({
            sessionId,
            parentMessageId: assistantParentMessageId,
          });
          if (assistantMessagePath) {
            setAssistantMessagePath(assistantMessagePath);
          }
        }
        await saveSubAgentHistory({
          sessionId,
          toolCallId,
          actionName,
          name,
          task,
          parts: [{ type: "text", text: errorText }],
          createdAt: startedAt,
          pathOverride: assistantMessagePath ?? undefined,
          parentMessageId: assistantParentMessageId,
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
        let assistantMessagePath: string | null | undefined = getAssistantMessagePath();
      if (!assistantMessagePath && assistantMessageId) {
        assistantMessagePath = await resolveMessagePathById({
          sessionId,
          messageId: assistantMessageId,
        });
        if (assistantMessagePath) {
          setAssistantMessagePath(assistantMessagePath);
        }
      }
      if (!assistantMessagePath) {
        // 逻辑：优先复用主 assistant 的路径，避免子 Agent 产生新分支。
        assistantMessagePath = await resolveNextMessagePath({
          sessionId,
          parentMessageId: assistantParentMessageId,
        });
        if (assistantMessagePath) {
          setAssistantMessagePath(assistantMessagePath);
        }
      }
      await saveSubAgentHistory({
        sessionId,
        toolCallId,
        actionName,
        name,
        task,
        parts: finalizedParts,
        createdAt: startedAt,
        pathOverride: assistantMessagePath ?? undefined,
        parentMessageId: assistantParentMessageId,
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
