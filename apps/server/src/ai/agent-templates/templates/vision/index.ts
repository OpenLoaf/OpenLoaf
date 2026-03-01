/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AgentTemplate } from '../../types'
import VISION_PROMPT_ZH from './prompt.zh.md'
import VISION_PROMPT_EN from './prompt.en.md'

export const visionTemplate: AgentTemplate = {
  id: 'vision',
  name: '视觉分析',
  description: '图片/视频理解与描述生成',
  icon: 'eye',
  toolIds: [],
  allowSubAgents: false,
  maxDepth: 0,
  isPrimary: false,
  systemPrompt: VISION_PROMPT_ZH.trim(),
  isBuiltinOnly: true,
}

/** Get prompt in specified language. */
export function getVisionPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return VISION_PROMPT_EN.trim()
  }
  return VISION_PROMPT_ZH.trim()
}
