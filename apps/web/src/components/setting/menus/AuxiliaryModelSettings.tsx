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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryClient, trpc } from '@/utils/trpc'
import { Button } from '@openloaf/ui/button'
import { Textarea } from '@openloaf/ui/textarea'
import { FilterTab } from '@openloaf/ui/filter-tab'
import { OpenLoafSettingsGroup } from '@openloaf/ui/openloaf/OpenLoafSettingsGroup'
import { OpenLoafSettingsField } from '@openloaf/ui/openloaf/OpenLoafSettingsField'
import {
  Cloud,
  Cpu,
  HardDrive,
  RotateCcw,
  ChevronDown,
  FolderKanban,
  MessageSquareText,
  FileText,
  Folder,
  GitCommitHorizontal,
  Sparkles,
  Zap,
  Check,
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
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/** Capability key → icon + color mapping. */
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  'project.classify': { icon: FolderKanban, color: 'text-sky-500 dark:text-sky-400' },
  'chat.suggestions': { icon: MessageSquareText, color: 'text-violet-500 dark:text-violet-400' },
  'chat.title': { icon: FileText, color: 'text-amber-500 dark:text-amber-400' },
  'project.ephemeralName': { icon: Folder, color: 'text-emerald-500 dark:text-emerald-400' },
  'git.commitMessage': { icon: GitCommitHorizontal, color: 'text-orange-500 dark:text-orange-400' },
}

export function AuxiliaryModelSettings() {
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

  const [modelSource, setModelSource] = useState<'local' | 'cloud'>('local')
  const [localModelIds, setLocalModelIds] = useState<string[]>([])
  const [cloudModelIds, setCloudModelIds] = useState<string[]>([])
  const [customPrompts, setCustomPrompts] = useState<
    Record<string, string | null>
  >({})
  const [activeCapKey, setActiveCapKey] = useState<string>('')

  useEffect(() => {
    if (!configQuery.data) return
    const d = configQuery.data
    setModelSource(d.modelSource)
    setLocalModelIds(d.localModelIds)
    setCloudModelIds(d.cloudModelIds)
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

  const isCloudSource = modelSource === 'cloud'
  const showCloudLogin = isCloudSource && !authLoggedIn

  const chatModels = useMemo(
    () =>
      buildChatModelOptions(
        modelSource,
        providerItems,
        cloudModels,
        installedCliProviderIds,
      ),
    [modelSource, providerItems, cloudModels, installedCliProviderIds],
  )

  const activeModelIds = isCloudSource ? cloudModelIds : localModelIds

  const saveMutation = useMutation(
    trpc.settings.saveAuxiliaryModelConfig.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAuxiliaryModelConfig.queryKey(),
        })
        toast.success('辅助模型配置已保存')
      },
      onError: (err) => {
        toast.error(`保存失败: ${err.message}`)
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
      cloudModelIds,
      capabilities,
    })
  }, [modelSource, localModelIds, cloudModelIds, customPrompts, saveMutation])

  const handleModelToggle = useCallback(
    (modelId: string, checked: boolean) => {
      const setter = isCloudSource ? setCloudModelIds : setLocalModelIds
      setter((prev) => {
        if (checked) return [...prev, modelId]
        return prev.filter((id) => id !== modelId)
      })
    },
    [isCloudSource],
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
        加载中...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Section 1: Model selection */}
      <OpenLoafSettingsGroup
        title="模型选择"
        icon={<Cpu className="h-4 w-4" />}
        subtitle="选择用于辅助推理的模型，推断失败时会静默兜底，不影响主流程。"
      >
        <div className="divide-y divide-border">
          {/* Source row */}
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">模型来源</div>
              <div className="text-xs text-muted-foreground">
                选择本地部署或云端模型服务
              </div>
            </div>
            <OpenLoafSettingsField className="shrink-0 justify-end">
              <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
                <FilterTab
                  text="本地"
                  selected={!isCloudSource}
                  onSelect={() => setModelSource('local')}
                  icon={<HardDrive className="h-3 w-3 text-amber-500" />}
                  layoutId="aux-model-source"
                />
                <FilterTab
                  text="云端"
                  selected={isCloudSource}
                  onSelect={() => setModelSource('cloud')}
                  icon={<Cloud className="h-3 w-3 text-sky-500" />}
                  layoutId="aux-model-source"
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          {/* Model picker row */}
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">使用模型</div>
              <div className="text-xs text-muted-foreground">
                {activeModelIds.length === 0
                  ? '未指定，将自动选择可用模型'
                  : `已选 ${activeModelIds.length} 个模型`}
              </div>
            </div>
            <OpenLoafSettingsField className="shrink-0 justify-end">
              <ModelSelector
                models={chatModels}
                value={activeModelIds}
                showCloudLogin={showCloudLogin}
                onChange={handleModelToggle}
                onOpenLogin={() => setLoginOpen(true)}
              />
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      {/* Section 2: Capabilities */}
      {capabilitiesQuery.data && capabilitiesQuery.data.length > 0 && (
        <OpenLoafSettingsGroup
          title="能力配置"
          icon={<Zap className="h-4 w-4" />}
          subtitle="辅助模型在以下场景被调用，你可以自定义每个能力的提示词。"
        >
          <div className="flex gap-0">
            {/* Left: capability list */}
            <div className="w-36 shrink-0 border-r border-border/60">
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
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors duration-150',
                        isActive
                          ? 'bg-accent/80 text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
                      <span className="truncate">{cap.label}</span>
                      {hasCustom && (
                        <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/15 dark:bg-sky-400/15">
                          <Check className="h-2.5 w-2.5 text-sky-600 dark:text-sky-400" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: active capability detail */}
            <div className="min-w-0 flex-1 p-3 space-y-3">
              {activeCap && (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {(() => {
                          const mapping = CAP_ICON_MAP[activeCap.key]
                          const Icon = mapping?.icon ?? Sparkles
                          const iconColor = mapping?.color ?? 'text-muted-foreground'
                          return <Icon className={cn('h-4 w-4', iconColor)} />
                        })()}
                        {activeCap.label}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activeCap.description}
                      </p>
                    </div>
                    {isCustomized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
                        onClick={handleResetPrompt}
                      >
                        <RotateCcw className="h-3 w-3" />
                        恢复默认
                      </Button>
                    )}
                  </div>

                  {/* Prompt editor */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">提示词</span>
                      {isCustomized && (
                        <span className="rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          已修改
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={currentPrompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      className="min-h-[180px] resize-y rounded-lg border-border/60 bg-background/50 font-mono text-xs leading-relaxed focus-visible:ring-1 focus-visible:ring-ring/50"
                      placeholder="输入自定义提示词..."
                    />
                  </div>

                  {/* Trigger scenarios */}
                  <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">触发场景</p>
                    <ul className="space-y-1">
                      {activeCap.triggers.map((trigger) => (
                        <li
                          key={trigger}
                          className="flex items-baseline gap-2 text-xs text-muted-foreground/80"
                        >
                          <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/30" />
                          {trigger}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </OpenLoafSettingsGroup>
      )}

      {/* Save bar */}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          size="sm"
          className="rounded-full px-5 transition-colors duration-150"
        >
          {saveMutation.isPending ? '保存中...' : '保存配置'}
        </Button>
      </div>

      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  )
}

/** Model multi-select popover with capsule trigger. */
function ModelSelector({
  models,
  value,
  showCloudLogin,
  onChange,
  onOpenLogin,
}: {
  models: ProviderModelOption[]
  value: string[]
  showCloudLogin: boolean
  onChange: (modelId: string, checked: boolean) => void
  onOpenLogin: () => void
}) {
  const [open, setOpen] = useState(false)
  const selectedCount = value.length
  const firstSelected = selectedCount === 1
    ? models.find((m) => m.id === value[0])
    : undefined
  const label =
    selectedCount === 0
      ? '自动'
      : selectedCount === 1
        ? firstSelected?.modelDefinition?.name ?? firstSelected?.modelId ?? value[0]
        : `${selectedCount} 个模型`

  if (showCloudLogin) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-full px-4 text-xs transition-colors duration-150"
        onClick={onOpenLogin}
      >
        登录以使用云端模型
      </Button>
    )
  }

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
              暂无可用模型
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
