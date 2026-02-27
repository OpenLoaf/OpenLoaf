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

export const listMediaModelsToolDef = {
  id: 'list-media-models',
  name: '查询可用媒体模型',
  description:
    '查询当前可用的图片或视频生成模型列表。返回每个模型的 id、name、tags 和关键能力。' +
    '请根据 tags 选择合适模型：' +
    'image_generation = 从文字生成新图片；' +
    'image_edit = 编辑/修改已有图片（如换风格、局部修改）；' +
    'image_multi_input = 支持多张参考图输入；' +
    'video_generation = 从文字生成视频；' +
    'image_analysis = 图片理解/分析（如素材提取、图像翻译）；' +
    'video_analysis = 视频理解/分析。' +
    '关键能力字段：supportsMask = 支持蒙版编辑；maxImages = 最多输入图片数；supportsMulti = 支持一次生成多张。' +
    '建议：在调用 image-generate 或 video-generate 之前先调用此工具，了解可用模型后通过 modelId 参数指定。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：查询可用图片生成模型。'),
    kind: z
      .enum(['image', 'video'])
      .describe('查询类型：image = 图片模型，video = 视频模型。'),
  }),
  component: null,
} as const

export const imageGenerateToolDef = {
  id: 'image-generate',
  name: '图片生成',
  description:
    '触发：当用户明确要求生成图片、画图、创建插画、设计海报等视觉内容时调用。用途：通过云端 AI 模型生成图片。将用户描述转化为详细的英文提示词传入 prompt 参数。返回：{ success: true, urls: [...] } 或抛出错误。不适用：用户只是讨论图片、分析已有图片、或未明确要求生成时不要调用。建议先调用 list-media-models 查看可用模型，然后通过 modelId 指定最合适的模型。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：生成日落海滩图片。'),
    prompt: z
      .string()
      .min(1)
      .describe(
        '图片生成提示词（英文），应详细描述画面内容、风格、光线、构图等。将用户的中文描述翻译并扩展为高质量英文提示词。',
      ),
    negativePrompt: z
      .string()
      .optional()
      .describe('负面提示词（英文），描述不希望出现的元素。'),
    aspectRatio: z
      .string()
      .optional()
      .describe('图片宽高比，如 "1:1"、"16:9"、"9:16"、"4:3"、"3:4"。默认 "1:1"。'),
    count: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe('生成图片数量，1-4 张，默认 1。'),
    fileName: z
      .string()
      .max(100)
      .regex(/^[^/\\:*?"<>|]+$/, '文件名不能包含 / \\ : * ? " < > | 等特殊字符')
      .optional()
      .describe(
        '保存文件名（不含扩展名）。如果生成多张图片，会自动添加 _1、_2 后缀。不提供则自动生成。',
      ),
    modelId: z
      .string()
      .optional()
      .describe('指定使用的模型 ID。建议先调用 list-media-models 获取可用模型列表。'),
  }),
  component: null,
} as const

export const videoGenerateToolDef = {
  id: 'video-generate',
  name: '视频生成',
  description:
    '触发：当用户明确要求生成视频、创建动画、制作短片时调用。用途：通过云端 AI 模型生成视频。将用户描述转化为详细的英文提示词传入 prompt 参数。返回：{ success: true, urls: [...] } 或抛出错误。不适用：用户只是讨论视频、分析已有视频、或未明确要求生成时不要调用。建议先调用 list-media-models 查看可用模型，然后通过 modelId 指定最合适的模型。',
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：生成产品展示视频。'),
    prompt: z
      .string()
      .min(1)
      .describe(
        '视频生成提示词（英文），应详细描述画面内容、运动、风格等。将用户的中文描述翻译并扩展为高质量英文提示词。',
      ),
    aspectRatio: z
      .string()
      .optional()
      .describe('视频宽高比，如 "16:9"、"9:16"、"1:1"。默认 "16:9"。'),
    duration: z
      .number()
      .optional()
      .describe('视频时长（秒），默认由模型决定。'),
    fileName: z
      .string()
      .max(100)
      .regex(/^[^/\\:*?"<>|]+$/, '文件名不能包含 / \\ : * ? " < > | 等特殊字符')
      .optional()
      .describe(
        '保存文件名（不含扩展名）。如果生成多个视频，会自动添加 _1、_2 后缀。不提供则自动生成。',
      ),
    modelId: z
      .string()
      .optional()
      .describe('指定使用的模型 ID。建议先调用 list-media-models 获取可用模型列表。'),
  }),
  component: null,
} as const
