import { tool, zodSchema } from "ai";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import {
  BROWSER_SUB_AGENT_NAME,
  createBrowserSubAgent,
} from "@/ai/agents/subagent/browserSubAgent";
import {
  DOCUMENT_ANALYSIS_SUB_AGENT_NAME,
  createDocumentAnalysisSubAgent,
} from "@/ai/agents/subagent/documentAnalysisSubAgent";
import { getChatModel, getUiWriter } from "@/ai/shared/context/requestContext";

/**
 * Builds sub-agent messages for streaming execution.
 */
function buildSubAgentMessages(input: { task: string }) {
  return [{ role: "user", content: input.task }] as const;
}

/**
 * Sub-agent tool (MVP).
 */
export const subAgentTool = tool({
  description: subAgentToolDef.description,
  inputSchema: zodSchema(subAgentToolDef.parameters),
  execute: async ({ name, task }, options) => {
    const model = getChatModel();
    if (!model) {
      throw new Error("chat model is not available.");
    }

    if (name !== BROWSER_SUB_AGENT_NAME && name !== DOCUMENT_ANALYSIS_SUB_AGENT_NAME) {
      // 逻辑：仅允许已注册的子Agent，避免未知子Agent执行。
      throw new Error(
        `unsupported sub-agent: ${name}. only ${BROWSER_SUB_AGENT_NAME} and ${DOCUMENT_ANALYSIS_SUB_AGENT_NAME} are allowed.`,
      );
    }

    const writer = getUiWriter();
    const toolCallId = options.toolCallId;

    if (writer) {
      writer.write({
        type: "data-sub-agent-start",
        data: { toolCallId, name, task },
      } as any);
    }

    const agent =
      name === DOCUMENT_ANALYSIS_SUB_AGENT_NAME
        ? createDocumentAnalysisSubAgent({ model })
        : createBrowserSubAgent({ model });
    const result = await agent.stream({
      messages: buildSubAgentMessages({ task }) as any,
      abortSignal: options.abortSignal,
    });

    let outputText = "";
    try {
      // 逻辑：边生成边把子Agent文本流推送给前端。
      for await (const delta of result.textStream) {
        if (!delta) continue;
        outputText += delta;
        if (writer) {
          writer.write({
            type: "data-sub-agent-delta",
            data: { toolCallId, delta },
          } as any);
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "sub-agent failed";
      if (writer) {
        writer.write({
          type: "data-sub-agent-error",
          data: { toolCallId, errorText },
        } as any);
      }
      throw err;
    }

    if (writer) {
      writer.write({
        type: "data-sub-agent-end",
        data: { toolCallId, output: outputText },
      } as any);
    }

    return outputText;
  },
});
