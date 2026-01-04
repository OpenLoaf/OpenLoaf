import { z } from "zod";

const MAX_TASK_CHARS = 6000;

export const subAgentToolDef = {
  id: "sub-agent",
  description:
    "调用一个子 Agent 来完成特定任务，并把子 Agent 的流式输出合并到当前对话中。适合需要专业化处理的场景（例如浏览器检索与网页总结）。",
  parameters: z.object({
    name: z.string().describe("子 Agent 名称，例如：browser"),
    task: z
      .string()
      .min(1)
      .max(MAX_TASK_CHARS)
      .describe("交给子 Agent 执行的任务描述（尽量包含必要上下文）"),
  }),
  component: null,
} as const;

export type SubAgentStreamPart =
  | {
      /** Part type for regular text content. */
      type: "text";
      /** Aggregated text content. */
      text: string;
    }
  | {
      /** Part type for model reasoning content. */
      type: "reasoning";
      /** Aggregated reasoning content. */
      text: string;
    }
  | {
      /** Part type for tool output. */
      type: `tool-${string}` | "dynamic-tool";
      /** Tool call id for updates. */
      toolCallId: string;
      /** Tool name for display. */
      toolName?: string;
      /** Optional title from the model. */
      title?: string;
      /** Tool state (input/output/approval). */
      state?: string;
      /** Tool input payload. */
      input?: unknown;
      /** Tool output payload. */
      output?: unknown;
      /** Tool error text. */
      errorText?: string;
    };

export type SubAgentStreamPayload = {
  /** Payload marker for sub-agent tool output. */
  type: "sub-agent-stream";
  /** Sub-agent identity and model info. */
  agent: {
    /** Sub-agent display name. */
    name: string;
    /** Sub-agent unique id. */
    id: string;
    /** Model info for this sub-agent run. */
    model?: { provider: string; modelId: string };
  };
  /** Streaming status. */
  status: "streaming" | "done" | "error";
  /** Aggregated sub-agent parts. */
  parts: SubAgentStreamPart[];
  /** Error text if status is error. */
  errorText?: string;
};

export type SubAgentToolOutput = {
  /** Tool output ok flag. */
  ok: true;
  /** Sub-agent stream payload. */
  data: SubAgentStreamPayload;
};
