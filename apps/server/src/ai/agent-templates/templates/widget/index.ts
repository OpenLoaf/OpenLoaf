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
import WIDGET_PROMPT from './prompt.zh.md'

export const widgetTemplate: AgentTemplate = {
  id: 'widget',
  name: '工作台组件助手',
  description: '动态 Widget 创建',
  icon: 'layout-grid',
  toolIds: [
    'generate-widget',
    'widget-init',
    'widget-list',
    'widget-get',
    'widget-check',
  ],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: WIDGET_PROMPT.trim(),
}
