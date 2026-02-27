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
 * Agent 模版模块统一导出。
 */

export type { AgentTemplate, AgentTemplateId } from './types'
export {
  ALL_TEMPLATES,
  getTemplate,
  isTemplateId,
  getPrimaryTemplate,
  getScaffoldableTemplates,
} from './registry'
