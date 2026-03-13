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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryClient, trpc } from '@/utils/trpc'
import { Button } from '@openloaf/ui/button'
import { Textarea } from '@openloaf/ui/textarea'
import { FilterTab } from '@openloaf/ui/filter-tab'
import { OpenLoafSettingsGroup } from '@openloaf/ui/openloaf/OpenLoafSettingsGroup'
import { OpenLoafSettingsField } from '@openloaf/ui/openloaf/OpenLoafSettingsField'
import {
  Cpu,
  HardDrive,
  RotateCcw,
  ChevronDown,
  FolderKanban,
  MessageSquareText,
  FileText,
  Folder,
  GitCommitHorizontal,
  Languages,
  Sparkles,
  Zap,
  Check,
  Play,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useCloudModels } from '@/hooks/use-cloud-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import {
  buildChatModelOptions,
  type ProviderModelOption,
} from '@/lib/provider-models'
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@openloaf/ui/popover'
import { Checkbox } from '@openloaf/ui/checkbox'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/** Output mode → badge style mapping (label resolved via t()). */
const OUTPUT_MODE_CLASS: Record<string, string> = {
  structured: 'bg-ol-blue-bg text-ol-blue',
  text: 'bg-ol-green-bg text-ol-green',
  'tool-call': 'bg-ol-purple-bg text-ol-purple',
  skill: 'bg-ol-amber-bg text-ol-amber',
}

/** Capability key → icon + color mapping. */
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  'project.classify': { icon: FolderKanban, color: 'text-ol-blue' },
  'chat.suggestions': { icon: MessageSquareText, color: 'text-ol-purple' },
  'chat.title': { icon: FileText, color: 'text-ol-amber' },
  'project.ephemeralName': { icon: Folder, color: 'text-ol-green' },
  'git.commitMessage': { icon: GitCommitHorizontal, color: 'text-ol-amber' },
  'text.translate': { icon: Languages, color: 'text-ol-green' },
}

/** Flat color palette for trigger scenario badges. */
const TRIGGER_COLORS = [
  'bg-ol-blue-bg text-ol-blue',
  'bg-ol-amber-bg text-ol-amber',
  'bg-ol-green-bg text-ol-green',
  'bg-ol-purple-bg text-ol-purple',
  'bg-ol-red-bg text-ol-red',
  'bg-ol-green-bg text-ol-green',
  'bg-ol-amber-bg text-ol-amber',
  'bg-ol-purple-bg text-ol-purple',
]

/** Format token count into compact K/M notation. */
function formatTokenCount(value: number): string {
  if (value === 0) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

/** Default test context for each capability. */
const DEFAULT_TEST_CONTEXT: Record<string, string> = {
  'project.classify': 'package.json\nsrc/index.ts\ntsconfig.json\nREADME.md',
  'chat.suggestions': '我想要...',
  'chat.title': '用户：帮我写一个 React 组件\n助手：好的，我来帮你创建一个按钮组件...',
  'project.ephemeralName': '帮我分析这份销售数据，生成可视化图表',
  'git.commitMessage':
    "diff --git a/src/index.ts\n+export function hello() { return 'world' }",
  'text.translate': '你好世界，这是一个测试文本。',
}

export function AuxiliaryModelSettings() {
  const { t } = useTranslation('settings')
  const { basic } = useBasicConfig()
  const { providerItems } = useSettingsValues()
  const { models: cloudModels } = useCloudModels()
  const authLoggedIn = useSaasAuth((s) => s.loggedIn)
  const installedCliProviderIds = useInstalledCliProviderIds()
  const [loginOpen, setLoginOpen] = useState(false)

  const configQuery = useQuery(
    trpc.settings.getAuxiliaryModelConfig.queryOptions(),
  )
  const capabilitiesQuery = useQuery(
    trpc.settings.getAuxiliaryCapabilities.queryOptions(),
  )

  const [modelSource, setModelSource] = useState<'local' | 'saas'>('local')
  const [localModelIds, setLocalModelIds] = useState<string[]>([])
  const [customPrompts, setCustomPrompts] = useState<
    Record<string, string | null>
  >({})
  const [activeCapKey, setActiveCapKey] = useState<string>('')
  const [testDialogOpen, setTestDialogOpen] = useState(false)

  useEffect(() => {
    if (!configQuery.data) return
    const d = configQuery.data
    setModelSource(d.modelSource === 'cloud' ? 'local' : d.modelSource)
    setLocalModelIds(d.localModelIds)
    const prompts: Record<string, string | null> = {}
    for (const [key, val] of Object.entries(d.capabilities)) {
      prompts[key] = val.customPrompt ?? null
    }
    setCustomPrompts(prompts)
  }, [configQuery.data])

  useEffect(() => {
    if (activeCapKey || !capabilitiesQuery.data?.length) return
    setActiveCapKey(capabilitiesQuery.data[0].key)
  }, [activeCapKey, capabilitiesQuery.data])

  const isSaasSource = modelSource === 'saas'
  const showSaasLogin = isSaasSource && !authLoggedIn

  const chatModels = useMemo(
    () =>
      isSaasSource
        ? []
        : buildChatModelOptions('local', providerItems, cloudModels, installedCliProviderIds),
    [isSaasSource, providerItems, cloudModels, installedCliProviderIds],
  )

  const activeModelIds = localModelIds

  // SaaS quota from config query
  const saasQuota = configQuery.data?.quota

  const saveMutation = useMutation(
    trpc.settings.saveAuxiliaryModelConfig.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAuxiliaryModelConfig.queryKey(),
        })
        toast.success(t('auxiliaryModel.saved'))
      },
      onError: (err) => {
        toast.error(t('auxiliaryModel.saveFailed', { error: err.message }))
      },
    }),
  )

  const handleSave = useCallback(() => {
    const capabilities: Record<string, { customPrompt?: string | null }> = {}
    for (const [key, val] of Object.entries(customPrompts)) {
      if (val !== null) {
        capabilities[key] = { customPrompt: val }
      }
    }
    saveMutation.mutate({
      modelSource,
      localModelIds,
      cloudModelIds: [],
      capabilities,
    })
  }, [modelSource, localModelIds, customPrompts, saveMutation])

  const handleModelToggle = useCallback(
    (modelId: string, checked: boolean) => {
      setLocalModelIds((prev) => {
        if (checked) return [...prev, modelId]
        return prev.filter((id) => id !== modelId)
      })
    },
    [],
  )

  const activeCap = useMemo(
    () => capabilitiesQuery.data?.find((c) => c.key === activeCapKey),
    [capabilitiesQuery.data, activeCapKey],
  )

  const currentPrompt = useMemo(() => {
    if (!activeCap) return ''
    const custom = customPrompts[activeCap.key]
    return custom ?? activeCap.defaultPrompt
  }, [activeCap, customPrompts])

  const isCustomized = useMemo(() => {
    if (!activeCap) return false
    return customPrompts[activeCap.key] != null
  }, [activeCap, customPrompts])

  const handlePromptChange = useCallback(
    (value: string) => {
      if (!activeCap) return
      setCustomPrompts((prev) => ({ ...prev, [activeCap.key]: value }))
    },
    [activeCap],
  )

  const handleResetPrompt = useCallback(() => {
    if (!activeCap) return
    setCustomPrompts((prev) => {
      const next = { ...prev }
      delete next[activeCap.key]
      return next
    })
  }, [activeCap])

  if (configQuery.isLoading || capabilitiesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
        {t('auxiliaryModel.loading')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Section 1: Model selection */}
      <OpenLoafSettingsGroup
        title={t('auxiliaryModel.modelTitle')}
        icon={<Cpu className="h-4 w-4" />}
        subtitle={t('auxiliaryModel.modelSubtitle')}
      >
        <div className="divide-y divide-border/40">
          {/* Source row */}
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('auxiliaryModel.modelSource')}</div>
              <div className="text-xs text-muted-foreground">
                {t('auxiliaryModel.modelSourceHint')}
              </div>
            </div>
            <OpenLoafSettingsField className="shrink-0 justify-end">
              <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
                <FilterTab
                  text={t('auxiliaryModel.sourceLocal')}
                  selected={modelSource === 'local'}
                  onSelect={() => setModelSource('local')}
                  icon={<HardDrive className="h-3 w-3 text-ol-amber" />}
                  layoutId="aux-model-source"
                />
                <FilterTab
                  text={t('auxiliaryModel.sourceSaas')}
                  selected={modelSource === 'saas'}
                  onSelect={() => setModelSource('saas')}
                  icon={<Sparkles className="h-3 w-3 text-ol-purple" />}
                  layoutId="aux-model-source"
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          {/* SaaS info / Model picker row */}
          {isSaasSource ? (
            <div className="flex flex-col gap-2.5 py-3">
              {showSaasLogin ? (
                /* Not logged in — show login prompt */
                <div className="flex items-center gap-3 rounded-xl border border-ol-purple/20 bg-ol-purple/5 px-4 py-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-ol-purple" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{t('auxiliaryModel.needLogin')}</p>
                    <p className="text-xs text-muted-foreground">{t('auxiliaryModel.needLoginHint')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full px-4 text-xs transition-colors duration-150"
                    onClick={() => setLoginOpen(true)}
                  >
                    {t('auxiliaryModel.login')}
                  </Button>
                </div>
              ) : (
                /* Logged in — show SaaS info + quota */
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 rounded-xl border border-ol-purple/20 bg-ol-purple/5 px-4 py-3">
                    <Sparkles className="h-4 w-4 shrink-0 text-ol-purple" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{t('auxiliaryModel.saasProvided')}</p>
                      <p className="text-xs text-muted-foreground">{t('auxiliaryModel.saasProvidedHint')}</p>
                    </div>
                  </div>
                  {saasQuota && (
                    <SaasQuotaBar quota={saasQuota} />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('auxiliaryModel.useModel')}</div>
                <div className="text-xs text-muted-foreground">
                  {activeModelIds.length === 0
                    ? t('auxiliaryModel.autoModel')
                    : t('auxiliaryModel.selectedModels', { count: activeModelIds.length })}
                </div>
              </div>
              <OpenLoafSettingsField className="shrink-0 justify-end">
                <ModelSelector
                  models={chatModels}
                  value={activeModelIds}
                  onChange={handleModelToggle}
                />
              </OpenLoafSettingsField>
            </div>
          )}
        </div>
      </OpenLoafSettingsGroup>

      {/* Section 2: Capabilities */}
      {capabilitiesQuery.data && capabilitiesQuery.data.length > 0 && (
        <OpenLoafSettingsGroup
          title={t('auxiliaryModel.capTitle')}
          icon={<Zap className="h-4 w-4" />}
          subtitle={t('auxiliaryModel.capSubtitle')}
          className="flex-1 min-h-0 flex flex-col"
          cardProps={{
            className: "flex-1 min-h-0 flex flex-col",
            contentClassName: "flex-1 min-h-0",
          }}
        >
          <div className="flex h-full min-h-0 gap-0">
            {/* Left: capability list */}
            <div className="w-44 shrink-0 overflow-y-auto border-r border-border/60">
              <div className="py-1">
                {capabilitiesQuery.data.map((cap) => {
                  const mapping = CAP_ICON_MAP[cap.key]
                  const Icon = mapping?.icon ?? Sparkles
                  const iconColor = mapping?.color ?? 'text-muted-foreground'
                  const isActive = activeCapKey === cap.key
                  const hasCustom = customPrompts[cap.key] != null
                  return (
                    <button
                      key={cap.key}
                      type="button"
                      onClick={() => setActiveCapKey(cap.key)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-1.5 py-2 text-left text-xs transition-colors duration-150',
                        isActive
                          ? 'bg-accent/80 text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
                      <span className="truncate">{t(`auxiliaryCapabilities.${cap.key}.label`, { defaultValue: cap.label })}</span>
                      {hasCustom && (
                        <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-ol-blue-bg">
                          <Check className="h-2.5 w-2.5 text-ol-blue" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: active capability detail */}
            <div className="min-w-0 flex-1 min-h-0 flex flex-col gap-3 p-3">
              {activeCap && (
                <>
                  {/* Header */}
                  <div className="flex shrink-0 items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {(() => {
                          const mapping = CAP_ICON_MAP[activeCap.key]
                          const Icon = mapping?.icon ?? Sparkles
                          const iconColor = mapping?.color ?? 'text-muted-foreground'
                          return <Icon className={cn('h-4 w-4', iconColor)} />
                        })()}
                        {t(`auxiliaryCapabilities.${activeCap.key}.label`, { defaultValue: activeCap.label })}
                        {activeCap.outputMode && OUTPUT_MODE_CLASS[activeCap.outputMode] && (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                              OUTPUT_MODE_CLASS[activeCap.outputMode],
                            )}
                          >
                            {t(`auxiliaryModel.${activeCap.outputMode === 'tool-call' ? 'toolCall' : activeCap.outputMode === 'structured' ? 'structuredOutput' : activeCap.outputMode === 'text' ? 'plainText' : 'useSkills'}`)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t(`auxiliaryCapabilities.${activeCap.key}.description`, { defaultValue: activeCap.description })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-full bg-ol-blue-bg px-2.5 text-xs text-ol-blue hover:bg-ol-blue-bg-hover transition-colors duration-150"
                        onClick={() => setTestDialogOpen(true)}
                      >
                        <Play className="h-3 w-3" />
                        {t('auxiliaryModel.test')}
                      </Button>
                      {isCustomized && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
                          onClick={handleResetPrompt}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t('auxiliaryModel.resetDefault')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Trigger scenarios */}
                  <div className="shrink-0">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('auxiliaryModel.triggerScene')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(t(`auxiliaryCapabilities.${activeCap.key}.triggers`, { returnObjects: true, defaultValue: activeCap.triggers }) as string[]).map((trigger, idx) => (
                        <span
                          key={trigger}
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium',
                            TRIGGER_COLORS[idx % TRIGGER_COLORS.length],
                          )}
                        >
                          {trigger}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Prompt editor */}
                  <div className="flex flex-1 min-h-0 flex-col gap-1.5">
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{t('auxiliaryModel.prompt')}</span>
                      <span className="text-[10px] text-muted-foreground/50">{currentPrompt.length}</span>
                      {isCustomized && (
                        <span className="rounded-full bg-ol-amber-bg px-1.5 py-px text-[10px] font-medium text-ol-amber">
                          {t('auxiliaryModel.modified')}
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={currentPrompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      className="flex-1 min-h-0 resize-none rounded-lg border-border/60 bg-background/50 font-mono text-xs leading-relaxed focus-visible:ring-1 focus-visible:ring-ring/50"
                      placeholder={t('auxiliaryModel.promptPlaceholder')}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </OpenLoafSettingsGroup>
      )}

      {/* Save bar */}
      <div className="flex shrink-0 items-center justify-end gap-2 pt-0.5">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          size="sm"
          className="rounded-full px-5 transition-colors duration-150"
        >
          {saveMutation.isPending ? t('auxiliaryModel.saving') : t('auxiliaryModel.save')}
        </Button>
      </div>

      {activeCap && (
        <TestCapabilityDialog
          open={testDialogOpen}
          onOpenChange={setTestDialogOpen}
          capabilityKey={activeCap.key}
          capabilityLabel={t(`auxiliaryCapabilities.${activeCap.key}.label`, { defaultValue: activeCap.label })}
          outputMode={activeCap.outputMode}
          currentPrompt={currentPrompt}
        />
      )}

      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  )
}

/** Dialog for testing an auxiliary capability. */
function TestCapabilityDialog({
  open,
  onOpenChange,
  capabilityKey,
  capabilityLabel,
  outputMode,
  currentPrompt,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilityKey: string
  capabilityLabel: string
  outputMode: string
  currentPrompt: string
}) {
  const { t } = useTranslation('settings')
  const [context, setContext] = useState('')
  const [result, setResult] = useState<{
    ok: boolean
    result: unknown
    error?: string
    durationMs: number
    usage?: {
      inputTokens: number
      cachedInputTokens: number
      outputTokens: number
      totalTokens: number
    }
  } | null>(null)
  const initializedRef = useRef(false)

  // Reset on open (not on close) per component-guidelines §6.
  useEffect(() => {
    if (open) {
      if (!initializedRef.current) {
        setContext(DEFAULT_TEST_CONTEXT[capabilityKey] ?? '')
        initializedRef.current = true
      }
      setResult(null)
    } else {
      initializedRef.current = false
    }
  }, [open, capabilityKey])

  const testMutation = useMutation(
    trpc.settings.testAuxiliaryCapability.mutationOptions({
      onSuccess: (data) => setResult(data),
      onError: (err) => {
        setResult({
          ok: false,
          result: null,
          error: err.message,
          durationMs: 0,
        })
      },
    }),
  )

  const handleRun = () => {
    setResult(null)
    testMutation.mutate({
      capabilityKey,
      context,
      customPrompt: currentPrompt,
    })
  }

  const isText = outputMode === 'text'
  const capIcon = CAP_ICON_MAP[capabilityKey]
  const Icon = capIcon?.icon ?? Sparkles
  const iconColor = capIcon?.color ?? 'text-muted-foreground'
  const badgeClass = OUTPUT_MODE_CLASS[outputMode]
  const badgeLabel = outputMode === 'tool-call'
    ? t('auxiliaryModel.toolCall')
    : outputMode === 'structured'
      ? t('auxiliaryModel.structuredOutput')
      : outputMode === 'text'
        ? t('auxiliaryModel.plainText')
        : outputMode === 'skill'
          ? t('auxiliaryModel.useSkills')
          : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg sm:rounded-2xl">
        {/* Header — 半透明玻璃层 */}
        <div className="flex items-center gap-3 border-b border-border/40 bg-muted/30 px-5 py-4 backdrop-blur-sm">
          <div className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
            'bg-background/80 shadow-sm ring-1 ring-border/30',
          )}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                {t('auxiliaryModel.testDialogTitle', { label: capabilityLabel })}
                {badgeClass && badgeLabel && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium',
                    badgeClass,
                  )}>
                    {badgeLabel}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              {t('auxiliaryModel.testDialogSubtitle')}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Input section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80">{t('auxiliaryModel.testInput')}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground/50">
                {context.length}
              </span>
            </div>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={5}
              className={cn(
                'resize-none rounded-xl border-border/50 bg-muted/20 font-mono text-xs leading-relaxed shadow-none',
                'placeholder:text-muted-foreground/40',
                'focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70',
                'transition-colors duration-200',
              )}
              placeholder={t('auxiliaryModel.promptPlaceholder')}
            />
          </div>

          {/* Result section */}
          {result && (
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-medium text-foreground/80">{t('auxiliaryModel.testOutput')}</span>

              {/* Result content */}
              {result.ok ? (
                isText ? (
                  <div className="rounded-xl border border-border/30 bg-muted/15 p-3.5 text-xs leading-relaxed whitespace-pre-wrap">
                    {String(result.result)}
                  </div>
                ) : (
                  <pre className="max-h-52 overflow-auto rounded-xl border border-border/30 bg-muted/15 p-3.5 font-mono text-xs leading-relaxed">
                    {JSON.stringify(result.result, null, 2)}
                  </pre>
                )
              ) : (
                <div className="rounded-xl border border-ol-red/15 bg-ol-red/5 p-3.5 text-xs leading-relaxed text-ol-red">
                  {result.error ?? t('auxiliaryModel.testFailed')}
                </div>
              )}

              {/* Stats — below content */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium',
                  result.ok
                    ? 'bg-ol-green-bg text-ol-green'
                    : 'bg-ol-red-bg text-ol-red',
                )}>
                  {result.ok ? t('auxiliaryModel.testSuccess') : t('auxiliaryModel.testFailed')}
                </span>
                <span className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums',
                  result.durationMs < 1000
                    ? 'bg-ol-green-bg text-ol-green'
                    : result.durationMs < 3000
                      ? 'bg-ol-amber-bg text-ol-amber'
                      : 'bg-ol-red-bg text-ol-red',
                )}>
                  {result.durationMs < 1000
                    ? t('auxiliaryModel.testDuration', { duration: result.durationMs })
                    : t('auxiliaryModel.testDurationSec', { duration: (result.durationMs / 1000).toFixed(1) })}
                </span>
                {result.usage && result.usage.totalTokens > 0 && (
                  <>
                    <span className="h-3 w-px bg-border/40" />
                    <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                      <span>{t('auxiliaryModel.tokenInput')} <span className="font-medium text-foreground/60">{formatTokenCount(result.usage.inputTokens)}</span></span>
                      {result.usage.cachedInputTokens > 0 && (
                        <span>{t('auxiliaryModel.tokenCached')} <span className="font-medium text-foreground/60">{formatTokenCount(result.usage.cachedInputTokens)}</span></span>
                      )}
                      <span>{t('auxiliaryModel.tokenOutput')} <span className="font-medium text-foreground/60">{formatTokenCount(result.usage.outputTokens)}</span></span>
                      <span className="font-medium text-foreground/60">{t('auxiliaryModel.tokenTotal', { total: formatTokenCount(result.usage.totalTokens) })}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer — 动作区 */}
        <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-muted/15 px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
            onClick={() => onOpenChange(false)}
          >
            {t('common:close')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'gap-1.5 rounded-full bg-ol-blue-bg px-5 text-xs text-ol-blue hover:bg-ol-blue-bg-hover transition-all duration-200',
              testMutation.isPending && 'opacity-80',
            )}
            onClick={handleRun}
            disabled={testMutation.isPending || !context.trim()}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {testMutation.isPending ? t('auxiliaryModel.testRunning') : t('auxiliaryModel.test')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Model multi-select popover with capsule trigger. */
function ModelSelector({
  models,
  value,
  onChange,
}: {
  models: ProviderModelOption[]
  value: string[]
  onChange: (modelId: string, checked: boolean) => void
}) {
  const { t } = useTranslation('settings')
  const [open, setOpen] = useState(false)
  const selectedCount = value.length
  const firstSelected = selectedCount === 1
    ? models.find((m) => m.id === value[0])
    : undefined
  const label =
    selectedCount === 0
      ? t('auxiliaryModel.autoLabel')
      : selectedCount === 1
        ? firstSelected?.modelDefinition?.name ?? firstSelected?.modelId ?? value[0]
        : t('auxiliaryModel.selectedCountLabel', { count: selectedCount })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3.5 text-xs transition-colors duration-150"
        >
          <span className="max-w-[140px] truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" align="end">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {models.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('auxiliaryModel.noModel')}
            </p>
          )}
          {models.map((model) => {
            const checked = value.includes(model.id)
            return (
              <label
                key={model.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors duration-150',
                  checked
                    ? 'bg-accent/60 text-accent-foreground'
                    : 'hover:bg-accent/40',
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => onChange(model.id, !!c)}
                  className="shrink-0"
                />
                <ModelIcon model={model.modelId} icon={model.providerId} size={16} />
                <span className="min-w-0 truncate">
                  {model.modelDefinition?.name ?? model.modelId}
                </span>
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** SaaS daily quota progress bar. */
function SaasQuotaBar({ quota }: { quota: { used: number; limit: number; remaining: number; resetsAt: string } }) {
  const { t } = useTranslation('settings')
  const pct = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0
  const isWarning = pct >= 90
  const isExhausted = quota.remaining <= 0

  const barColor = isExhausted
    ? 'bg-ol-red'
    : isWarning
      ? 'bg-ol-amber'
      : 'bg-ol-purple'

  const textColor = isExhausted
    ? 'text-ol-red'
    : isWarning
      ? 'text-ol-amber'
      : 'text-muted-foreground'

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-medium', textColor)}>
          {t('auxiliaryModel.quotaUsed', { used: quota.used, limit: quota.limit })}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {t('auxiliaryModel.quotaRemaining', { remaining: quota.remaining })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/30">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {isExhausted && (
        <p className="text-[11px] text-ol-red">
          {t('auxiliaryModel.quotaExhausted')}
        </p>
      )}
    </div>
  )
}
