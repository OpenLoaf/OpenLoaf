/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useTranslation } from 'react-i18next'
import type { TextReference } from '../slot-types'
import { ReferenceChip } from './ReferenceChip'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextReferencePoolProps = {
  references: TextReference[]
  onInsert: (ref: TextReference) => void
}

// ---------------------------------------------------------------------------
// TextReferencePool
// ---------------------------------------------------------------------------

/**
 * Displays unassigned upstream text references above input fields.
 * Returns null when the pool is empty.
 */
export function TextReferencePool({ references, onInsert }: TextReferencePoolProps) {
  const { t } = useTranslation('board')

  if (references.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground/60 leading-none">
        {t('slot.unassignedTexts')}
      </span>
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-muted/30 px-2 py-1.5">
        {references.map((ref) => (
          <ReferenceChip
            key={ref.nodeId}
            reference={ref}
            mode="pool"
            draggable
            onClick={() => onInsert(ref)}
          />
        ))}
      </div>
    </div>
  )
}
