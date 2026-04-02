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
  name: "打开网页",
  description:
    "触发：当你需要在应用内浏览器打开页面，让用户查看或继续操作（如登录、确认页面内容）时调用。用途：打开指定 URL（可省略协议）并等待前端回执。返回：前端回执对象 { toolCallId, status: success|failed|timeout, output?, errorText?, requestedAt }。不适用：不要用它截图、抓取网页内容或自动化操作；截图和网页自动化任务必须通过 Agent 工具派发 browser 子代理完成。",
  parameters: z.object({
    url: z.string().describe("要打开的 URL（允许不带协议）。"),
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
