/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from 'zod'

export const imageGenerateToolDef = {
  id: 'image-generate',
  name: '图片生成',
  description:
    '触发：当用户明确要求生成图片、画图、创建插画、设计海报等视觉内容时调用。用途：通过云端 AI 模型生成图片。将用户描述转化为详细的英文提示词传入 prompt 参数。返回：{ success: true, urls: [...] } 或抛出错误。不适用：用户只是讨论图片、分析已有图片、或未明确要求生成时不要调用。',
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
  }),
  component: null,
} as const

export const videoGenerateToolDef = {
  id: 'video-generate',
  name: '视频生成',
  description:
    '触发：当用户明确要求生成视频、创建动画、制作短片时调用。用途：通过云端 AI 模型生成视频。将用户描述转化为详细的英文提示词传入 prompt 参数。返回：{ success: true, urls: [...] } 或抛出错误。不适用：用户只是讨论视频、分析已有视频、或未明确要求生成时不要调用。',
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
  }),
  component: null,
} as const
