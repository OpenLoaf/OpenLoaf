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

export const videoConvertToolDef = {
  id: 'VideoConvert',
  readonly: false,
  name: 'Convert Video',
  description:
    'Convert video/audio formats, extract audio from video, or read file info. Requires FFmpeg. See media-ops skill for usage.',
  parameters: z.object({
    action: z.enum(['convert', 'extract-audio', 'get-info']),
    filePath: z
      .string()
      .min(1)
      .describe('Relative to project / global root, or absolute.'),
    outputPath: z
      .string()
      .optional()
      .describe('Required for convert and extract-audio.'),
    format: z
      .enum(['mp4', 'avi', 'mkv', 'mov', 'webm'])
      .optional()
      .describe('For convert.'),
    resolution: z
      .string()
      .optional()
      .describe('For convert, e.g. "1280x720".'),
    audioFormat: z
      .enum(['mp3', 'aac', 'wav', 'flac', 'ogg'])
      .optional()
      .describe('For extract-audio. Default mp3.'),
  }),
  needsApproval: true,
  component: null,
} as const
