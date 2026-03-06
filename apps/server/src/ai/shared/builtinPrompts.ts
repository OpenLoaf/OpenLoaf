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
 * 内置默认 prompt 常量。
 * 从模板文件导入，作为无自定义文件时的回退值。
 */

import PROMPT_TEMPLATE_RAW from '@/ai/shared/templates/prompt.md'

/** 主提示词 — execution + delegation + planning。 */
export const BUILTIN_AGENT_PROMPT = PROMPT_TEMPLATE_RAW.trim()
