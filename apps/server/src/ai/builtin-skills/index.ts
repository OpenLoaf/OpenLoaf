/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { BuiltinSkill } from './types'
import { parseFrontMatter, stripFrontMatter } from '@/ai/shared/frontMatterUtils'

// 静态导入所有 SKILL.md（esbuild/tsdown .md: "text" 内联）
// 中文为默认版，`en/SKILL.md` 为独立英文版；两边的 frontmatter 各自提供
// description 与正文，切换由 `lang` 参数决定。
import emailOpsMd from './email-ops/SKILL.md'
import emailOpsEnMd from './email-ops/en/SKILL.md'
import calendarOpsMd from './calendar-ops/SKILL.md'
import calendarOpsEnMd from './calendar-ops/en/SKILL.md'
import scheduleOpsMd from './schedule-ops/SKILL.md'
import scheduleOpsEnMd from './schedule-ops/en/SKILL.md'
import canvasOpsMd from './canvas-ops/SKILL.md'
import canvasOpsEnMd from './canvas-ops/en/SKILL.md'
import projectOpsMd from './project-ops/SKILL.md'
import projectOpsEnMd from './project-ops/en/SKILL.md'
import workbenchOpsMd from './workbench-ops/SKILL.md'
import workbenchOpsEnMd from './workbench-ops/en/SKILL.md'
import settingsGuideMd from './settings-guide/SKILL.md'
import settingsGuideEnMd from './settings-guide/en/SKILL.md'
import agentOrchestrationMd from './agent-orchestration/SKILL.md'
import agentOrchestrationEnMd from './agent-orchestration/en/SKILL.md'
import browserOpsMd from './browser-ops/SKILL.md'
import browserOpsEnMd from './browser-ops/en/SKILL.md'
import pdfMd from './pdf/SKILL.md'
import pdfEnMd from './pdf/en/SKILL.md'
import docxMd from './docx/SKILL.md'
import docxEnMd from './docx/en/SKILL.md'
import xlsxMd from './xlsx/SKILL.md'
import xlsxEnMd from './xlsx/en/SKILL.md'
import pptxMd from './pptx/SKILL.md'
import pptxEnMd from './pptx/en/SKILL.md'
import mediaOpsMd from './media-ops/SKILL.md'
import mediaOpsEnMd from './media-ops/en/SKILL.md'
import visualizationOpsMd from './visualization-ops/SKILL.md'
import visualizationOpsEnMd from './visualization-ops/en/SKILL.md'
import skillCreatorMd from './skill-creator/SKILL.md'
import skillCreatorEnMd from './skill-creator/en/SKILL.md'
// Dynamic (content re-rendered on cloud capability refresh)
import { cloudMediaSkill } from './cloud-skills'

type BuiltinSkillOverride = {
  /** Chinese (default) SKILL.md text. */
  md: string
  /** English SKILL.md text — separate file, not inline frontmatter. */
  mdEn: string
  icon?: string
  colorIndex?: number
}

function buildSkill(override: BuiltinSkillOverride): BuiltinSkill {
  const fm = parseFrontMatter(override.md)
  const fmEn = parseFrontMatter(override.mdEn)
  return {
    name: fm.name ?? '',
    description: fm.description ?? '',
    descriptionEn: fmEn.description || undefined,
    content: stripFrontMatter(override.md),
    contentEn: stripFrontMatter(override.mdEn) || undefined,
    icon: override.icon,
    colorIndex: override.colorIndex,
  }
}

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  buildSkill({ md: emailOpsMd, mdEn: emailOpsEnMd, icon: '📧', colorIndex: 2 }),
  buildSkill({ md: calendarOpsMd, mdEn: calendarOpsEnMd, icon: '📅', colorIndex: 3 }),
  buildSkill({ md: scheduleOpsMd, mdEn: scheduleOpsEnMd, icon: '⏰', colorIndex: 4 }),
  buildSkill({ md: canvasOpsMd, mdEn: canvasOpsEnMd, icon: '🎨', colorIndex: 5 }),
  buildSkill({ md: projectOpsMd, mdEn: projectOpsEnMd, icon: '📁', colorIndex: 6 }),
  buildSkill({ md: workbenchOpsMd, mdEn: workbenchOpsEnMd, icon: '🧩', colorIndex: 7 }),
  buildSkill({ md: settingsGuideMd, mdEn: settingsGuideEnMd, icon: '⚙️', colorIndex: 0 }),
  buildSkill({ md: agentOrchestrationMd, mdEn: agentOrchestrationEnMd, icon: '🔀', colorIndex: 1 }),
  buildSkill({ md: browserOpsMd, mdEn: browserOpsEnMd, icon: '🌐', colorIndex: 3 }),
  buildSkill({ md: pdfMd, mdEn: pdfEnMd, icon: '📕', colorIndex: 4 }),
  buildSkill({ md: docxMd, mdEn: docxEnMd, icon: '📝', colorIndex: 2 }),
  buildSkill({ md: xlsxMd, mdEn: xlsxEnMd, icon: '📊', colorIndex: 5 }),
  buildSkill({ md: pptxMd, mdEn: pptxEnMd, icon: '📽️', colorIndex: 7 }),
  buildSkill({ md: mediaOpsMd, mdEn: mediaOpsEnMd, icon: '🎬', colorIndex: 6 }),
  buildSkill({ md: visualizationOpsMd, mdEn: visualizationOpsEnMd, icon: '📈', colorIndex: 7 }),
  buildSkill({ md: skillCreatorMd, mdEn: skillCreatorEnMd, icon: '🧠', colorIndex: 1 }),
  // Dynamic cloud skill — content re-rendered when ai.capabilitiesOverview refreshes.
  // Iterated per-request so mutating `.content` post-boot propagates to callers.
  cloudMediaSkill,
]
