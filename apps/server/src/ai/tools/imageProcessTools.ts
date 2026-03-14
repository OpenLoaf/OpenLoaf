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
 * Image Process Tool — sharp 封装，提供图片处理与格式转换能力。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { tool, zodSchema } from 'ai'
import { imageProcessToolDef } from '@openloaf/api/types/tools/imageProcess'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'

const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.tif',
  '.gif', '.bmp', '.svg', '.heif', '.heic',
]

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  }
}

export const imageProcessTool = tool({
  description: imageProcessToolDef.description,
  inputSchema: zodSchema(imageProcessToolDef.parameters),
  execute: async (input) => {
    const {
      action, filePath, outputPath, overwrite,
      width, height, fit,
      left, top, cropWidth, cropHeight,
      angle, direction, sigma, tintColor,
      format, quality,
    } = input as {
      action: string
      filePath: string
      outputPath?: string
      overwrite?: boolean
      width?: number
      height?: number
      fit?: string
      left?: number
      top?: number
      cropWidth?: number
      cropHeight?: number
      angle?: number
      direction?: string
      sigma?: number
      tintColor?: string
      format?: string
      quality?: number
    }

    const absInput = await resolveOfficeFile(filePath, IMAGE_EXTENSIONS)
    let pipeline = sharp(absInput)

    switch (action) {
      case 'get-info': {
        const meta = await sharp(absInput).metadata()
        const stat = await fs.stat(absInput)
        return {
          ok: true,
          data: {
            action: 'get-info',
            width: meta.width,
            height: meta.height,
            format: meta.format,
            colorSpace: meta.space,
            channels: meta.channels,
            depth: meta.depth,
            hasAlpha: meta.hasAlpha,
            density: meta.density,
            isAnimated: meta.pages ? meta.pages > 1 : false,
            fileSize: stat.size,
          },
        }
      }
      case 'resize': {
        if (!width && !height) throw new Error('resize requires at least width or height.')
        pipeline = pipeline.resize({
          width,
          height,
          fit: (fit as any) || 'cover',
        })
        break
      }
      case 'crop': {
        if (left == null || top == null || !cropWidth || !cropHeight) {
          throw new Error('crop requires left, top, cropWidth and cropHeight.')
        }
        pipeline = pipeline.extract({ left, top, width: cropWidth, height: cropHeight })
        break
      }
      case 'rotate': {
        pipeline = pipeline.rotate(angle ?? 90)
        break
      }
      case 'flip': {
        if (direction === 'horizontal') {
          pipeline = pipeline.flop()
        } else {
          pipeline = pipeline.flip()
        }
        break
      }
      case 'grayscale': {
        pipeline = pipeline.grayscale()
        break
      }
      case 'blur': {
        pipeline = pipeline.blur(sigma ?? 3)
        break
      }
      case 'sharpen': {
        pipeline = pipeline.sharpen()
        break
      }
      case 'tint': {
        if (!tintColor) throw new Error('tint requires tintColor (hex).')
        const color = parseHexColor(tintColor)
        pipeline = pipeline.tint(color)
        break
      }
      case 'convert': {
        if (!format) throw new Error('convert requires format.')
        if (!outputPath) throw new Error('convert requires outputPath.')
        pipeline = pipeline.toFormat(format as any, {
          quality: quality ?? 80,
        })
        break
      }
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    // Resolve output path
    let absOutput: string
    if (outputPath) {
      const resolved = resolveToolPath({ target: outputPath })
      absOutput = resolved.absPath
    } else if (overwrite) {
      absOutput = absInput
    } else {
      // 自动添加操作后缀，避免覆盖源文件。
      const parsed = path.parse(absInput)
      absOutput = path.join(parsed.dir, `${parsed.name}_${action}${parsed.ext}`)
    }

    // Ensure output directory exists
    await fs.mkdir(path.dirname(absOutput), { recursive: true })

    // Write result
    const outputBuffer = await pipeline.toBuffer()
    await fs.writeFile(absOutput, outputBuffer)

    // Get metadata of the result
    const meta = await sharp(absOutput).metadata()
    const stat = await fs.stat(absOutput)

    return {
      ok: true,
      data: {
        action,
        outputPath: absOutput,
        width: meta.width,
        height: meta.height,
        format: meta.format,
        fileSize: stat.size,
      },
    }
  },
})
