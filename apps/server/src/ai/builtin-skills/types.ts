/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export type BuiltinSkill = {
  /** kebab-case 名称（与目录名一致） */
  name: string
  /** 触发描述 */
  description: string
  /** SKILL.md 内容（不含 frontmatter） */
  content: string
  /** Emoji 图标 */
  icon?: string
  /** colorIndex 0-7 */
  colorIndex?: number
  /** 技能依赖的工具 ID 列表（加载技能时自动激活） */
  tools?: string[]
}
