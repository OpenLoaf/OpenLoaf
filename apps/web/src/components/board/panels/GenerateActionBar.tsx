/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Lock, Sparkles } from 'lucide-react'

/** Generation target mode. */
export type GenerateTarget = 'current' | 'new-node'

export type GenerateActionBarProps = {
  /** Whether the node already has a resource (image/video/audio). */
  hasResource: boolean
  /** Whether a generation task is in progress. */
  generating: boolean
  /** Whether the generate button should be disabled (e.g. empty prompt). */
  disabled: boolean
  /** Tailwind class for the generate button (semantic color per node type). */
  buttonClassName: string
  /** Generate into the current node (version stack push). */
  onGenerate: () => void
  /** Generate into a new derived node. */
  onGenerateNewNode: () => void
  /** When true, show readonly lock + unlock button instead. */
  readonly?: boolean
  /** Editing mode — user unlocked an existing result to tweak params. Forces "current node" target. */
  editing?: boolean
  /** Callback to unlock the panel for editing. */
  onUnlock?: () => void
  /** Override label for the generate button. */
  generateLabel?: string
  /** Override label for the generating state. */
  generatingLabel?: string
}

/**
 * Shared generate action bar for media AI panels.
 *
 * - Empty node: single "Generate" button (always targets current node).
 * - Has resource: "Generate ▾" with dropdown to switch between new-node (default) and stack-current.
 */
export function GenerateActionBar({
  hasResource,
  generating,
  disabled,
  buttonClassName,
  onGenerate,
  onGenerateNewNode,
  readonly = false,
  editing = false,
  onUnlock,
  generateLabel,
  generatingLabel,
}: GenerateActionBarProps) {
  const { t } = useTranslation('board')
  // 逻辑：编辑模式（解锁后修改参数）强制生成到当前节点；否则默认新节点。
  const [target, setTarget] = useState<GenerateTarget>(editing ? 'current' : 'new-node')
  const effectiveTarget = editing ? 'current' : target

  const label = generating
    ? (generatingLabel ?? t('generateAction.generating'))
    : editing
      ? t('generateAction.regenerate', { defaultValue: '重新生成' })
      : (generateLabel ?? t('generateAction.generate'))

  const handleClick = () => {
    if (generating || disabled) return
    if (!hasResource) {
      onGenerate()
      return
    }
    if (effectiveTarget === 'current') {
      onGenerate()
    } else {
      onGenerateNewNode()
    }
  }

  if (readonly) {
    return (
      <div className="flex items-center gap-2 border-t border-border pt-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Lock size={10} />
          <span>{t('generateAction.locked')}</span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-foreground/5 transition-colors duration-150"
          onClick={() => onUnlock?.()}
        >
          <Lock size={12} />
          {t('generateAction.unlock')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 border-t border-border pt-2">
      {/* Checkbox toggle — only show when node already has content */}
      {hasResource ? (
        <button
          type="button"
          disabled={editing}
          className={[
            'inline-flex items-center gap-1.5 text-[11px] transition-colors duration-150',
            editing ? 'text-muted-foreground/60 cursor-default' : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
          onClick={() => !editing && setTarget(target === 'current' ? 'new-node' : 'current')}
        >
          <span className={[
            'inline-flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors duration-150',
            effectiveTarget === 'current'
              ? 'border-foreground bg-foreground'
              : 'border-muted-foreground/40',
          ].join(' ')}>
            {effectiveTarget === 'current' ? <Check size={10} className="text-background" /> : null}
          </span>
          {t('generateAction.currentNode', { defaultValue: 'Current node' })}
        </button>
      ) : null}
      <div className="flex-1" />
      <button
        type="button"
        disabled={generating || disabled}
        className={[
          'inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150',
          buttonClassName,
          (generating || disabled) ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
        onClick={handleClick}
      >
        <Sparkles size={12} />
        {label}
      </button>
    </div>
  )
}
