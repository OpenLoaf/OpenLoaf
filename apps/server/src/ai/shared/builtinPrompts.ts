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

import IDENTITY_TEMPLATE_RAW from '@/ai/shared/templates/IDENTITY.md'
import SOUL_TEMPLATE_RAW from '@/ai/shared/templates/SOUL.md'
import AGENT_TEMPLATE_RAW from '@/ai/shared/templates/AGENT.md'

/** 身份声明（IDENTITY）。 */
export const BUILTIN_IDENTITY_PROMPT = IDENTITY_TEMPLATE_RAW.trim()

/** 行为准则（SOUL）— behavior + tools + output + skills。 */
export const BUILTIN_SOUL_PROMPT = SOUL_TEMPLATE_RAW.trim()

/** 主提示词（AGENT）— execution + delegation + planning。 */
export const BUILTIN_AGENT_PROMPT = AGENT_TEMPLATE_RAW.trim()
