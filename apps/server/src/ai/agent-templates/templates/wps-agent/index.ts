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
import WPS_PROMPT_ZH from './prompt.zh.md'
import WPS_PROMPT_EN from './prompt.en.md'

export const wpsAgentTemplate: AgentTemplate = {
  id: 'wps-agent',
  name: 'WPS 文档助手',
  description: '通过 WPS 插件操作 Word 文档：读写、格式化、查找替换、表格、批注等',
  icon: 'file-text',
  toolIds: [
    'office-execute',
    'time-now',
    'request-user-input',
  ],
  allowSubAgents: false,
  maxDepth: 0,
  isPrimary: false,
  systemPrompt: WPS_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getWpsAgentPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return WPS_PROMPT_EN.trim()
  }
  return WPS_PROMPT_ZH.trim()
}
