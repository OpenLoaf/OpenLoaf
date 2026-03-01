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
import WIDGET_PROMPT_ZH from './prompt.zh.md'
import WIDGET_PROMPT_EN from './prompt.en.md'

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
  systemPrompt: WIDGET_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getWidgetPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return WIDGET_PROMPT_EN.trim()
  }
  return WIDGET_PROMPT_ZH.trim()
}
