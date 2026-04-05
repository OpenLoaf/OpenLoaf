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
  id: 'ImageProcess',
  readonly: false,
  name: '图片处理',
  description:
    'Processes an existing image: get-info / resize / crop / rotate / flip / grayscale / blur / sharpen / tint / convert (format). ' +
    'Input formats: jpeg/png/webp/avif/tiff/gif/bmp/svg/heif. Output formats (for convert): jpeg/png/webp/avif/tiff/gif. ' +
    'Per-action required params are defined in each parameter\'s describe() — check there for specifics. ' +
    'Limits: gif only processes first frame; svg input-only (cannot output svg); png→jpeg makes transparent areas white. ' +
    'If outputPath is omitted, writes to `<source>_<action>.<ext>` (does not overwrite); set overwrite=true to replace source. ' +
    'Do NOT use for generating new images from scratch — use the canvas v3 media generation flow instead.',
  parameters: z.object({
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
