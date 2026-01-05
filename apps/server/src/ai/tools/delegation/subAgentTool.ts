import { streamText, tool, zodSchema } from "ai";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { getChatModel, getUiWriter } from "@/common/requestContext";

const DEFAULT_SUB_AGENT_SYSTEM_PROMPT = [
  "你是一个子Agent，负责独立完成指定任务。",
  "只输出任务相关的结果与必要步骤，不要复述任务。",
].join("\n");

/**
 * Builds sub-agent messages for streaming execution.
 */
function buildSubAgentMessages(input: { name: string; task: string }) {
  return [
    {
      role: "system",
      content: `子Agent名称：${input.name}\n${DEFAULT_SUB_AGENT_SYSTEM_PROMPT}`,
    },
    { role: "user", content: input.task },
  ] as const;
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

    const writer = getUiWriter();
    const toolCallId = options.toolCallId;

    if (writer) {
      writer.write({
        type: "data-sub-agent-start",
        data: { toolCallId, name, task },
      } as any);
    }

    const result = streamText({
      model,
      messages: buildSubAgentMessages({ name, task }) as any,
      abortSignal: options.abortSignal,
    });

    let outputText = "";
    try {
      // 中文注释：边生成边把子Agent文本流推送给前端。
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
