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
import emailOpsMd from './email-ops/SKILL.md'
import calendarOpsMd from './calendar-ops/SKILL.md'
import scheduleOpsMd from './schedule-ops/SKILL.md'
import canvasOpsMd from './canvas-ops/SKILL.md'
import projectOpsMd from './project-ops/SKILL.md'
import workbenchOpsMd from './workbench-ops/SKILL.md'
import settingsGuideMd from './settings-guide/SKILL.md'
import agentOrchestrationMd from './agent-orchestration/SKILL.md'
import browserOpsMd from './browser-ops/SKILL.md'
import pdfMd from './pdf/SKILL.md'
import docxMd from './docx/SKILL.md'
import xlsxMd from './xlsx/SKILL.md'
import pptxMd from './pptx/SKILL.md'
import mediaOpsMd from './media-ops/SKILL.md'
import visualizationOpsMd from './visualization-ops/SKILL.md'
import skillCreatorMd from './skill-creator/SKILL.md'
// Dynamic (content re-rendered on cloud capability refresh)
import { cloudMediaSkill } from './cloud-skills'

type BuiltinSkillOverride = {
  md: string
  icon?: string
  colorIndex?: number
}

function buildSkill(override: BuiltinSkillOverride): BuiltinSkill {
  const fm = parseFrontMatter(override.md)
  return {
    name: fm.name ?? '',
    description: fm.description ?? '',
    content: stripFrontMatter(override.md),
    icon: override.icon,
    colorIndex: override.colorIndex,
  }
}

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  buildSkill({ md: emailOpsMd, icon: '📧', colorIndex: 2 }),
  buildSkill({ md: calendarOpsMd, icon: '📅', colorIndex: 3 }),
  buildSkill({ md: scheduleOpsMd, icon: '⏰', colorIndex: 4 }),
  buildSkill({ md: canvasOpsMd, icon: '🎨', colorIndex: 5 }),
  buildSkill({ md: projectOpsMd, icon: '📁', colorIndex: 6 }),
  buildSkill({ md: workbenchOpsMd, icon: '🧩', colorIndex: 7 }),
  buildSkill({ md: settingsGuideMd, icon: '⚙️', colorIndex: 0 }),
  buildSkill({ md: agentOrchestrationMd, icon: '🔀', colorIndex: 1 }),
  buildSkill({ md: browserOpsMd, icon: '🌐', colorIndex: 3 }),
  buildSkill({ md: pdfMd, icon: '📕', colorIndex: 4 }),
  buildSkill({ md: docxMd, icon: '📝', colorIndex: 2 }),
  buildSkill({ md: xlsxMd, icon: '📊', colorIndex: 5 }),
  buildSkill({ md: pptxMd, icon: '📽️', colorIndex: 7 }),
  buildSkill({ md: mediaOpsMd, icon: '🎬', colorIndex: 6 }),
  buildSkill({ md: visualizationOpsMd, icon: '📈', colorIndex: 7 }),
  buildSkill({ md: skillCreatorMd, icon: '🧠', colorIndex: 1 }),
  // Dynamic cloud skill — content re-rendered when ai.capabilitiesOverview refreshes.
  // Iterated per-request so mutating `.content` post-boot propagates to callers.
  cloudMediaSkill,
]
