/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

export const videoDownloadToolDef = {
  id: 'video-download',
  name: '视频下载',
  description:
    '触发：当用户明确要求根据公开视频网址直接下载视频时调用。' +
    '用途：通过服务端 yt-dlp 下载视频，并自动保存到当前上下文的资源目录。' +
    '若当前在画布上下文，则保存到当前画布的 asset 目录；否则保存到当前会话的 chat-history/asset 目录。' +
    '支持常见视频平台链接以及可直接访问的视频文件 URL。' +
    '返回：{ ok, data: { url, destination, fileName, filePath, absolutePath, fileSize, title, duration, width, height, ext } }。' +
    '不适用：需要生成全新视频时不要使用，改用 video-generate；需要转换本地已有视频时改用 video-convert。',
  parameters: z.object({
    url: z
      .string()
      .min(1)
      .describe('要下载的视频网址，建议传完整 URL（包含 http:// 或 https://）。'),
  }),
  needsApproval: false,
  component: null,
} as const
