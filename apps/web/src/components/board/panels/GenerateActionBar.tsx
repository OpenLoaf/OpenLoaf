/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowRight, ChevronDown, Layers, Lock, Sparkles, Zap } from 'lucide-react'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useEstimatePrice } from './hooks/useEstimatePrice'

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
  const [target, setTarget] = useState<GenerateTarget>('current')
  const effectiveTarget = hasResource ? target : 'current'

  useEffect(() => {
    if (!hasResource) {
      setTarget('current')
    }
  }, [hasResource])

  // Dynamic credit estimation via API
  const { totalCredits: estimatedCredits } = useEstimatePrice({
    variantId: selectedVariantId,
    params: estimateParams,
    skip: !loggedIn,
  })

  const resolvedCredits = estimatedCredits

  const label = generating
    ? (generatingLabel ?? t('generateAction.generating'))
    : !loggedIn
      ? t('generateAction.loginAndGenerate', { defaultValue: '登录并生成' })
      : hasResource && effectiveTarget === 'new-node'
        ? t('generateAction.newNode', { defaultValue: '生成新节点' })
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
    <div className="flex flex-col gap-1.5 border-t border-border pt-2">
      {/* Warning message (above action bar, does not replace variant selector) */}
      {warningMessage ? (
        <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-amber-500 dark:text-amber-400">
          <AlertCircle size={13} className="shrink-0" />
          <span>{warningMessage}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {/* Left: Variant tab selector */}
        {variants && variants.length > 1 && onVariantChange ? (
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
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
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
            /* >2 个 variant：下拉框 */
            <div className="relative">
              <select
                value={selectedVariantId ?? ''}
                disabled={disabled || generating}
                onChange={(e) => onVariantChange(e.target.value)}
                className="appearance-none rounded-full bg-ol-surface-muted pl-2.5 pr-6 py-1 text-[11px] font-medium text-foreground border-none outline-none cursor-pointer transition-colors duration-150 hover:bg-ol-surface-muted/80"
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.incompatible}>
                    {v.displayName}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          )
        ) : null}

        <div className="flex-1" />

        {/* Credits */}
        {resolvedCredits != null ? (
          <div className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t('v3.common.creditsPerCall', { credits: resolvedCredits })}>
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
          {hasResource ? (
            // 逻辑：有资源时显示两个并排按钮；主按钮执行当前模式，右侧按钮切换目标。
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
                  setTarget((prev) => (prev === 'current' ? 'new-node' : 'current'))
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
