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
  name: 'Download Video',
  description:
    'Download a video from a public URL via server-side yt-dlp. See media-ops skill for usage.',
  parameters: z.object({
    url: z.string().min(1).describe('Full URL with http:// or https://.'),
  }),
  needsApproval: false,
  component: null,
} as const
