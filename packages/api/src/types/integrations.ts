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

// ---------------------------------------------------------------------------
// Integration Definition Types (shared between server & web)
// ---------------------------------------------------------------------------

export const integrationCategorySchema = z.enum([
  'productivity',
  'communication',
  'storage',
  'dev',
  'ai',
])
export type IntegrationCategory = z.infer<typeof integrationCategorySchema>

export const integrationAuthTypeSchema = z.enum(['credentials', 'oauth'])
export type IntegrationAuthType = z.infer<typeof integrationAuthTypeSchema>

export const credentialFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'url']),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  required: z.boolean().default(true),
})
export type CredentialField = z.infer<typeof credentialFieldSchema>

export const integrationGuideStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  link: z
    .object({
      href: z.string(),
      label: z.string(),
    })
    .optional(),
})
export type IntegrationGuideStep = z.infer<typeof integrationGuideStepSchema>

export const integrationDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: integrationCategorySchema,
  authType: integrationAuthTypeSchema.default('credentials'),
  brandColor: z.string().optional(),
  iconSvgPath: z.string().optional(),
  iconUrl: z.string().optional(),
  homepage: z.string().optional(),
  guide: z.array(integrationGuideStepSchema),
  credentials: z.array(credentialFieldSchema),
  installed: z.boolean().default(false),
  mcpServerId: z.string().optional(),
  /**
   * 连接成功后自动调用的探测工具，用于展示"基本信息"。
   * 格式：{ toolName, args, label }
   * - toolName: MCP 工具名（不含 mcp__server__ 前缀）
   * - args: 传给工具的参数
   * - label: UI 展示时的标题（如"搜索结果"）
   */
  probeTool: z.object({
    toolName: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
    label: z.string(),
  }).optional(),
})
export type IntegrationDefinition = z.infer<typeof integrationDefinitionSchema>
