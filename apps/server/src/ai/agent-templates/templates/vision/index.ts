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
import VISION_PROMPT from './prompt.zh.md'

export const visionTemplate: AgentTemplate = {
  id: 'vision',
  name: '视觉分析',
  description: '图片/视频理解与描述生成',
  icon: 'eye',
  toolIds: [],
  allowSubAgents: false,
  maxDepth: 0,
  isPrimary: false,
  systemPrompt: VISION_PROMPT.trim(),
  isBuiltinOnly: true,
}
