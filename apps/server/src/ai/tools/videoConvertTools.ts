/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Video Convert Tool — fluent-ffmpeg 封装，提供视频/音频格式转换能力。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { tool, zodSchema } from 'ai'
import { videoConvertToolDef } from '@openloaf/api/types/tools/videoConvert'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import { isFfmpegAvailable } from '@/common/ffmpegPaths'

const VIDEO_EXTENSIONS = [
  '.mp4', '.avi', '.mkv', '.mov', '.webm', '.flv', '.wmv', '.m4v',
]
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.flac', '.ogg']
const ALL_MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]


/** Wrap ffmpeg.ffprobe as a Promise. */
function probeFile(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

/** Run an ffmpeg command as a Promise. */
function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

export const videoConvertTool = tool({
  description: videoConvertToolDef.description,
  inputSchema: zodSchema(videoConvertToolDef.parameters),
  execute: async (input) => {
    const {
      action, filePath, outputPath,
      format, resolution, audioFormat,
    } = input as {
      action: string
      filePath: string
      outputPath?: string
      format?: string
      resolution?: string
      audioFormat?: string
    }

    if (!isFfmpegAvailable()) {
      return {
        ok: false,
        error: '系统未安装 FFmpeg，视频转换功能不可用。macOS: brew install ffmpeg，Windows: choco install ffmpeg，Linux: apt install ffmpeg',
      }
    }

    const absInput = await resolveOfficeFile(filePath, ALL_MEDIA_EXTENSIONS)

    switch (action) {
      case 'get-info': {
        const info = await probeFile(absInput)
        const stat = await fs.stat(absInput)
        const videoStream = info.streams.find((s) => s.codec_type === 'video')
        const audioStream = info.streams.find((s) => s.codec_type === 'audio')

        return {
          ok: true,
          data: {
            action: 'get-info',
            duration: info.format.duration,
            resolution: videoStream
              ? `${videoStream.width}x${videoStream.height}`
              : null,
            codecs: {
              video: videoStream?.codec_name ?? null,
              audio: audioStream?.codec_name ?? null,
            },
            fileSize: stat.size,
            streams: info.streams.map((s) => ({
              type: s.codec_type,
              codec: s.codec_name,
              width: s.width,
              height: s.height,
              sampleRate: s.sample_rate,
              channels: s.channels,
            })),
          },
        }
      }

      case 'convert': {
        if (!outputPath) throw new Error('convert requires outputPath.')
        const resolved = resolveToolPath({ target: outputPath })
        const absOutput = resolved.absPath
        await fs.mkdir(path.dirname(absOutput), { recursive: true })

        const cmd = ffmpeg(absInput).output(absOutput)

        if (format) {
          cmd.format(format)
        }
        if (resolution) {
          cmd.size(resolution)
        }

        await runFfmpeg(cmd)

        const info = await probeFile(absOutput)
        const stat = await fs.stat(absOutput)

        return {
          ok: true,
          data: {
            action: 'convert',
            outputPath: absOutput,
            format: format || path.extname(absOutput).slice(1),
            duration: info.format.duration,
            fileSize: stat.size,
          },
        }
      }

      case 'extract-audio': {
        if (!outputPath) throw new Error('extract-audio requires outputPath.')
        const resolved = resolveToolPath({ target: outputPath })
        const absOutput = resolved.absPath
        await fs.mkdir(path.dirname(absOutput), { recursive: true })

        const effectiveFormat = audioFormat || 'mp3'
        const cmd = ffmpeg(absInput)
          .noVideo()
          .audioCodec(getAudioCodec(effectiveFormat))
          .format(getOutputFormat(effectiveFormat))
          .output(absOutput)

        await runFfmpeg(cmd)

        const info = await probeFile(absOutput)
        const stat = await fs.stat(absOutput)

        return {
          ok: true,
          data: {
            action: 'extract-audio',
            outputPath: absOutput,
            format: effectiveFormat,
            duration: info.format.duration,
            fileSize: stat.size,
          },
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  },
})

function getAudioCodec(format: string): string {
  switch (format) {
    case 'mp3': return 'libmp3lame'
    case 'aac': return 'aac'
    case 'wav': return 'pcm_s16le'
    case 'flac': return 'flac'
    case 'ogg': return 'libvorbis'
    default: return 'copy'
  }
}

/** Map user-facing audio format name to FFmpeg output format. */
function getOutputFormat(format: string): string {
  if (format === 'aac') return 'adts'
  return format
}
