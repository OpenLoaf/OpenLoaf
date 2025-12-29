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
  description: "在当前页面执行一个结构化动作（click-css/click-text/type/fill/press/press-on/scroll）。",
  parameters: z
    .object({
      action: z
        .enum(["click-css", "click-text", "type", "fill", "press", "press-on", "scroll"])
        .describe("动作类型。"),
      selector: z
        .string()
        .optional()
        .describe("目标元素的 CSS selector（type/fill 未提供时使用当前聚焦元素）。"),
      text: z.string().optional().describe("用于输入或可见文本匹配的内容。"),
      key: z.string().optional().describe("要按下的按键，例如 Enter。"),
      y: z.number().int().optional().describe("滚动距离（像素，正/负）。"),
    })
    .superRefine((value, ctx) => {
      // 按 action 校验必填字段，避免缺参导致动作无效。
      if (value.action === "click-css" && !value.selector) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "selector is required for click-css." });
      }
      if (value.action === "click-text" && !value.text) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "text is required for click-text." });
      }
      if ((value.action === "type" || value.action === "fill") && value.text == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "text is required for type/fill." });
      }
      if (value.action === "press" && !value.key) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "key is required for press." });
      }
      if (value.action === "press-on" && (!value.selector || !value.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "selector and key are required for press-on." });
      }
      if (value.action === "scroll" && typeof value.y !== "number") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "y is required for scroll." });
      }
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
