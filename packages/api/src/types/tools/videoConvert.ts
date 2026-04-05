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
    '触发：当用户需要转换视频/音频格式、从视频中提取音频、或查看视频文件信息时调用。' +
    '典型场景："把 MP4 转成 WebM"、"从视频里提取 MP3 音频"、"查看这个视频的分辨率和时长"、"把 AVI 转成 MP4 并调整为 720p"、"把 WAV 转成 MP3"。' +
    '依赖系统 FFmpeg，未安装时会返回安装指引（macOS: brew install ffmpeg）。' +
    '支持的视频格式互转：mp4, avi, mkv, mov, webm, flv, wmv, m4v。' +
    '支持的音频格式互转：mp3, wav, aac, flac, ogg。' +
    'action 说明与必填参数：' +
    'convert — 需 outputPath，可选 format（mp4/avi/mkv/mov/webm）和 resolution（如 "1280x720"）；' +
    'extract-audio — 需 outputPath，可选 audioFormat（mp3/aac/wav/flac/ogg，默认 mp3）；' +
    'get-info — 无额外必填参数，返回时长、分辨率、编解码器、流信息。' +
    '返回：convert/extract-audio 返回 { ok, data: { action, outputPath, format, duration, fileSize } }，' +
    'get-info 返回 { ok, data: { action, duration, resolution, codecs, fileSize, streams } }。' +
    '不适用：需要 AI 生成全新视频时不要使用，改用画布 v3 媒体生成流程。',
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
