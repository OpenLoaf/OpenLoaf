/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowRight, Check, ChevronDown, Layers, Lock, Sparkles, Zap } from 'lucide-react'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useEstimatePrice } from './hooks/useEstimatePrice'
import { useFakeProgress } from './hooks/useFakeProgress'

/** Generation target mode. */
export type GenerateTarget = 'current' | 'new-node'

/** Variant descriptor for the variant selector pill. */
export type GenerateActionVariant = {
  id: string
  displayName: string
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
  /** Editing mode — user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing. */
  onUnlock?: () => void
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
  /** Override label for the generate button. */
  generateLabel?: string
  /** Override label for the generating state. */
  generatingLabel?: string
  /** Blocking warning — when set, shows warning text on the left side. */
  warningMessage?: string | null
  /** Pricing-relevant params for dynamic credit estimation (aspectRatio, duration, count, etc.). */
  estimateParams?: Record<string, unknown>
  /** Skip credit estimation (e.g. text category where estimate API is not supported). */
  skipEstimate?: boolean
  /**
   * Estimated task duration in milliseconds (from variant metadata). When
   * `generating` is true, the action bar drives a fake 0–99% progress counter
   * across this duration so the user sees forward motion. Stays pinned at
   * 99% once the counter saturates until `generating` flips false.
   */
  estimatedDurationMs?: number
  /** Initial generate target restored from aiConfig. */
  initialTarget?: GenerateTarget
  /** Called when generate target changes — persist to aiConfig. */
  onTargetChange?: (target: GenerateTarget) => void
  /** Available variants for the current feature. */
  variants?: GenerateActionVariant[]
  /** Currently selected variant ID. */
  selectedVariantId?: string
  /** Called when user selects a different variant. */
  onVariantChange?: (variantId: string) => void
}

/** Custom dropdown for >2 variants — replaces native <select>. */
function VariantDropdown({
  variants,
  selectedId,
  disabled,
  onChange,
}: {
  variants: GenerateActionVariant[]
  selectedId?: string
  disabled?: boolean
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedLabel =
    variants.find((v) => v.id === selectedId)?.displayName ?? selectedId ?? ''

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className={[
          'inline-flex items-center gap-1 rounded-full bg-ol-surface-muted pl-2.5 pr-1.5 py-1 text-[11px] font-medium text-foreground transition-colors duration-150',
          disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'cursor-pointer hover:bg-ol-surface-muted/80',
        ].join(' ')}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          size={11}
          className={[
            'shrink-0 text-muted-foreground transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>
      {open ? (
        <div className="absolute left-0 bottom-full mb-1 z-50 flex flex-col rounded-xl border border-border bg-card py-0.5 shadow-lg min-w-[110px] max-h-[200px] overflow-y-auto">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={v.incompatible}
              title={v.incompatibleReason}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-left transition-colors',
                v.incompatible
                  ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                  : 'hover:bg-foreground/5',
                selectedId === v.id
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              ].join(' ')}
              onClick={() => {
                if (v.incompatible) return
                onChange(v.id)
                setOpen(false)
              }}
            >
              <Check
                size={10}
                className={[
                  'shrink-0',
                  selectedId === v.id ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
              <span>{v.displayName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Shared generate action bar for media AI panels.
 *
 * Layout:  [VariantPill ▾]    ⚡10  [✨ Generate →]
 *
 * Left: compact variant selector pill (only when multiple variants).
 * Right: credits display + split generate button (main = execute, side button = toggle target).
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
  warningMessage,
  estimateParams,
  skipEstimate = false,
  estimatedDurationMs,
  initialTarget,
  onTargetChange,
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

  // 逻辑：已有资源时默认先生成到当前节点；右侧切换按钮可改为新节点生成。
  // 从 aiConfig.generateTarget 恢复上次选择。
  const [target, setTarget] = useState<GenerateTarget>(initialTarget ?? 'current')
  // Editing mode always targets the current node (no new-node option).
  const effectiveTarget = editing ? 'current' : (hasResource ? target : 'current')

  const updateTarget = useCallback((next: GenerateTarget) => {
    setTarget(next)
    onTargetChange?.(next)
  }, [onTargetChange])

  useEffect(() => {
    if (!hasResource) {
      setTarget('current')
    }
  }, [hasResource])

  // Dynamic credit estimation via API
  const { totalCredits: estimatedCredits, billingType } = useEstimatePrice({
    variantId: selectedVariantId,
    params: estimateParams,
    skip: !loggedIn || skipEstimate,
  })

  // Fake progress counter driven by the variant's estimated duration.
  const fakeProgress = useFakeProgress({
    running: generating,
    durationMs: estimatedDurationMs,
  })
  const showProgress = generating && !!estimatedDurationMs && estimatedDurationMs > 0

  const resolvedCredits = estimatedCredits

  const billingUnit = billingType
    ? t(`v3.common.billingUnit.${billingType}`, { defaultValue: '' })
    : ''

  const label = generating
    ? showProgress
      ? t('generateAction.generatingPercent', {
          percent: fakeProgress,
          defaultValue: `${generatingLabel ?? t('generateAction.generating')} ${fakeProgress}%`,
        })
      : (generatingLabel ?? t('generateAction.generating'))
    : !loggedIn
      ? t('generateAction.loginAndGenerate', { defaultValue: '登录并生成' })
      : hasResource && effectiveTarget === 'new-node'
        ? t('generateAction.newNode', { defaultValue: '生成新节点' })
        : editing
          ? t('generateAction.regenerate', { defaultValue: '重新生成' })
          : (generateLabel ?? t('generateAction.generate'))

  const executeGenerate = useCallback(() => {
    if (effectiveTarget === 'current') {
      onGenerate()
    } else {
      onGenerateNewNode()
    }
  }, [effectiveTarget, onGenerate, onGenerateNewNode])

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
    executeGenerate()
  }

  const isButtonDisabled = !!warningMessage || generating || (disabled && loggedIn)
  const switchTargetLabel = effectiveTarget === 'new-node'
    ? t('generateAction.stackCurrent', { defaultValue: '堆叠到当前节点' })
    : t('generateAction.newNode', { defaultValue: '生成新节点' })
  const SwitchTargetIcon = effectiveTarget === 'new-node' ? Layers : ArrowRight

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
    <div className="relative flex flex-col gap-1.5 border-t border-border pt-2">
      {/* Warning message (above action bar, does not replace variant selector) */}
      {warningMessage ? (
        <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-amber-500 dark:text-amber-400">
          <AlertCircle size={13} className="shrink-0" />
          <span>{warningMessage}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {/* Left: Variant label / tab selector */}
        {variants && variants.length >= 1 ? (
          <span className="text-[11px] text-muted-foreground/70">{t('generateAction.model')}</span>
        ) : null}
        {variants && variants.length >= 1 && !onVariantChange ? (
          /* No switcher — show the selected (or only) variant name as static text */
          <span className="text-[11px] font-medium text-muted-foreground">
            {variants.find((v) => v.id === selectedVariantId)?.displayName ?? variants[0].displayName}
          </span>
        ) : variants && variants.length > 1 && onVariantChange ? (
          variants.length <= 2 ? (
            /* ≤2 个 variant：tab 胶囊样式 */
            <div className="flex items-center gap-0.5 rounded-full bg-ol-surface-muted p-0.5">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.incompatible || generating}
                  title={v.incompatibleReason}
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-150',
                    v.incompatible
                      ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                      : selectedVariantId === v.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  onClick={() => {
                    if (v.incompatible) return
                    onVariantChange(v.id)
                  }}
                >
                  <span>{v.displayName}</span>
                </button>
              ))}
            </div>
          ) : (
            /* >2 个 variant：自定义下拉 */
            <VariantDropdown
              variants={variants}
              selectedId={selectedVariantId}
              disabled={generating}
              onChange={onVariantChange}
            />
          )
        ) : null}

        <div className="flex-1" />

        {/* Credits */}
        {resolvedCredits != null ? (
          <div className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t('v3.common.creditsWithUnit', { credits: resolvedCredits, unit: billingUnit })}>
            <Zap size={11} />
            <span className="text-[9px] leading-none opacity-80" aria-hidden="true">≈</span>
            <span>{resolvedCredits}</span>
          </div>
        ) : null}

        {/* Cancel button (editing mode only) */}
        {editing && onCancelEdit ? (
          <button
            type="button"
            className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
            onClick={onCancelEdit}
          >
            {t('generateAction.cancel', { defaultValue: '取消' })}
          </button>
        ) : null}

        {/* Generate button (+ target toggle when node has resource) */}
        <div className="relative">
          {hasResource && !editing ? (
            // 逻辑：有资源时显示两个并排按钮；主按钮执行当前模式，右侧按钮切换目标。
            // 编辑模式下只能重新生成到当前节点，不显示 target 切换。
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
                onClick={() => {
                  if (isButtonDisabled) return
                  updateTarget(target === 'current' ? 'new-node' : 'current')
                }}
                title={switchTargetLabel}
                aria-label={switchTargetLabel}
              >
                <SwitchTargetIcon size={10} />
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

        </div>

        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    </div>
  )
}
