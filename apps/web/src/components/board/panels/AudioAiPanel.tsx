/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  Mic,
  Music,
  Volume2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@udecode/cn'
import { MEDIA_PREFERENCES, MEDIA_FEATURES, type MediaPreferenceId, type MediaFeatureId } from '@openloaf-saas/sdk'
import { useCapabilities } from '@/hooks/use-capabilities'
import type { V3Feature, V3Variant } from '@/lib/saas-media'
import { GenerateActionBar } from './GenerateActionBar'
import { AUDIO_VARIANTS } from './variants/audio'
import type { VariantContext } from './variants/types'
import { ScrollableTabBar } from '../ui/ScrollableTabBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Upstream data fed into the panel via connectors. */
export type AudioPanelUpstream = {
  /** Plain text from a connected text node (for TTS). */
  textContent?: string
  /** Audio source path from a connected audio node (for TTS reference voice). */
  referenceAudioSrc?: string
  /** Display name for the reference audio. */
  referenceAudioName?: string
  /** Board context for variant MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
}

/** Audio generate params for v3. */
export type AudioGenerateParams = {
  feature: string
  variant: string
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
}

/** Props for the AudioAiPanel component. */
export type AudioAiPanelProps = {
  /** Upstream data from connected nodes. */
  upstream?: AudioPanelUpstream
  /** Callback when the user submits a generation request. */
  onGenerate?: (params: AudioGenerateParams) => void
  /** Callback to generate into a new derived node. */
  onGenerateNewNode?: (params: AudioGenerateParams) => void
  /** Whether the node currently has a resource. */
  hasResource?: boolean
  /** Whether the panel is in a generating state. */
  generating?: boolean
  /** When true, all inputs are disabled and the generate button is hidden. */
  readonly?: boolean
  /** Editing mode — user unlocked an existing result to tweak params. */
  editing?: boolean
  /** Callback to unlock the panel for editing. */
  onUnlock?: () => void
  /** Callback to cancel editing mode (re-lock the panel). */
  onCancelEdit?: () => void
  /** Additional class name for the root element. */
  className?: string
}

// ---------------------------------------------------------------------------
// Feature tab icons
// ---------------------------------------------------------------------------

const FEATURE_ICON_MAP: Record<string, typeof Mic> = {
  tts: Mic,
  music: Music,
  sfx: Volume2,
}

/** Well-known feature IDs for audio (used for coming-soon placeholders). */
const WELL_KNOWN_FEATURES = ['tts', 'music', 'sfx'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Audio AI generation panel driven by v3 capabilities. */
export function AudioAiPanel({
  upstream,
  onGenerate,
  onGenerateNewNode,
  hasResource = false,
  generating = false,
  readonly = false,
  editing = false,
  onUnlock,
  onCancelEdit,
  className,
}: AudioAiPanelProps) {
  const { t, i18n } = useTranslation('board')
  const prefLang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const {
    data: capabilities,
    loading: capLoading,
    error: capError,
    refresh: capRefresh,
  } = useCapabilities('audio')

  // Build feature list: use capabilities if available, otherwise show all well-known tabs
  const featureTabs = useMemo(() => {
    if (capabilities?.features?.length) {
      return capabilities.features
    }
    // Fallback: show well-known features with empty variants
    return WELL_KNOWN_FEATURES.map((id) => ({
      id,
      displayName: id,
      variants: [] as V3Variant[],
    })) as V3Feature[]
  }, [capabilities])

  // State
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('tts')
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [variantWarning, setVariantWarning] = useState<string | null>(null)

  // Clear warning when feature/variant changes
  useEffect(() => {
    setVariantWarning(null)
  }, [selectedFeatureId, selectedVariantId])
  const latestParamsRef = useRef<{
    inputs: Record<string, unknown>
    params: Record<string, unknown>
    count?: number
    seed?: number
  } | null>(null)

  // Resolve selected feature and variant
  const selectedFeature = featureTabs.find((f) => f.id === selectedFeatureId) ?? featureTabs[0]
  const variants = selectedFeature?.variants ?? []
  const resolvedVariantId = selectedVariantId && variants.find((v) => v.id === selectedVariantId)
    ? selectedVariantId
    : variants[0]?.id ?? null
  const selectedVariant = variants.find((v) => v.id === resolvedVariantId) ?? null

  // Get the variant form component from the registry
  const VariantForm = resolvedVariantId
    ? AUDIO_VARIANTS[resolvedVariantId]?.component ?? null
    : null

  // Is this a coming-soon feature (no variants)?
  const isComingSoon = variants.length === 0

  // Upstream adapter
  const variantUpstream = useMemo(
    () => ({
      textContent: upstream?.textContent,
      audioUrl: upstream?.referenceAudioSrc,
      boardId: upstream?.boardId,
      projectId: upstream?.projectId,
      boardFolderUri: upstream?.boardFolderUri,
    }),
    [upstream?.textContent, upstream?.referenceAudioSrc, upstream?.boardId, upstream?.projectId, upstream?.boardFolderUri],
  )

  // ── Variant context & applicability ──
  const variantCtx: VariantContext = useMemo(() => ({
    nodeHasImage: false, // audio nodes don't have a "current image"
    hasImage: false,
    hasAudio: Boolean(upstream?.referenceAudioSrc),
    hasVideo: false,
  }), [upstream?.referenceAudioSrc])

  const isVariantApplicable = useCallback((variantId: string) => {
    const def = AUDIO_VARIANTS[variantId]
    return !def || def.isApplicable(variantCtx)
  }, [variantCtx])

  // Credits from selected variant
  const creditsPerCall = selectedVariant?.creditsPerCall ?? null

  // Params change handler
  const handleParamsChange = useCallback(
    (params: {
      inputs: Record<string, unknown>
      params: Record<string, unknown>
      count?: number
      seed?: number
    }) => {
      latestParamsRef.current = params
    },
    [],
  )

  // Generate handlers
  const buildGenerateParams = useCallback((): AudioGenerateParams | null => {
    if (!selectedFeature || !resolvedVariantId || !latestParamsRef.current) return null
    return {
      feature: selectedFeature.id,
      variant: resolvedVariantId,
      ...latestParamsRef.current,
    }
  }, [selectedFeature, resolvedVariantId])

  const handleGenerate = useCallback(() => {
    const params = buildGenerateParams()
    if (params) onGenerate?.(params)
  }, [onGenerate, buildGenerateParams])

  const handleGenerateNew = useCallback(() => {
    const params = buildGenerateParams()
    if (params) onGenerateNewNode?.(params)
  }, [onGenerateNewNode, buildGenerateParams])

  const isGenerateDisabled = isComingSoon || !resolvedVariantId || !latestParamsRef.current

  const showFallback = !capabilities?.features?.length

  return (
    <div
      className={cn(
        'flex w-[420px] flex-col gap-3 rounded-3xl border border-border bg-card p-3 shadow-lg',
        readonly && !editing && 'pointer-events-none',
        className,
      )}
    >
      {/* ---- Fallback: loading / error / empty ---- */}
      {showFallback ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 py-6">
          {capLoading ? (
            <>
              <Loader2 size={20} className="animate-spin text-muted-foreground/60" />
              <span className="text-xs text-muted-foreground">{t('v3.common.loading')}</span>
            </>
          ) : capError ? (
            <>
              <span className="text-sm font-medium text-muted-foreground">{t('v3.common.loadError')}</span>
              <span className="text-[11px] text-muted-foreground/60">{t('v3.common.loadErrorHint')}</span>
              <button
                type="button"
                className="mt-1 rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
                onClick={() => capRefresh()}
              >
                {t('v3.common.retry')}
              </button>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-muted-foreground">{t('v3.common.loadError')}</span>
              <span className="text-[11px] text-muted-foreground/60">{t('v3.common.loadErrorHint')}</span>
              <button
                type="button"
                className="mt-1 rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors duration-150"
                onClick={() => capRefresh()}
              >
                {t('v3.common.retry')}
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* ---- Feature Tab Row ---- */}
      {!showFallback ? <ScrollableTabBar className="items-center">
        {featureTabs
          .filter((feature) => {
            // In readonly mode only show the active tab
            if (readonly && !editing) return feature.id === selectedFeatureId
            // Hide features where no variant is applicable
            if (feature.variants.length > 0 && feature.variants.every((v) => !isVariantApplicable(v.id))) return false
            return true
          })
          .map((feature) => {
          const Icon = FEATURE_ICON_MAP[feature.id] ?? Mic
          const hasNoVariants = feature.variants.length === 0
          return (
            <button
              key={feature.id}
              type="button"
              disabled={readonly}
              className={cn(
                'flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-3xl px-2 py-1.5',
                'text-xs font-medium transition-colors duration-150',
                readonly
                  ? 'cursor-not-allowed text-muted-foreground/40'
                  : selectedFeatureId === feature.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                if (!readonly) {
                  setSelectedFeatureId(feature.id)
                  setSelectedVariantId(null)
                }
              }}
            >
              <Icon size={13} />
              <span>
                {MEDIA_FEATURES[feature.id as MediaFeatureId]?.label[prefLang] ?? feature.id}
              </span>
              {hasNoVariants ? (
                <span className="ml-1 rounded bg-muted-foreground/10 px-1 py-px text-[9px] text-muted-foreground/50">
                  {t('audioPanel.tabBadgeSoon')}
                </span>
              ) : null}
            </button>
          )
        })}
      </ScrollableTabBar> : null}

      {/* ---- Variant Form ---- */}
      {VariantForm && selectedVariant ? (
        <VariantForm
          variant={selectedVariant}
          upstream={variantUpstream}
          disabled={readonly || generating}
          onParamsChange={handleParamsChange}
          onWarningChange={setVariantWarning}
        />
      ) : null}

      {/* ---- Coming Soon Placeholder ---- */}
      {isComingSoon ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/40 bg-ol-surface-muted/50 px-4 py-8">
          {(() => {
            const PlaceholderIcon = FEATURE_ICON_MAP[selectedFeatureId] ?? Mic
            return (
              <PlaceholderIcon
                size={24}
                className="text-muted-foreground/40"
              />
            )
          })()}
          <span className="text-sm font-medium text-muted-foreground/60">
            {t(`audioPanel.comingSoon.${selectedFeatureId}.title`, {
              defaultValue: t('v3.features.comingSoonTitle'),
            })}
          </span>
          <span className="text-[11px] text-muted-foreground/40">
            {t(`audioPanel.comingSoon.${selectedFeatureId}.description`, {
              defaultValue: t('v3.features.comingSoonDescription'),
            })}
          </span>
        </div>
      ) : null}

      {/* ---- Generate Action Bar ---- */}
      {!isComingSoon && !showFallback ? (
        <GenerateActionBar
          hasResource={hasResource}
          generating={generating}
          disabled={isGenerateDisabled}
          buttonClassName="bg-foreground text-background hover:bg-foreground/90"
          onGenerate={handleGenerate}
          onGenerateNewNode={handleGenerateNew}
          readonly={readonly}
          editing={editing}
          onUnlock={onUnlock}
          onCancelEdit={onCancelEdit}
          creditsPerCall={creditsPerCall ?? undefined}
          warningMessage={variantWarning}
          variants={variants.length > 0 ? variants.filter((v) => isVariantApplicable(v.id)).map((v) => ({
            id: v.id,
            displayName: MEDIA_PREFERENCES[v.preference as MediaPreferenceId]?.label[prefLang] ?? v.id,
            creditsPerCall: v.creditsPerCall,
          })) : undefined}
          selectedVariantId={resolvedVariantId ?? undefined}
          onVariantChange={setSelectedVariantId}
        />
      ) : null}
    </div>
  )
}
