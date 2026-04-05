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

export const fileInfoToolDef = {
  id: 'FileInfo',
  readonly: true,
  name: '文件信息',
  description:
    'Returns file metadata: size, MIME type, timestamps, plus type-specific details (image dimensions, video duration, PDF page count, Excel sheet count, etc.). File type is auto-detected from extension. Video/audio requires FFmpeg on the system. ' +
    'When presenting file sizes to the user, always convert bytes to human-readable units (KB/MB/GB). ' +
    'Do NOT use for reading file content — use Read or the corresponding *Query tool instead.',
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe('文件路径（相对于项目根目录、全局根目录或绝对路径）'),
  }),
  needsApproval: false,
  component: null,
} as const
