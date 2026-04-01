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
 * SkillSlotBar — Horizontal pill chips for loaded skills in the Text AI Panel.
 *
 * Phase 1: Placeholder component. Skill loading and filtering will be wired
 * in Phase 2 when textFeatures is added to SkillSummary schema.
 */

import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface SkillSlotEntry {
  name: string
  content: string
}

interface SkillSlotBarProps {
  skills: SkillSlotEntry[]
  onRemove: (index: number) => void
  onAdd: () => void
  disabled?: boolean
  maxSlots?: number
}

/** Horizontal bar of skill pill chips with an [+] add button. */
export function SkillSlotBar({
  skills,
  onRemove,
  onAdd,
  disabled = false,
  maxSlots = 3,
}: SkillSlotBarProps) {
  const { t } = useTranslation('board')

  if (skills.length === 0 && disabled) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {skills.map((skill, idx) => (
        <span
          key={`${skill.name}-${idx}`}
          className="inline-flex items-center gap-1 rounded-3xl bg-ol-surface-muted px-2.5 py-1 text-xs font-medium text-foreground"
        >
          {skill.name}
          {!disabled ? (
            <button
              type="button"
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              onClick={() => onRemove(idx)}
            >
              <X size={10} />
            </button>
          ) : null}
        </span>
      ))}
      {skills.length < maxSlots && !disabled ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-3xl border border-dashed border-muted-foreground/30 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          onClick={onAdd}
        >
          <Plus size={12} />
          {t('textPanel.addSkill', 'Skill')}
        </button>
      ) : null}
    </div>
  )
}
