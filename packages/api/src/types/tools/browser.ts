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

export const openUrlToolDef = {
  id: "OpenUrl",
  readonly: true,
  name: "打开网页",
  description:
    "Opens a URL in the in-app browser for the user to view or interact with (e.g. login, confirm page content). Protocol is optional. Do NOT use for scraping, screenshots, or automation — dispatch a browser sub-agent via Agent for those.",
  parameters: z.object({
    url: z.string().min(1).describe("要打开的 URL（允许不带协议）。"),
    title: z.string().optional().describe("可选：页面标题，用于 UI 展示。"),
    timeoutSec: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("可选：等待前端执行完成的超时秒数，默认 60 秒。"),
  }),
  component: null,
} as const;

/**
 * Get browser tool definition in specified language.
 * Currently returns Chinese version. English translation can be added
 * by creating separate .en.ts variant in future iterations.
 */
export function getOpenUrlToolDef(lang?: string) {
  // Currently defaults to Chinese
  // Can be extended to support other languages: en-US, ja-JP, etc.
  return openUrlToolDef;
}
