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
 * File Info Tool — 统一文件元数据查询，根据文件类型自动委托给 sharp/ffprobe/pdf-lib/xlsx。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { fileInfoToolDef } from '@openloaf/api/types/tools/fileInfo'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { isFfprobeAvailable } from '@/common/ffmpegPaths'

// ---------------------------------------------------------------------------
// MIME type mapping (extension-based, no magic bytes needed)
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  // image
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.tiff': 'image/tiff', '.tif': 'image/tiff',
  '.avif': 'image/avif', '.heif': 'image/heif', '.heic': 'image/heic',
  '.ico': 'image/x-icon',
  // video
  '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv', '.m4v': 'video/x-m4v',
  // audio
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  // document
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  // spreadsheet
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  // text
  '.txt': 'text/plain', '.md': 'text/markdown', '.html': 'text/html',
  '.htm': 'text/html', '.json': 'application/json', '.xml': 'application/xml',
  '.yaml': 'text/yaml', '.yml': 'text/yaml',
  // code
  '.js': 'text/javascript', '.ts': 'text/typescript', '.jsx': 'text/jsx',
  '.tsx': 'text/tsx', '.css': 'text/css', '.py': 'text/x-python',
  // archive
  '.zip': 'application/zip', '.tar': 'application/x-tar',
  '.gz': 'application/gzip', '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
}

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.tif',
  '.gif', '.bmp', '.svg', '.heif', '.heic', '.ico',
])
const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mkv', '.mov', '.webm', '.flv', '.wmv', '.m4v'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma'])
const PDF_EXTS = new Set(['.pdf'])
const SPREADSHEET_EXTS = new Set(['.xlsx', '.xls', '.csv'])
const DOC_EXTS = new Set(['.docx', '.doc'])

type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'spreadsheet' | 'document' | 'other'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function detectFileType(ext: string): FileType {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (PDF_EXTS.has(ext)) return 'pdf'
  if (SPREADSHEET_EXTS.has(ext)) return 'spreadsheet'
  if (DOC_EXTS.has(ext)) return 'document'
  return 'other'
}

// ---------------------------------------------------------------------------
// ffprobe helper
// ---------------------------------------------------------------------------


function probeFile(absPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    import('fluent-ffmpeg').then((mod) => {
      const ffmpeg = mod.default
      ffmpeg.ffprobe(absPath, (err: any, data: any) => {
        if (err) reject(err)
        else resolve(data)
      })
    }).catch(reject)
  })
}

// ---------------------------------------------------------------------------
// Spreadsheet range parser
// ---------------------------------------------------------------------------

function parseRangeRowCol(range: string): { rows: number; cols: number } {
  if (!range) return { rows: 0, cols: 0 }
  // e.g. "A1:C10" → cols=3, rows=10
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
  if (!match) return { rows: 0, cols: 0 }
  const colStart = colLetterToNumber(match[1]!)
  const rowStart = Number.parseInt(match[2]!, 10)
  const colEnd = colLetterToNumber(match[3]!)
  const rowEnd = Number.parseInt(match[4]!, 10)
  return { rows: rowEnd - rowStart + 1, cols: colEnd - colStart + 1 }
}

function colLetterToNumber(letters: string): number {
  let num = 0
  for (let i = 0; i < letters.length; i++) {
    num = num * 26 + (letters.charCodeAt(i) - 64)
  }
  return num
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const fileInfoTool = tool({
  description: fileInfoToolDef.description,
  inputSchema: zodSchema(fileInfoToolDef.parameters),
  execute: async (input) => {
    const { filePath } = input as { filePath: string }
    const { absPath } = resolveToolPath({ target: filePath })
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) throw new Error('Path is not a file.')

    const ext = path.extname(absPath).toLowerCase()
    const fileType = detectFileType(ext)

    const base = {
      fileName: path.basename(absPath),
      filePath: absPath,
      fileSize: stat.size,
      formattedSize: formatFileSize(stat.size),
      mimeType: MIME_MAP[ext] ?? 'application/octet-stream',
      extension: ext,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
    }

    let details: Record<string, unknown> = {}

    try {
      switch (fileType) {
        case 'image': {
          const sharp = (await import('sharp')).default
          const meta = await sharp(absPath).metadata()
          details = {
            width: meta.width,
            height: meta.height,
            format: meta.format,
            colorSpace: meta.space,
            channels: meta.channels,
            depth: meta.depth,
            hasAlpha: meta.hasAlpha,
            density: meta.density,
            isAnimated: meta.pages ? meta.pages > 1 : false,
          }
          break
        }

        case 'video':
        case 'audio': {
          if (!isFfprobeAvailable()) {
            details = { error: '系统未安装 FFmpeg/ffprobe，无法读取媒体文件详细信息。macOS: brew install ffmpeg' }
            break
          }
          const info = await probeFile(absPath)
          const videoStream = info.streams.find((s: any) => s.codec_type === 'video')
          const audioStream = info.streams.find((s: any) => s.codec_type === 'audio')
          details = {
            duration: info.format.duration,
            resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
            codecs: {
              video: videoStream?.codec_name ?? null,
              audio: audioStream?.codec_name ?? null,
            },
            bitRate: info.format.bit_rate ? Number(info.format.bit_rate) : undefined,
            streams: info.streams.map((s: any) => ({
              type: s.codec_type,
              codec: s.codec_name,
              width: s.width,
              height: s.height,
              sampleRate: s.sample_rate,
              channels: s.channels,
            })),
          }
          break
        }

        case 'pdf': {
          const { parsePdfStructure } = await import('@/ai/tools/office/pdfEngine')
          const pdfInfo = await parsePdfStructure(absPath)
          details = pdfInfo
          break
        }

        case 'spreadsheet': {
          if (ext === '.csv') {
            const content = await fs.readFile(absPath, 'utf-8')
            const lines = content.split('\n').filter(Boolean)
            const firstLine = lines[0] ?? ''
            details = {
              sheetCount: 1,
              sheets: [{
                name: 'Sheet1',
                index: 0,
                rowCount: lines.length,
                colCount: firstLine.split(',').length,
              }],
            }
          } else {
            const xlsxMod = await import('xlsx')
            const XLSX = (xlsxMod as any).default || xlsxMod
            const workbook = XLSX.readFile(absPath)
            details = {
              sheetCount: workbook.SheetNames.length,
              sheets: workbook.SheetNames.map((name: string, i: number) => {
                const sheet = workbook.Sheets[name]
                const range = sheet?.['!ref'] ?? ''
                const { rows, cols } = parseRangeRowCol(range)
                return { name, index: i, rowCount: rows, colCount: cols, range }
              }),
            }
          }
          break
        }

        case 'document': {
          details = { hint: '使用 WordQuery 工具获取文档详细内容。' }
          break
        }

        default:
          break
      }
    } catch (err: any) {
      details = { error: err.message ?? '无法读取文件类型专属元数据。' }
    }

    return { ok: true, data: { fileType, base, details } }
  },
})
