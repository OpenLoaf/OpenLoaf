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
  name: '视频转换',
  description:
    'Converts video/audio formats or extracts audio from video: `convert` (video→video or audio→audio), `extract-audio` (video→audio), `get-info` (duration/resolution/codecs). ' +
    'Video formats: mp4/avi/mkv/mov/webm/flv/wmv/m4v. Audio formats: mp3/wav/aac/flac/ogg. ' +
    'Requires FFmpeg on the system (macOS: `brew install ffmpeg`). ' +
    'Do NOT use for generating new video content — use the canvas v3 media generation flow instead.',
  parameters: z.object({
    action: z
      .enum(['convert', 'extract-audio', 'get-info'])
      .describe(
        '操作类型：convert 转换视频/音频格式，extract-audio 从视频中提取音频，get-info 获取视频/音频文件信息',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('源视频/音频文件路径（相对于项目根目录、全局根目录或绝对路径）'),
    outputPath: z
      .string()
      .optional()
      .describe('输出文件路径。convert 和 extract-audio 时必填。'),
    // convert
    format: z
      .enum(['mp4', 'avi', 'mkv', 'mov', 'webm'])
      .optional()
      .describe('convert 时的目标视频格式'),
    resolution: z
      .string()
      .optional()
      .describe('convert 时的目标分辨率，如 "1280x720"、"1920x1080"'),
    // extract-audio
    audioFormat: z
      .enum(['mp3', 'aac', 'wav', 'flac', 'ogg'])
      .optional()
      .describe('extract-audio 时的目标音频格式，默认 mp3'),
  }),
  needsApproval: true,
  component: null,
} as const
