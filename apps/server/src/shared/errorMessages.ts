/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Multilingual error messages for tRPC routes.
 * Each error has translations for zh-CN, zh-TW, and en-US.
 */
export const ERROR_MESSAGES = {
  // Workspace errors
  WORKSPACE_DUPLICATE: {
    'zh-CN': '工作空间保存目录不能重复，请选择其他文件夹。',
    'zh-TW': '工作空間儲存目錄不能重複，請選擇其他資料夾。',
    'en-US': 'Workspace directory is already in use. Please select a different folder.',
  },
  WORKSPACE_NOT_FOUND: {
    'zh-CN': '工作空间不存在',
    'zh-TW': '工作空間不存在',
    'en-US': 'Workspace not found',
  },
  WORKSPACE_MIN_REQUIRED: {
    'zh-CN': '至少需要保留一个工作空间',
    'zh-TW': '至少需要保留一個工作空間',
    'en-US': 'At least one workspace must be retained',
  },
  ACTIVE_WORKSPACE_NOT_FOUND: {
    'zh-CN': '活跃工作空间不存在',
    'zh-TW': '活躍工作空間不存在',
    'en-US': 'Active workspace not found',
  },

  // Project errors
  PROJECT_NOT_FOUND: {
    'zh-CN': '项目不存在',
    'zh-TW': '專案不存在',
    'en-US': 'Project not found',
  },

  // Chat errors
  CHAT_SESSION_NOT_FOUND: {
    'zh-CN': '聊天会话不存在',
    'zh-TW': '聊天會話不存在',
    'en-US': 'Chat session not found',
  },

  // Skill errors
  INVALID_SKILL_PATH: {
    'zh-CN': '无效的技能路径',
    'zh-TW': '無效的技能路徑',
    'en-US': 'Invalid skill path',
  },
  SKILL_PATH_OUT_OF_SCOPE: {
    'zh-CN': '技能路径超出范围',
    'zh-TW': '技能路徑超出範圍',
    'en-US': 'Skill path is outside scope',
  },
  GLOBAL_SKILLS_CANNOT_DELETE: {
    'zh-CN': '全局技能不能从设置中删除',
    'zh-TW': '全域技能不能從設定中刪除',
    'en-US': 'Global skills cannot be deleted from settings',
  },
  WORKSPACE_SKILLS_CANNOT_DELETE_HERE: {
    'zh-CN': '工作空间技能不能在此删除',
    'zh-TW': '工作空間技能不能在此刪除',
    'en-US': 'Workspace skills cannot be deleted here',
  },
  PROJECT_SKILLS_CANNOT_DELETE_HERE: {
    'zh-CN': '项目技能不能在此删除',
    'zh-TW': '專案技能不能在此刪除',
    'en-US': 'Parent project skills cannot be deleted here',
  },

  // Agent errors
  INVALID_AGENT_PATH: {
    'zh-CN': '无效的智能体路径',
    'zh-TW': '無效的智能體路徑',
    'en-US': 'Invalid agent path',
  },
  AGENT_PATH_OUT_OF_SCOPE: {
    'zh-CN': '智能体路径超出范围',
    'zh-TW': '智能體路徑超出範圍',
    'en-US': 'Agent path is outside scope',
  },
  SYSTEM_AGENTS_CANNOT_DELETE: {
    'zh-CN': '系统智能体不能被删除',
    'zh-TW': '系統智能體不能被刪除',
    'en-US': 'System agents cannot be deleted',
  },
  GLOBAL_AGENTS_CANNOT_DELETE: {
    'zh-CN': '全局智能体不能从设置中删除',
    'zh-TW': '全域智能體不能從設定中刪除',
    'en-US': 'Global agents cannot be deleted from settings',
  },
  WORKSPACE_AGENTS_CANNOT_DELETE_HERE: {
    'zh-CN': '工作空间智能体不能在此删除',
    'zh-TW': '工作空間智能體不能在此刪除',
    'en-US': 'Workspace agents cannot be deleted here',
  },
  PROJECT_AGENTS_CANNOT_DELETE_HERE: {
    'zh-CN': '项目智能体不能在此删除',
    'zh-TW': '專案智能體不能在此刪除',
    'en-US': 'Parent project agents cannot be deleted here',
  },
  AGENT_NOT_FOUND: {
    'zh-CN': '智能体不存在',
    'zh-TW': '智能體不存在',
    'en-US': 'Agent not found',
  },

  // Validation errors
  IGNORE_KEY_REQUIRED: {
    'zh-CN': '忽略键是必需的',
    'zh-TW': '忽略鍵是必需的',
    'en-US': 'Ignore key is required',
  },
  PROJECT_ID_REQUIRED: {
    'zh-CN': '项目 ID 是必需的',
    'zh-TW': '專案 ID 是必需的',
    'en-US': 'Project ID is required',
  },
  INVALID_SOURCE_AGENT_PATH: {
    'zh-CN': '无效的源智能体路径',
    'zh-TW': '無效的源智能體路徑',
    'en-US': 'Invalid source agent path',
  },
  NO_WORKSPACE_ROOT: {
    'zh-CN': '工作空间根目录不存在',
    'zh-TW': '工作空間根目錄不存在',
    'en-US': 'No workspace root',
  },

  // Email errors
  MAILBOX_SCOPE_REQUIRES_EMAIL_AND_MAILBOX: {
    'zh-CN': '邮箱范围需要账号邮箱和邮箱名称',
    'zh-TW': '信箱範圍需要帳號信箱和信箱名稱',
    'en-US': 'Mailbox scope requires accountEmail and mailbox',
  },
  EMAIL_NOT_FOUND: {
    'zh-CN': '邮件不存在',
    'zh-TW': '郵件不存在',
    'en-US': 'Email not found',
  },
  ACCOUNT_NOT_FOUND: {
    'zh-CN': '账号未找到',
    'zh-TW': '帳號未找到',
    'en-US': 'Account not found',
  },
  ADAPTER_DOES_NOT_SUPPORT_MOVE: {
    'zh-CN': '当前适配器不支持移动邮件',
    'zh-TW': '目前的適配器不支援移動郵件',
    'en-US': 'Current adapter does not support moving emails',
  },
  DRAFT_NOT_FOUND: {
    'zh-CN': '草稿未找到',
    'zh-TW': '草稿未找到',
    'en-US': 'Draft not found',
  },

  // Generic errors
  OPERATION_FAILED: {
    'zh-CN': '操作失败',
    'zh-TW': '操作失敗',
    'en-US': 'Operation failed',
  },
  INVALID_INPUT: {
    'zh-CN': '输入无效',
    'zh-TW': '輸入無效',
    'en-US': 'Invalid input',
  },
} as const;

/**
 * Get error message in specified language with fallback to en-US.
 */
export function getErrorMessage(
  errorKey: keyof typeof ERROR_MESSAGES,
  lang: string = 'en-US',
): string {
  const messages = ERROR_MESSAGES[errorKey];

  // Try exact match first
  if (lang in messages) {
    return messages[lang as keyof typeof messages];
  }

  // Try language family match (e.g., zh-TW -> zh-CN)
  if (lang.startsWith('zh')) {
    return messages['zh-CN' as keyof typeof messages];
  }

  // Fallback to en-US
  return messages['en-US' as keyof typeof messages];
}

/**
 * Template function for error messages with variables.
 * Example: getErrorMessageTemplate('AGENT_NOT_FOUND_AT', { agentPath: '/path/to/agent' }, 'en-US')
 */
export function getErrorMessageTemplate(
  template: string,
  variables: Record<string, string>,
  lang: string = 'en-US',
): string {
  let message = template;
  Object.entries(variables).forEach(([key, value]) => {
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });
  return message;
}
