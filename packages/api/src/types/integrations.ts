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
  brandColor: z.string().optional(),
  /**
   * Raw SVG path `d` attribute (rendered inside `<svg viewBox="0 0 24 24">`).
   * When present, rendered as a monochrome brand glyph driven by `currentColor`.
   */
  iconSvgPath: z.string().optional(),
  homepage: z.string().optional(),
  guide: z.array(integrationGuideStepSchema),
  credentials: z.array(credentialFieldSchema),
  installed: z.boolean().default(false),
  mcpServerId: z.string().optional(),
})
export type IntegrationDefinition = z.infer<typeof integrationDefinitionSchema>
