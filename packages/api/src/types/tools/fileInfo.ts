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
  name: '文件信息',
  description:
    '触发：当用户需要查看文件的元信息时调用——获取文件大小、MIME 类型、修改时间等基本信息，以及根据文件类型返回的专属元数据。' +
    '典型场景："查看这个文件的信息"、"这张图片的分辨率是多少"、"这个视频多长时间"、"这个 PDF 有几页"、"这个 Excel 有几个 sheet"。' +
    '自动检测文件类型（基于扩展名）并委托给对应引擎：' +
    '图片（jpg/png/webp/avif/tiff/gif/bmp/svg/heif/heic）→ 返回 width, height, format, colorSpace, channels, hasAlpha, density；' +
    '视频/音频（mp4/avi/mkv/mov/webm/flv/wmv/m4v/mp3/wav/aac/flac/ogg）→ 返回 duration, resolution, codecs, streams（需系统安装 FFmpeg）；' +
    'PDF（pdf）→ 返回 pageCount, hasForm, formFieldCount, metadata（title/author/subject 等）；' +
    '电子表格（xlsx/xls/csv）→ 返回 sheetCount, sheets（名称/行列数）；' +
    '其他文件类型 → 仅返回基本信息。' +
    '通用基本信息：fileName, fileSize（字节），mimeType, createdAt, modifiedAt。' +
    '返回：{ ok, data: { fileType, base: {...}, details: {...} } }。' +
    '展示文件大小时，务必将字节转换为人类可读单位（KB/MB/GB），不要直接输出字节数。' +
    '不适用：需要读取文件内容时不要使用，改用 read-file 或对应的 query 工具。',
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe('文件路径（相对于项目根目录、全局根目录或绝对路径）'),
  }),
  needsApproval: false,
  component: null,
} as const
