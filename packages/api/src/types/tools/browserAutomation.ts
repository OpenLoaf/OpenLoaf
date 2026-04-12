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
  name: "Browser Snapshot",
  description:
    "Capture a snapshot of the current browser page (URL, title, visible text, interactive elements). See browser-ops skill for usage.",
  parameters: z.object({}),
  component: null,
} as const;

export const browserObserveToolDef = {
  id: "BrowserObserve",
  readonly: true,
  name: "Browser Observe",
  description:
    "Observe the page with a task-focused snapshot (find buttons / forms / key sections). See browser-ops skill for usage.",
  parameters: z.object({
    task: z.string().describe("Observation goal."),
  }),
  component: null,
} as const;

export const browserExtractToolDef = {
  id: "BrowserExtract",
  readonly: true,
  name: "Browser Extract",
  description:
    "Extract text from the page relevant to a query. See browser-ops skill for usage.",
  parameters: z.object({
    query: z.string(),
  }),
  component: null,
} as const;

export const browserActToolDef = {
  id: "BrowserAct",
  readonly: false,
  name: "Browser Act",
  description:
    "Perform an action on the current page (click / type / fill / scroll / press). See browser-ops skill for usage.",
  parameters: z
    .object({
      action: z.enum(["click-css", "click-text", "type", "fill", "press", "press-on", "scroll"]),
      selector: z
        .string()
        .optional()
        .describe("CSS selector. type/fill use current focus when omitted."),
      text: z.string().optional().describe("Text to type or match visibly."),
      key: z.string().optional().describe("e.g. Enter."),
      y: z.number().int().optional().describe("Scroll distance in pixels."),
    })
    .superRefine((value, ctx) => {
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
  name: "Browser Wait",
  description:
    "Wait for a page condition (load / network idle / url / text / timeout). See browser-ops skill for usage.",
  parameters: z.object({
    type: z.enum(["timeout", "load", "networkidle", "urlIncludes", "textIncludes"]),
    timeoutMs: z.number().int().min(0).optional().describe("Milliseconds."),
    url: z.string().optional().describe("Fragment to match for urlIncludes."),
    text: z.string().optional().describe("Fragment to match for textIncludes."),
  }),
  component: null,
} as const;

export const browserScreenshotToolDef = {
  id: "BrowserScreenshot",
  readonly: true,
  name: "Browser Screenshot",
  description:
    "Capture a screenshot of the current page (viewport or full page) and save as an image file. See browser-ops skill for usage.",
  parameters: z.object({
    format: z.enum(["png", "jpeg", "webp"]).optional().describe("Default png."),
    quality: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("For jpeg/webp. Default 80."),
    fullPage: z
      .boolean()
      .optional()
      .describe("Include off-screen areas. Default false."),
  }),
  component: null,
} as const;

export const browserDownloadImageToolDef = {
  id: "BrowserDownloadImage",
  readonly: false,
  name: "Download Images",
  description:
    "Download images from the current page by absolute URLs or CSS selector. See browser-ops skill for usage.",
  parameters: z.object({
    imageUrls: z
      .array(z.string())
      .optional()
      .describe("Absolute URLs. Use one of imageUrls or selector."),
    selector: z
      .string()
      .optional()
      .describe("CSS selector for img elements. Use one of imageUrls or selector."),
    maxCount: z.number().int().min(1).max(20).optional().describe("Default 10."),
  }),
  component: null,
} as const;
