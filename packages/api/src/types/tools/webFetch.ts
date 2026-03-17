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

export const webFetchToolDef = {
  id: "web-fetch",
  name: "获取网页内容",
  description:
    "触发：当你需要获取指定 URL 的内容（JSON API、HTML 网页、纯文本）时调用。用途：发起 HTTP GET 请求，返回响应内容；HTML 自动转为 Markdown 便于阅读。返回：{ ok, url, content, contentType, title?, length }。不适用：不要用于需要交互的网页（使用 browser 子代理）；不要用于搜索（使用 web-search）；不要用于仅打开页面让用户查看（使用 open-url）。",
  parameters: z.object({
    url: z
      .string()
      .min(1)
      .describe("要获取的 URL（含协议，如 https://example.com）"),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("可选：自定义请求头"),
    maxLength: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("可选：返回内容最大字符数，默认 50000"),
  }),
  component: null,
} as const;
