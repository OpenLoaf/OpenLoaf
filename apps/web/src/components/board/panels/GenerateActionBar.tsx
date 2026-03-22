/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ChevronDown, Layers, Lock, Plus, Sparkles, Zap } from 'lucide-react'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'

/** Generation target mode. */
export type GenerateTarget = 'current' | 'new-node'

/** Variant descriptor for the variant selector pill. */
export type GenerateActionVariant = {
  id: string
  displayName: string
  creditsPerCall: number
  /** When true, variant is incompatible with current node state. */
  incompatible?: boolean
  /** Human-readable reason for incompatibility. */
  incompatibleReason?: string
}

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
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
  /** Override label for the generate button. */
  generateLabel?: string
  /** Override label for the generating state. */
  generatingLabel?: string
  /** Credits per call for the selected variant. */
  creditsPerCall?: number
  /** Blocking warning — when set, shows warning text on the left side. */
  warningMessage?: string | null
  /** Available variants for the current feature. */
  variants?: GenerateActionVariant[]
  /** Currently selected variant ID. */
  selectedVariantId?: string
  /** Called when user selects a different variant. */
  onVariantChange?: (variantId: string) => void
}

/**
 * Shared generate action bar for media AI panels.
 *
 * Layout:  [VariantPill ▾]    ⚡10  [✨ Generate ▾]
 *
 * Left: compact variant selector pill (only when multiple variants).
 * Right: credits display + split generate button (main = generate, ▾ = target options).
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
  onCancelEdit,
  generateLabel,
  generatingLabel,
  creditsPerCall,
  warningMessage,
  variants,
  selectedVariantId,
  onVariantChange,
}: GenerateActionBarProps) {
  const { t } = useTranslation('board')
  const loggedIn = useSaasAuth((s) => s.loggedIn)
  const [loginOpen, setLoginOpen] = useState(false)

  // Close login dialog when auth state changes to logged in.
  useEffect(() => {
    if (loggedIn && loginOpen) setLoginOpen(false)
  }, [loggedIn, loginOpen])

  // Target: editing mode forces "current"; otherwise default to "new-node".
  const [target, setTarget] = useState<GenerateTarget>(editing ? 'current' : 'new-node')
  const effectiveTarget = editing ? 'current' : target

  // Dropdown states
  const [showVariantDropdown, setShowVariantDropdown] = useState(false)
  const [showTargetDropdown, setShowTargetDropdown] = useState(false)
  const variantDropdownRef = useRef<HTMLDivElement>(null)
  const targetDropdownRef = useRef<HTMLDivElement>(null)

  // Outside-click-to-close for variant dropdown
  useEffect(() => {
    if (!showVariantDropdown) return
    const handler = (e: MouseEvent) => {
      if (
        variantDropdownRef.current &&
        !variantDropdownRef.current.contains(e.target as Node)
      ) {
        setShowVariantDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showVariantDropdown])

  // Outside-click-to-close for target dropdown
  useEffect(() => {
    if (!showTargetDropdown) return
    const handler = (e: MouseEvent) => {
      if (
        targetDropdownRef.current &&
        !targetDropdownRef.current.contains(e.target as Node)
      ) {
        setShowTargetDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTargetDropdown])

  // Derive creditsPerCall from variants + selectedVariantId if not explicitly provided
  const resolvedCredits = creditsPerCall
    ?? variants?.find((v) => v.id === selectedVariantId)?.creditsPerCall

  const label = generating
    ? (generatingLabel ?? t('generateAction.generating'))
    : !loggedIn
      ? t('generateAction.loginAndGenerate', { defaultValue: '登录并生成' })
      : editing
        ? t('generateAction.regenerate', { defaultValue: '重新生成' })
        : (generateLabel ?? t('generateAction.generate'))

  const handleClick = () => {
    if (generating || disabled) return
    // Intercept for login
    if (!loggedIn) {
      setLoginOpen(true)
      return
    }
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

  const isButtonDisabled = !!warningMessage || generating || (disabled && loggedIn)

  // ── Readonly state ──
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

  // ── Normal state ──
  return (
    <div className="flex items-center gap-2 border-t border-border pt-2">
      {/* Left: Warning text OR Variant selector pill */}
      {warningMessage ? (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-500 dark:text-amber-400">
          <AlertCircle size={13} className="shrink-0" />
          <span>{warningMessage}</span>
        </div>
      ) : variants && variants.length > 1 && onVariantChange ? (
        <div className="relative" ref={variantDropdownRef}>
          <button
            type="button"
            disabled={disabled || generating}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors duration-150 hover:bg-foreground/5"
            onClick={() => setShowVariantDropdown(!showVariantDropdown)}
          >
            <span className="max-w-[120px] truncate font-medium">
              {variants.find((v) => v.id === selectedVariantId)?.displayName ?? '...'}
            </span>
            <ChevronDown size={10} className="text-muted-foreground" />
          </button>
          {showVariantDropdown ? (
            <div className="absolute left-0 top-full mt-1 z-10 flex flex-col rounded-2xl border border-border bg-card py-0.5 shadow-lg min-w-[160px]">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.incompatible}
                  title={v.incompatibleReason}
                  className={[
                    'flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors',
                    v.incompatible
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-foreground/5',
                    selectedVariantId === v.id ? 'text-foreground font-medium' : 'text-muted-foreground',
                  ].join(' ')}
                  onClick={() => {
                    if (v.incompatible) return
                    onVariantChange(v.id)
                    setShowVariantDropdown(false)
                  }}
                >
                  <span>{v.displayName}</span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                    <Zap size={9} />{v.creditsPerCall}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1" />

      {/* Cancel button (editing mode only) */}
      {!warningMessage && editing && onCancelEdit ? (
        <button
          type="button"
          className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
          onClick={onCancelEdit}
        >
          {t('generateAction.cancel', { defaultValue: '取消' })}
        </button>
      ) : null}

      {/* Credits */}
      {resolvedCredits != null && !warningMessage ? (
        <div className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t('v3.common.creditsPerCall', { credits: resolvedCredits })}>
          <Zap size={11} />
          <span>{resolvedCredits}</span>
        </div>
      ) : null}

      {/* Generate button (+ target dropdown when node has resource) */}
      <div className="relative" ref={targetDropdownRef}>
        {hasResource && !warningMessage ? (
          // 逻辑：有资源时显示两个并排按钮（生成 + ▾），外层 div 统一圆角。
          <div className={[
            'inline-flex items-stretch overflow-hidden rounded-full',
            isButtonDisabled ? 'opacity-50' : '',
          ].join(' ')}>
            <button
              type="button"
              disabled={isButtonDisabled}
              className={[
                'inline-flex items-center gap-1 pl-3.5 pr-1.5 py-1.5 text-xs font-medium transition-colors duration-150',
                buttonClassName,
                isButtonDisabled ? 'cursor-not-allowed' : '',
              ].join(' ')}
              onClick={handleClick}
            >
              <Sparkles size={12} />
              {label}
            </button>
            <button
              type="button"
              disabled={isButtonDisabled}
              className={[
                'inline-flex items-center px-1.5 transition-colors duration-150',
                buttonClassName,
                isButtonDisabled ? 'cursor-not-allowed' : '',
              ].join(' ')}
              onClick={() => !isButtonDisabled && setShowTargetDropdown(!showTargetDropdown)}
            >
              <ChevronDown size={10} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isButtonDisabled}
            className={[
              'inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150',
              buttonClassName,
              isButtonDisabled ? 'cursor-not-allowed opacity-50' : '',
            ].join(' ')}
            onClick={handleClick}
          >
            <Sparkles size={12} />
            {label}
          </button>
        )}
        {showTargetDropdown ? (
          <div className="absolute right-0 top-full mt-1 z-10 flex flex-col rounded-2xl border border-border bg-card py-1 shadow-lg min-w-[150px]">
            <button
              type="button"
              className={[
                'flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-foreground/5',
                effectiveTarget === 'new-node' ? 'text-foreground font-medium' : 'text-muted-foreground',
              ].join(' ')}
              onClick={() => { setTarget('new-node'); setShowTargetDropdown(false) }}
            >
              <Plus size={12} />
              {t('generateAction.newNode')}
            </button>
            <button
              type="button"
              className={[
                'flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-foreground/5',
                effectiveTarget === 'current' ? 'text-foreground font-medium' : 'text-muted-foreground',
              ].join(' ')}
              onClick={() => { setTarget('current'); setShowTargetDropdown(false) }}
            >
              <Layers size={12} />
              {t('generateAction.stackCurrent')}
            </button>
          </div>
        ) : null}
      </div>

      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  )
}
