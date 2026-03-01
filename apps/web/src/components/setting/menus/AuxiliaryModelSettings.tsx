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

/** Output mode → badge style + label mapping. */
const OUTPUT_MODE_BADGE: Record<string, { label: string; className: string }> = {
  structured: {
    label: '结构化输出',
    className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  text: {
    label: '纯文本',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  'tool-call': {
    label: '工具调用',
    className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  skill: {
    label: '使用技能',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
}

/** Capability key → icon + color mapping. */
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  'project.classify': { icon: FolderKanban, color: 'text-sky-500 dark:text-sky-400' },
  'chat.suggestions': { icon: MessageSquareText, color: 'text-violet-500 dark:text-violet-400' },
  'chat.title': { icon: FileText, color: 'text-amber-500 dark:text-amber-400' },
  'project.ephemeralName': { icon: Folder, color: 'text-emerald-500 dark:text-emerald-400' },
  'git.commitMessage': { icon: GitCommitHorizontal, color: 'text-orange-500 dark:text-orange-400' },
  'text.translate': { icon: Languages, color: 'text-teal-500 dark:text-teal-400' },
}

/** Flat color palette for trigger scenario badges. */
const TRIGGER_COLORS = [
  'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
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

  const [modelSource, setModelSource] = useState<'local' | 'cloud' | 'saas'>('local')
  const [localModelIds, setLocalModelIds] = useState<string[]>([])
  const [cloudModelIds, setCloudModelIds] = useState<string[]>([])
  const [customPrompts, setCustomPrompts] = useState<
    Record<string, string | null>
  >({})
  const [activeCapKey, setActiveCapKey] = useState<string>('')
  const [testDialogOpen, setTestDialogOpen] = useState(false)

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
  const isSaasSource = modelSource === 'saas'
  const showCloudLogin = isCloudSource && !authLoggedIn
  const showSaasLogin = isSaasSource && !authLoggedIn

  const chatModels = useMemo(
    () =>
      isSaasSource
        ? []
        : buildChatModelOptions(
            modelSource === 'cloud' ? 'cloud' : 'local',
            providerItems,
            cloudModels,
            installedCliProviderIds,
          ),
    [modelSource, isSaasSource, providerItems, cloudModels, installedCliProviderIds],
  )

  const activeModelIds = isCloudSource ? cloudModelIds : localModelIds

  // SaaS quota from config query
  const saasQuota = configQuery.data?.quota

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
    <div className="flex h-full flex-col gap-5">
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
                选择本地部署、云端模型或 SaaS 辅助模型
              </div>
            </div>
            <OpenLoafSettingsField className="shrink-0 justify-end">
              <div className="flex items-center rounded-full border border-border/70 bg-muted/40">
                <FilterTab
                  text="本地"
                  selected={modelSource === 'local'}
                  onSelect={() => setModelSource('local')}
                  icon={<HardDrive className="h-3 w-3 text-amber-500" />}
                  layoutId="aux-model-source"
                />
                <FilterTab
                  text="云端"
                  selected={modelSource === 'cloud'}
                  onSelect={() => setModelSource('cloud')}
                  icon={<Cloud className="h-3 w-3 text-sky-500" />}
                  layoutId="aux-model-source"
                />
                <FilterTab
                  text="SaaS"
                  selected={modelSource === 'saas'}
                  onSelect={() => setModelSource('saas')}
                  icon={<Sparkles className="h-3 w-3 text-violet-500" />}
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
                <div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">需要登录云端账号</p>
                    <p className="text-xs text-muted-foreground">SaaS 辅助模型需要登录后使用，无需额外配置</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full px-4 text-xs transition-colors duration-150"
                    onClick={() => setLoginOpen(true)}
                  >
                    登录
                  </Button>
                </div>
              ) : (
                /* Logged in — show SaaS info + quota */
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                    <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">SaaS 提供的辅助模型</p>
                      <p className="text-xs text-muted-foreground">零配置，由 SaaS 平台提供模型服务，按日计费</p>
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
          )}
        </div>
      </OpenLoafSettingsGroup>

      {/* Section 2: Capabilities */}
      {capabilitiesQuery.data && capabilitiesQuery.data.length > 0 && (
        <OpenLoafSettingsGroup
          title="能力配置"
          icon={<Zap className="h-4 w-4" />}
          subtitle="辅助模型在以下场景被调用，你可以自定义每个能力的提示词。"
          className="flex-1 min-h-0 flex flex-col"
          cardProps={{
            className: "flex-1 min-h-0 flex flex-col",
            contentClassName: "flex-1 min-h-0",
          }}
        >
          <div className="flex h-full min-h-0 gap-0">
            {/* Left: capability list */}
            <div className="w-36 shrink-0 overflow-y-auto border-r border-border/60">
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
                        {activeCap.label}
                        {activeCap.outputMode && OUTPUT_MODE_BADGE[activeCap.outputMode] && (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                              OUTPUT_MODE_BADGE[activeCap.outputMode].className,
                            )}
                          >
                            {OUTPUT_MODE_BADGE[activeCap.outputMode].label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activeCap.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-full bg-sky-500/10 px-2.5 text-xs text-sky-600 hover:bg-sky-500/20 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition-colors duration-150"
                        onClick={() => setTestDialogOpen(true)}
                      >
                        <Play className="h-3 w-3" />
                        测试
                      </Button>
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
                  </div>

                  {/* Trigger scenarios */}
                  <div className="shrink-0">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">触发场景</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeCap.triggers.map((trigger, idx) => (
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
                      <span className="text-xs font-medium text-muted-foreground">提示词</span>
                      <span className="text-[10px] text-muted-foreground/50">{currentPrompt.length} 字</span>
                      {isCustomized && (
                        <span className="rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          已修改
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={currentPrompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      className="flex-1 min-h-0 resize-none rounded-lg border-border/60 bg-background/50 font-mono text-xs leading-relaxed focus-visible:ring-1 focus-visible:ring-ring/50"
                      placeholder="输入自定义提示词..."
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
          {saveMutation.isPending ? '保存中...' : '保存配置'}
        </Button>
      </div>

      {activeCap && (
        <TestCapabilityDialog
          open={testDialogOpen}
          onOpenChange={setTestDialogOpen}
          capabilityKey={activeCap.key}
          capabilityLabel={activeCap.label}
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
  const badge = OUTPUT_MODE_BADGE[outputMode]

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
                测试：{capabilityLabel}
                {badge && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium',
                    badge.className,
                  )}>
                    {badge.label}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              输入测试上下文，运行辅助模型推理并查看输出结果
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Input section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80">输入上下文</span>
              <span className="text-[10px] tabular-nums text-muted-foreground/50">
                {context.length} 字
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
              placeholder="输入测试上下文..."
            />
          </div>

          {/* Result section */}
          {result && (
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-medium text-foreground/80">输出结果</span>

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
                <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-3.5 text-xs leading-relaxed text-red-600 dark:text-red-400">
                  {result.error || '未知错误'}
                </div>
              )}

              {/* Stats — below content */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium',
                  result.ok
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400',
                )}>
                  {result.ok ? '成功' : '失败'}
                </span>
                <span className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums',
                  result.durationMs < 1000
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : result.durationMs < 3000
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400',
                )}>
                  {result.durationMs < 1000
                    ? `${result.durationMs}ms`
                    : `${(result.durationMs / 1000).toFixed(1)}s`}
                </span>
                {result.usage && result.usage.totalTokens > 0 && (
                  <>
                    <span className="h-3 w-px bg-border/40" />
                    <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                      <span>输入 <span className="font-medium text-foreground/60">{formatTokenCount(result.usage.inputTokens)}</span></span>
                      {result.usage.cachedInputTokens > 0 && (
                        <span>缓存 <span className="font-medium text-foreground/60">{formatTokenCount(result.usage.cachedInputTokens)}</span></span>
                      )}
                      <span>输出 <span className="font-medium text-foreground/60">{formatTokenCount(result.usage.outputTokens)}</span></span>
                      <span className="font-medium text-foreground/60">共 {formatTokenCount(result.usage.totalTokens)}</span>
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
            关闭
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'gap-1.5 rounded-full bg-sky-500/10 px-5 text-xs text-sky-600 hover:bg-sky-500/20 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-500/15 dark:hover:text-sky-300 transition-all duration-200',
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
            {testMutation.isPending ? '运行中...' : '运行测试'}
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

/** SaaS daily quota progress bar. */
function SaasQuotaBar({ quota }: { quota: { used: number; limit: number; remaining: number; resetsAt: string } }) {
  const pct = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0
  const isWarning = pct >= 90
  const isExhausted = quota.remaining <= 0

  const barColor = isExhausted
    ? 'bg-red-500 dark:bg-red-400'
    : isWarning
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-violet-500 dark:bg-violet-400'

  const textColor = isExhausted
    ? 'text-red-600 dark:text-red-400'
    : isWarning
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground'

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-medium', textColor)}>
          今日已使用 {quota.used}/{quota.limit} 次
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          剩余 {quota.remaining} 次
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/30">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {isExhausted && (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          今日配额已用完，可切换为本地模型继续使用
        </p>
      )}
    </div>
  )
}
