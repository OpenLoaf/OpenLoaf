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
  id: "browser-snapshot",
  name: "浏览器快照",
  description:
    "触发：当你需要了解当前可控页面的整体状态（URL/标题/可见文本/可交互元素）以决定下一步操作时调用。用途：抓取页面快照。返回：{ ok: true, data: { url, title, readyState, text, elements, frames? } }（文本/元素可能被截断）；无可用页面或执行失败会报错。",
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：获取页面快照。"),
  }),
  component: null,
} as const;

export const browserObserveToolDef = {
  id: "browser-observe",
  name: "页面观察",
  description:
    "触发：当你围绕特定目标观察页面（例如找按钮/表单/关键区块）时调用。用途：基于 task 生成更聚焦的页面快照。返回：{ ok: true, data: { task, snapshot: { url, title, readyState, text, elements, frames? } } }；失败会报错。",
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：观察页面寻找操作线索。"),
    task: z.string().describe("观察目标/关注点。"),
  }),
  component: null,
} as const;

export const browserExtractToolDef = {
  id: "browser-extract",
  name: "页面提取",
  description:
    "触发：当你需要从页面提取与 query 相关的文本信息时调用。用途：抓取页面文本并围绕 query 提取内容。返回：{ ok: true, data: { query, text } }（text 可能被截断）；失败会报错。",
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：提取页面关键信息。"),
    query: z.string().describe("要提取的信息描述。"),
  }),
  component: null,
} as const;

export const browserActToolDef = {
  id: "browser-act",
  name: "页面动作",
  description:
    "触发：当你需要在当前页面执行点击/输入/滚动/按键等具体动作时调用（通常先用 snapshot/observe 获取 selector）。用途：按 action 执行动作并返回结果。返回：{ ok: true, data: { action, ... } }（字段随 action 变化，例如 click/press/scroll）；元素不存在或参数不匹配会报错。",
  parameters: z
    .object({
      actionName: z
      .string()
      .optional()
        .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：点击按钮或输入文本。"),
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
  name: "页面等待",
  description:
    "触发：当你需要等待页面加载完成、网络空闲、URL/文本出现，或仅需等待一段时间时调用。用途：等待条件满足后返回。返回：timeout 返回 { waitedMs }；load/networkidle 返回 { type, approx? }；urlIncludes/textIncludes 返回 { type, urlIncludes?/textIncludes? }。若超过 timeoutMs 或参数缺失会报错。",
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：等待页面加载完成。"),
    type: z.enum(["timeout", "load", "networkidle", "urlIncludes", "textIncludes"]),
    timeoutMs: z.number().int().min(0).optional().describe("最大等待时间（毫秒）。"),
    url: z.string().optional().describe("urlIncludes 的匹配片段。"),
    text: z.string().optional().describe("textIncludes 的匹配片段。"),
  }),
  component: null,
} as const;

export const browserScreenshotToolDef = {
  id: "browser-screenshot",
  name: "页面截图",
  description:
    "触发：当你需要截取当前浏览器页面的截图时调用。用途：捕获页面可视区域或完整页面的截图并保存为图片文件。返回：{ ok: true, data: { url, format, bytes } }；无可用页面或截图失败会报错。不适用：仅需提取文本时使用 browser-extract。",
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：截取当前页面截图。"),
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
  id: "browser-download-image",
  name: "下载网页图片",
  description:
    "触发：当你需要下载当前页面上的图片文件时调用。用途：通过提供图片 URL 列表或 CSS 选择器从页面中查找 img 元素并下载图片。返回：{ ok: true, data: { images: [{ url, sourceUrl, fileName, bytes }], errors? } }；全部失败会报错。不适用：需要截取整个页面请用 browser-screenshot。",
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：下载商品图片。"),
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
