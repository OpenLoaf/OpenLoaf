import { z } from "zod";

const MAX_ACTION_CHARS = 2000;
const MAX_INSTRUCTION_CHARS = 4000;

export const browserSnapshotToolDef = {
  id: "browser-snapshot",
  description:
    "观察：获取当前用户可见浏览器页面的快照（由 Electron 执行并回传）。用于理解页面并决定下一步动作。",
  parameters: z.object({
    verbose: z.boolean().optional().describe("是否返回更详细的快照（默认 false）。"),
  }),
  component: null,
} as const;

export const browserActToolDef = {
  id: "browser-act",
  description:
    "行动：对当前用户可见浏览器页面执行一个原子动作（例如 click/type/scroll），由 Electron 执行并回传结果。",
  parameters: z.object({
    action: z
      .string()
      .min(1)
      .max(MAX_ACTION_CHARS)
      .describe("单步动作描述（只做一件事，例如：click the login button）。"),
    timeoutMs: z.number().int().min(0).max(120_000).optional().describe("超时（ms，可选）。"),
  }),
  component: null,
} as const;

export const browserObserveToolDef = {
  id: "browser-observe",
  description:
    "观察：在当前页面上寻找可执行的候选动作，返回结构化 action 列表（由 Electron 执行并回传）。",
  parameters: z.object({
    instruction: z
      .string()
      .min(1)
      .max(MAX_INSTRUCTION_CHARS)
      .describe("观察指令（例如：find the login button）。"),
    timeoutMs: z.number().int().min(0).max(120_000).optional().describe("超时（ms，可选）。"),
  }),
  component: null,
} as const;

export const browserExtractToolDef = {
  id: "browser-extract",
  description:
    "提取：从当前页面提取文本或结构化信息（由 Electron 执行并回传）。不传 instruction 时返回页面文本快照。",
  parameters: z.object({
    instruction: z
      .string()
      .min(1)
      .max(MAX_INSTRUCTION_CHARS)
      .optional()
      .describe("提取指令（可选）。"),
    timeoutMs: z.number().int().min(0).max(120_000).optional().describe("超时（ms，可选）。"),
  }),
  component: null,
} as const;

export const browserWaitToolDef = {
  id: "browser-wait",
  description:
    "同步：等待页面条件（例如：load/networkidle/URL/text/timeout），由 Electron 执行并回传。",
  parameters: z.object({
    type: z.enum(["timeout", "load", "networkidle", "urlIncludes", "textIncludes"]),
    timeoutMs: z.number().int().min(0).max(120_000).optional().describe("超时（ms，可选）。"),
    url: z.string().min(1).optional().describe("type=urlIncludes 时使用：URL 子串。"),
    text: z.string().min(1).optional().describe("type=textIncludes 时使用：等待正文包含该文本。"),
  }),
  component: null,
} as const;

