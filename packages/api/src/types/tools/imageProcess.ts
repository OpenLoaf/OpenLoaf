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

export const imageProcessToolDef = {
  id: 'image-process',
  name: '图片处理',
  description:
    '触发：当用户需要对已有图片进行处理时调用——调整大小、裁剪、旋转、翻转、灰度化、模糊、锐化、着色或格式转换。' +
    '典型场景："查看这张图片的尺寸"、"把这张图缩小到 800x600"、"把 PNG 转成 WebP"、"把照片旋转 90 度"、"裁剪图片左上角 200x200 区域"、"给图片加模糊效果"。' +
    '支持的输入格式：jpeg/jpg, png, webp, avif, tiff, gif, bmp, svg, heif/heic（iPhone 照片）。' +
    '支持的输出格式（convert action）：jpeg, png, webp, avif, tiff, gif。' +
    'action 说明与必填参数：' +
    'get-info — 无额外必填参数，返回 { width, height, format, colorSpace, channels, depth, hasAlpha, density, isAnimated, fileSize }；' +
    'resize — 需 width 和/或 height（至少一个），可选 fit（cover/contain/fill/inside/outside）；' +
    'crop — 需 left, top, cropWidth, cropHeight 四个参数；' +
    'rotate — 可选 angle（默认 90 度顺时针）；' +
    'flip — 可选 direction（horizontal/vertical，默认 vertical）；' +
    'grayscale — 无额外参数；' +
    'blur — 可选 sigma（0.3-100，默认 3）；' +
    'sharpen — 无额外参数；' +
    'tint — 需 tintColor（十六进制如 "#FF6600"）；' +
    'convert — 需 format（jpeg/png/webp/avif/tiff/gif）和 outputPath，可选 quality（1-100，默认 80）。' +
    '限制：gif 仅处理第一帧；svg 仅支持作为输入（可转 png/jpg 等），不支持输出为 svg；png 转 jpeg 时透明区域会变白底。' +
    '输出：未指定 outputPath 时自动在源文件名后添加操作后缀（如 photo_resize.png），不会覆盖原图；设置 overwrite=true 可覆盖源文件。' +
    '返回：{ ok, data: { action, outputPath, width, height, format, fileSize } }。' +
    '不适用：需要 AI 生成全新图片时不要使用，改用 image-generate。',
  parameters: z.object({
    actionName: z
      .string()
      .optional()
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：将图片转换为 WebP 格式。'),
    action: z
      .enum(['get-info', 'resize', 'crop', 'rotate', 'flip', 'grayscale', 'blur', 'sharpen', 'tint', 'convert'])
      .describe(
        '操作类型：get-info 获取图片元数据（宽高/格式/色彩空间/DPI 等），resize 调整大小，crop 裁剪，rotate 旋转，flip 翻转，grayscale 灰度化，blur 模糊，sharpen 锐化，tint 着色，convert 格式转换',
      ),
    filePath: z
      .string()
      .min(1)
      .describe('源图片文件路径（相对于项目根目录、全局根目录或绝对路径）'),
    outputPath: z
      .string()
      .optional()
      .describe('输出文件路径。不指定则自动在源文件名后添加操作后缀（如 photo_resize.png）；convert 时必填。'),
    overwrite: z
      .boolean()
      .optional()
      .describe('为 true 时直接覆盖源文件而不生成新文件。默认 false。'),
    // resize (transform abs for robustness — some models send negative values)
    width: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('resize 时的目标宽度（像素）'),
    height: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('resize 时的目标高度（像素）'),
    fit: z
      .enum(['cover', 'contain', 'fill', 'inside', 'outside'])
      .optional()
      .describe('resize 时的缩放模式，默认 cover'),
    // crop
    left: z.coerce.number().int().min(0).optional().describe('crop 时的左偏移（像素）'),
    top: z.coerce.number().int().min(0).optional().describe('crop 时的上偏移（像素）'),
    cropWidth: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('crop 时的裁剪宽度（像素）'),
    cropHeight: z.coerce.number().int().transform(Math.abs).pipe(z.number().positive()).optional().describe('crop 时的裁剪高度（像素）'),
    // rotate
    angle: z.coerce.number().optional().describe('rotate 时的旋转角度（度，顺时针）'),
    // flip
    direction: z
      .enum(['horizontal', 'vertical'])
      .optional()
      .describe('flip 时的翻转方向'),
    // blur
    sigma: z
      .coerce.number()
      .min(0.3)
      .max(100)
      .optional()
      .describe('blur 时的模糊程度（0.3-100）'),
    // tint
    tintColor: z
      .string()
      .optional()
      .describe('tint 时的着色颜色（十六进制如 "#FF6600"）'),
    // convert
    format: z
      .enum(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'])
      .optional()
      .describe('convert 时的目标格式'),
    quality: z
      .coerce.number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('convert 时的压缩质量（1-100），默认 80'),
  }),
  needsApproval: true,
  component: null,
} as const
