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
  /** 触发描述（默认中文，作为兜底） */
  description: string
  /** English trigger description (from `en/SKILL.md`; falls back to `description` when absent). */
  descriptionEn?: string
  /** SKILL.md 正文（不含 frontmatter；默认中文） */
  content: string
  /** English SKILL.md body (from `en/SKILL.md`; falls back to `content` when absent). */
  contentEn?: string
  /** Emoji 图标 */
  icon?: string
  /** colorIndex 0-7 */
  colorIndex?: number
}
