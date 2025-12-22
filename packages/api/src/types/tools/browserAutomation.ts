import { z } from "zod";

export const browserSnapshotToolDef = {
  id: "browser-snapshot",
  description: "获取当前可控页面的快照（URL/标题/可见文本/可交互元素）。",
  parameters: z.object({}),
  component: null,
} as const;

export const browserObserveToolDef = {
  id: "browser-observe",
  description: "观察当前页面并返回快照，可用于寻找下一步动作线索。",
  parameters: z.object({
    task: z.string().describe("观察目标/关注点。"),
  }),
  component: null,
} as const;

export const browserExtractToolDef = {
  id: "browser-extract",
  description: "从当前页面提取与 query 相关的文本内容。",
  parameters: z.object({
    query: z.string().describe("要提取的信息描述。"),
  }),
  component: null,
} as const;

export const browserActToolDef = {
  id: "browser-act",
  description: "在当前页面执行一个结构化动作（click/type/fill/press/scroll）。",
  parameters: z.object({
    action: z
      .string()
      .describe(
        '动作格式示例：click css="#id" | click text="按钮文案" | type css="#input" text="hello" | press key="Enter" | press css="#input" key="Enter" | scroll y="400"',
      ),
  }),
  component: null,
} as const;

export const browserWaitToolDef = {
  id: "browser-wait",
  description: "等待页面满足条件后再返回。",
  parameters: z.object({
    type: z.enum(["timeout", "load", "networkidle", "urlIncludes", "textIncludes"]),
    timeoutMs: z.number().int().min(0).optional().describe("最大等待时间（毫秒）。"),
    url: z.string().optional().describe("urlIncludes 的匹配片段。"),
    text: z.string().optional().describe("textIncludes 的匹配片段。"),
  }),
  component: null,
} as const;
