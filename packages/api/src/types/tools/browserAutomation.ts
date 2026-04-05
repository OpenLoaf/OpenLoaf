/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const browserSnapshotToolDef = {
  id: "BrowserSnapshot",
  readonly: true,
  name: "浏览器快照",
  description:
    "Captures a snapshot of the current browser page (URL/title/visible text/interactive elements) to decide next actions. Text and elements are truncated at 32KB/120 items. For exact DOM structure (tags/attrs for precise selector matching), Read/Grep the full outerHTML at `rawHtmlPath`.",
  parameters: z.object({}),
  component: null,
} as const;

export const browserObserveToolDef = {
  id: "BrowserObserve",
  readonly: true,
  name: "页面观察",
  description:
    "Observes the page with a specific focus (finding buttons / forms / key sections). Generates a task-focused snapshot. Snapshot fields truncated at 32KB/120 items; Read/Grep `rawHtmlPath` for full DOM.",
  parameters: z.object({
    task: z.string().describe("观察目标/关注点。"),
  }),
  component: null,
} as const;

export const browserExtractToolDef = {
  id: "BrowserExtract",
  readonly: true,
  name: "页面提取",
  description:
    "Extracts text from the page relevant to a query. Text truncated at 32KB; Read/Grep `rawHtmlPath` for full DOM structure.",
  parameters: z.object({
    query: z.string().describe("要提取的信息描述。"),
  }),
  component: null,
} as const;

export const browserActToolDef = {
  id: "BrowserAct",
  readonly: false,
  name: "页面动作",
  description:
    "Performs an action on the current page (click / type / fill / scroll / press key). Usually call snapshot or observe first to get the selector. Errors if the element is missing or params don't match the action.",
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
  id: "BrowserWait",
  readonly: true,
  name: "页面等待",
  description:
    "Waits for a condition: page load, network idle, URL contains, text contains, or a plain timeout. Errors if `timeoutMs` is exceeded.",
  parameters: z.object({
    type: z.enum(["timeout", "load", "networkidle", "urlIncludes", "textIncludes"]),
    timeoutMs: z.number().int().min(0).optional().describe("最大等待时间（毫秒）。"),
    url: z.string().optional().describe("urlIncludes 的匹配片段。"),
    text: z.string().optional().describe("textIncludes 的匹配片段。"),
  }),
  component: null,
} as const;

export const browserScreenshotToolDef = {
  id: "BrowserScreenshot",
  readonly: true,
  name: "页面截图",
  description:
    "Captures a screenshot of the current browser page (viewport or full page) and saves it as an image file. Do NOT use just to extract text — use BrowserExtract instead.",
  parameters: z.object({
    format: z
      .enum(["png", "jpeg", "webp"])
      .optional()
      .describe("截图格式，默认 png。"),
    quality: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("图片质量（仅 jpeg/webp 有效），默认 80。"),
    fullPage: z
      .boolean()
      .optional()
      .describe("是否截取完整页面（包括滚动不可见区域），默认 false 仅截取可视区域。"),
  }),
  component: null,
} as const;

export const browserDownloadImageToolDef = {
  id: "BrowserDownloadImage",
  readonly: false,
  name: "下载网页图片",
  description:
    "Downloads images from the current page — pass either a list of absolute image URLs or a CSS selector to find `img` elements. For full-page screenshots use BrowserScreenshot.",
  parameters: z.object({
    imageUrls: z
      .array(z.string())
      .optional()
      .describe("要下载的图片绝对 URL 列表。与 selector 二选一。"),
    selector: z
      .string()
      .optional()
      .describe("CSS 选择器，用于从页面中查找 img 元素并提取其 src 下载。例如：'.product img'。与 imageUrls 二选一。"),
    maxCount: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("最多下载的图片数量，默认 10，最大 20。"),
  }),
  component: null,
} as const;
