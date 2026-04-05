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
  id: 'VideoDownload',
  readonly: false,
  name: '视频下载',
  description:
    'Downloads a video from a public URL via server-side yt-dlp. Supports common video platforms and direct video file URLs. Saves to the current board\'s asset dir (in canvas context) or the session\'s chat-history asset dir. Use only when the user explicitly asks to download. Do NOT use for generating new video (use canvas v3 media flow) or converting local videos (use VideoConvert).',
  parameters: z.object({
    url: z
      .string()
      .min(1)
      .describe('要下载的视频网址，建议传完整 URL（包含 http:// 或 https://）。'),
  }),
  needsApproval: false,
  component: null,
} as const
