/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient, trpc } from '@/utils/trpc'
import { useStackPanelSlot } from '@/hooks/use-stack-panel-slot'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import { Textarea } from '@openloaf/ui/textarea'
import { Switch } from '@openloaf/ui/switch'
import { Checkbox } from '@openloaf/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@openloaf/ui/tabs'
import { OpenLoafSettingsCard } from '@openloaf/ui/openloaf/OpenLoafSettingsCard'
import { FilterTab } from '@openloaf/ui/filter-tab'
import {
  Bot,
  Blocks,
  Calendar,
  Check,
  Cloud,
  Code,
  Edit3,
  FileSearch,
  FilePen,
  FolderOpen,
  Globe,
  HardDrive,
  HelpCircle,
  ChevronDown,
  Image,
  LayoutGrid,
  Link,
  Mail,
  Save,
  ScrollText,
  Settings,
  Sparkles,
  Terminal,
  FolderKanban,
  Users,
  Video,
  Gauge,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTabs } from '@/hooks/use-tabs'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { Tooltip, TooltipContent, TooltipTrigger } from '@openloaf/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@openloaf/ui/popover'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useMediaModels } from '@/hooks/use-media-models'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useCloudModels } from '@/hooks/use-cloud-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import ThinkingModeSelector, {
  type ThinkingMode,
} from '@/components/ai/input/ThinkingModeSelector'
import {
  buildChatModelOptions,
  normalizeChatModelSource,
} from '@/lib/provider-models'
import { getModelLabel } from '@/lib/model-registry'
import { ModelCheckboxItem } from '@/components/ai/input/model-preferences/ModelCheckboxItem'
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'
import type { AiModel } from '@openloaf-saas/sdk'
import type { ProviderModelOption } from '@/lib/provider-models'

/** 能力组 ID → 彩色图标映射 */
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  browser: { icon: Globe, className: 'text-blue-500' },
  'file-read': { icon: FileSearch, className: 'text-emerald-500' },
  'file-write': { icon: FilePen, className: 'text-green-600' },
  shell: { icon: Terminal, className: 'text-slate-500' },
  email: { icon: Mail, className: 'text-red-500' },
  calendar: { icon: Calendar, className: 'text-orange-500' },
  office: { icon: Edit3, className: 'text-teal-500' },
  'image-generate': { icon: Image, className: 'text-pink-500' },
  'video-generate': { icon: Video, className: 'text-purple-500' },
  widget: { icon: LayoutGrid, className: 'text-violet-500' },
  project: { icon: FolderKanban, className: 'text-cyan-500' },
  web: { icon: Link, className: 'text-sky-500' },
  agent: { icon: Users, className: 'text-indigo-500' },
  'code-interpreter': { icon: Code, className: 'text-amber-500' },
  system: { icon: Settings, className: 'text-slate-400' },
}

/** 能力组 ID → 扁平 pastel 背景色映射 */
const CAP_BG_MAP: Record<string, string> = {
  browser: 'bg-blue-50 dark:bg-blue-950/40',
  'file-read': 'bg-emerald-50 dark:bg-emerald-950/40',
  'file-write': 'bg-green-50 dark:bg-green-950/40',
  shell: 'bg-slate-50 dark:bg-slate-950/40',
  email: 'bg-red-50 dark:bg-red-950/40',
  calendar: 'bg-orange-50 dark:bg-orange-950/40',
  office: 'bg-teal-50 dark:bg-teal-950/40',
  'image-generate': 'bg-pink-50 dark:bg-pink-950/40',
  'video-generate': 'bg-purple-50 dark:bg-purple-950/40',
  widget: 'bg-violet-50 dark:bg-violet-950/40',
  project: 'bg-cyan-50 dark:bg-cyan-950/40',
  web: 'bg-sky-50 dark:bg-sky-950/40',
  agent: 'bg-indigo-50 dark:bg-indigo-950/40',
  'code-interpreter': 'bg-amber-50 dark:bg-amber-950/40',
  system: 'bg-gray-50 dark:bg-gray-950/40',
}

type AgentDetailPanelProps = {
  agentPath?: string
  scope?: 'workspace' | 'project' | 'global'
  projectId?: string
  isNew?: boolean
  isSystem?: boolean
  tabId?: string
  panelKey?: string
}

type CapabilityGroup = {
  id: string
  label: string
  description: string
  toolIds: string[]
  tools: CapabilityTool[]
}

type CapabilityTool = {
  id: string
  label: string
  description: string
}

type SkillSummary = {
  name: string
  description: string
  path: string
  folderName: string
  ignoreKey: string
  scope: 'workspace' | 'project' | 'global'
  isEnabled: boolean
  isDeletable: boolean
}

/** Snapshot of form values for dirty comparison. */
type FormSnapshot = {
  name: string
  description: string
  icon: string
  modelLocalIds: string[]
  modelCloudIds: string[]
  auxiliaryModelLocalIds: string[]
  auxiliaryModelCloudIds: string[]
  auxiliaryModelSource: string
  /** Selected image model ids (empty = Auto). */
  imageModelIds: string[]
  /** Selected video model ids (empty = Auto). */
  videoModelIds: string[]
  toolIds: string[]
  skills: string[]
  allowSubAgents: boolean
  maxDepth: number
  systemPrompt: string
}

function makeSnapshot(s: FormSnapshot): string {
  return JSON.stringify(s)
}

type MediaModelSelectProps = {
  /** Available model list. */
  models: AiModel[]
  /** Current selected model ids (empty = Auto). */
  value: string[]
  /** Disable selector interaction. */
  disabled?: boolean
  /** Auth state for SaaS models. */
  authLoggedIn: boolean
  /** Change handler. */
  onChange: (nextIds: string[]) => void
  /** Trigger login dialog. */
  onOpenLogin: () => void
  /** Empty list placeholder. */
  emptyText?: string
}

/** Media model selector used in agent settings. */
function MediaModelSelect({
  models,
  value,
  disabled,
  authLoggedIn,
  onChange,
  onOpenLogin,
  emptyText = '暂无可用模型',
}: MediaModelSelectProps) {
  const [open, setOpen] = useState(false)
  const normalizeValue = useCallback((items: string[]) => {
    const normalized = items.map((id) => id.trim()).filter(Boolean)
    return Array.from(new Set(normalized))
  }, [])
  const [localValue, setLocalValue] = useState<string[]>(
    () => normalizeValue(value),
  )
  const maxVisibleSelected = 2
  useEffect(() => {
    const next = normalizeValue(value)
    setLocalValue((prev) => {
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
        return prev
      }
      return next
    })
  }, [normalizeValue, value])
  const normalizedValue = localValue
  const modelMap = useMemo(() => {
    const map = new Map<string, AiModel>()
    for (const model of models) {
      map.set(model.id, model)
    }
    return map
  }, [models])
  const selectedItems = useMemo(
    () =>
      normalizedValue.map((id) => {
        const model = modelMap.get(id)
        return {
          id,
          icon: model?.familyId ?? model?.providerId ?? id,
          modelId: model?.id ?? id,
          label: model?.name ?? id,
        }
      }),
    [modelMap, normalizedValue],
  )
  const visibleSelectedItems = selectedItems.slice(0, maxVisibleSelected)
  const hiddenSelectedCount = Math.max(
    selectedItems.length - visibleSelectedItems.length,
    0,
  )

  const applyChange = useCallback(
    (nextIds: string[]) => {
      const next = normalizeValue(nextIds)
      setLocalValue(next)
      onChange(next)
    },
    [normalizeValue, onChange],
  )

  const handleToggle = useCallback(
    (nextId: string) => {
      if (normalizedValue.includes(nextId)) {
        applyChange(normalizedValue.filter((id) => id !== nextId))
        return
      }
      applyChange([...normalizedValue, nextId])
    },
    [applyChange, normalizedValue],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="h-8 w-fit max-w-full shrink min-w-0 justify-between rounded-full border border-border/60 bg-background/80 px-3 text-xs"
        >
          <span className="flex min-w-0 items-center gap-2">
            {normalizedValue.length > 0 ? (
              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                {visibleSelectedItems.map((item, index) => (
                  <span
                    key={item.id}
                    className="inline-flex min-w-0 items-center gap-1"
                  >
                    <ModelIcon
                      icon={item.icon}
                      model={item.modelId}
                      size={14}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="truncate">{item.label}</span>
                    {index < visibleSelectedItems.length - 1 ? (
                      <span className="text-muted-foreground">,</span>
                    ) : null}
                  </span>
                ))}
                {hiddenSelectedCount > 0 ? (
                  <span className="text-muted-foreground">+{hiddenSelectedCount}</span>
                ) : null}
              </span>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">Auto</span>
              </>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 rounded-xl border-border bg-background/90 p-2 shadow-xl backdrop-blur"
      >
        {!authLoggedIn ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setOpen(false)
                onOpenLogin()
              }}
            >
              登录OpenLoaf账户，使用云端模型
            </Button>
            <div className="text-xs text-muted-foreground">使用云端模型</div>
          </div>
        ) : models.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted/50"
              onClick={() => applyChange([])}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span className="flex-1 truncate">Auto</span>
              {normalizedValue.length === 0 ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
            </button>
            {models.map((model) => (
              <ModelCheckboxItem
                key={`${model.providerId ?? 'unknown'}-${model.id}`}
                icon={model.familyId ?? model.providerId ?? model.id}
                modelId={model.id}
                label={model.name ?? model.id}
                tags={model.tags as import('@openloaf/api/common').ModelTag[] | undefined}
                checked={normalizedValue.includes(model.id)}
                disabled={disabled}
                onToggle={() => handleToggle(model.id)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

type ChatModelSelectProps = {
  /** Available chat model options. */
  models: ProviderModelOption[]
  /** Current selected model ids (empty = Auto). */
  value: string[]
  /** Disable selector interaction. */
  disabled?: boolean
  /** Whether cloud source requires login. */
  showCloudLogin: boolean
  /** Change handler. */
  onChange: (nextIds: string[]) => void
  /** Trigger login dialog. */
  onOpenLogin: () => void
  /** Empty list placeholder. */
  emptyText?: string
}

/** Chat model selector used in agent settings. */
function ChatModelSelect({
  models,
  value,
  disabled,
  showCloudLogin,
  onChange,
  onOpenLogin,
  emptyText = '暂无可用模型',
}: ChatModelSelectProps) {
  const [open, setOpen] = useState(false)
  const normalizeValue = useCallback((items: string[]) => {
    const normalized = items.map((id) => id.trim()).filter(Boolean)
    return Array.from(new Set(normalized))
  }, [])
  const [localValue, setLocalValue] = useState<string[]>(
    () => normalizeValue(value),
  )
  const maxVisibleSelected = 2
  useEffect(() => {
    const next = normalizeValue(value)
    setLocalValue((prev) => {
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
        return prev
      }
      return next
    })
  }, [normalizeValue, value])
  const normalizedValue = localValue
  const optionMap = useMemo(() => {
    const map = new Map<string, ProviderModelOption>()
    for (const option of models) {
      map.set(option.id, option)
    }
    return map
  }, [models])
  const selectedItems = useMemo(
    () =>
      normalizedValue.map((id) => {
        const option = optionMap.get(id)
        const fallbackModelId = id.split(':').pop() || id
        const fallbackProviderId = id.includes(':') ? id.split(':')[0] : undefined
        const label = option?.modelDefinition
          ? getModelLabel(option.modelDefinition)
          : option?.modelId ?? fallbackModelId
        const icon =
          option?.modelDefinition?.familyId ??
          option?.modelDefinition?.icon ??
          option?.providerId ??
          fallbackProviderId
        return {
          id,
          label,
          icon,
          modelId: option?.modelId ?? fallbackModelId,
        }
      }),
    [normalizedValue, optionMap],
  )
  const visibleSelectedItems = selectedItems.slice(0, maxVisibleSelected)
  const hiddenSelectedCount = Math.max(
    selectedItems.length - visibleSelectedItems.length,
    0,
  )
  const applyChange = useCallback(
    (nextIds: string[]) => {
      const next = normalizeValue(nextIds)
      setLocalValue(next)
      onChange(next)
    },
    [normalizeValue, onChange],
  )

  const handleToggle = useCallback(
    (nextId: string) => {
      if (normalizedValue.includes(nextId)) {
        applyChange(normalizedValue.filter((id) => id !== nextId))
        return
      }
      applyChange([...normalizedValue, nextId])
    },
    [applyChange, normalizedValue],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="h-8 w-fit max-w-full shrink min-w-0 justify-between rounded-full border border-border/60 bg-background/80 px-3 text-xs"
        >
          <span className="flex min-w-0 items-center gap-2">
            {normalizedValue.length > 0 ? (
              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                {visibleSelectedItems.map((item, index) => (
                  <span
                    key={item.id}
                    className="inline-flex min-w-0 items-center gap-1"
                  >
                    <ModelIcon
                      icon={item.icon}
                      model={item.modelId}
                      size={14}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="truncate">{item.label}</span>
                    {index < visibleSelectedItems.length - 1 ? (
                      <span className="text-muted-foreground">,</span>
                    ) : null}
                  </span>
                ))}
                {hiddenSelectedCount > 0 ? (
                  <span className="text-muted-foreground">+{hiddenSelectedCount}</span>
                ) : null}
              </span>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">Auto</span>
              </>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 rounded-xl border-border bg-background/90 p-2 shadow-xl backdrop-blur"
      >
        {showCloudLogin ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setOpen(false)
                onOpenLogin()
              }}
            >
              登录OpenLoaf账户，使用云端模型
            </Button>
            <div className="text-xs text-muted-foreground">使用云端模型</div>
          </div>
        ) : models.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted/50"
              onClick={() => applyChange([])}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span className="flex-1 truncate">Auto</span>
              {normalizedValue.length === 0 ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
            </button>
            {models.map((option) => {
              const label = option.modelDefinition
                ? getModelLabel(option.modelDefinition)
                : option.modelId
              return (
                <ModelCheckboxItem
                  key={option.id}
                  icon={
                    option.modelDefinition?.familyId ??
                    option.modelDefinition?.icon ??
                    option.providerId
                  }
                  modelId={option.modelId}
                  label={label}
                  tags={option.tags}
                  checked={normalizedValue.includes(option.id)}
                  disabled={disabled}
                  onToggle={() => handleToggle(option.id)}
                />
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Agent detail / edit stack panel. */
export const AgentDetailPanel = memo(function AgentDetailPanel({
  agentPath,
  scope = 'workspace',
  projectId,
  isNew = false,
  isSystem = false,
}: AgentDetailPanelProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('bot')
  const [modelLocalIds, setModelLocalIds] = useState<string[]>([])
  const [modelCloudIds, setModelCloudIds] = useState<string[]>([])
  const [auxiliaryModelSource, setAuxiliaryModelSource] = useState('local')
  const [auxiliaryModelLocalIds, setAuxiliaryModelLocalIds] = useState<string[]>([])
  const [auxiliaryModelCloudIds, setAuxiliaryModelCloudIds] = useState<string[]>([])
  const [imageModelIds, setImageModelIds] = useState<string[]>([])
  const [videoModelIds, setVideoModelIds] = useState<string[]>([])
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('fast')
  const [localChatSource, setLocalChatSource] = useState<'local' | 'cloud'>('local')
  const [toolIds, setToolIds] = useState<string[]>([])
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [allowSubAgents, setAllowSubAgents] = useState(false)
  const [maxDepth, setMaxDepth] = useState(1)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [defaultSnapshot, setDefaultSnapshot] = useState('')

  // 逻辑：保存初始快照用于脏检测。
  const savedSnapshotRef = useRef('')
  const pendingSnapshotOverrideRef = useRef<string | null>(null)
  const silentSaveRef = useRef(false)
  const isDirtyRef = useRef(false)

  const panelSlot = useStackPanelSlot()
  const activeTabId = useTabs((s) => s.activeTabId)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const removeStackItem = useTabRuntime((s) => s.removeStackItem)
  const getRuntimeByTabId = useTabRuntime((s) => s.getRuntimeByTabId)
  const { loggedIn: authLoggedIn } = useSaasAuth()
  const { imageModels, videoModels } = useMediaModels()
  const { providerItems } = useSettingsValues()
  const { basic, setBasic } = useBasicConfig()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()

  // 逻辑：编辑模式下加载 Agent 详情。
  const detailQuery = useQuery({
    ...trpc.settings.getAgentDetail.queryOptions(
      agentPath && scope
        ? { agentPath, scope }
        : { agentPath: '', scope: 'workspace' },
    ),
    enabled: Boolean(agentPath) && !isNew,
  })
  const isMasterAgent = useMemo(() => {
    if (isNew) return false
    const folderName = detailQuery.data?.folderName ?? ''
    if (folderName) {
      return folderName === 'master'
    }
    if (!agentPath) return false
    const normalized = agentPath.replace(/\\/g, '/')
    return normalized.includes('/.openloaf/agents/master/')
  }, [agentPath, detailQuery.data, isNew])

  const baseChatSource = normalizeChatModelSource(basic.chatSource)
  const chatModelSource = isMasterAgent ? baseChatSource : localChatSource
  const isCloudSource = chatModelSource === 'cloud'
  const auxiliaryChatSource = normalizeChatModelSource(auxiliaryModelSource)
  const isAuxCloudSource = auxiliaryChatSource === 'cloud'
  const chatModels = useMemo(
    () =>
      buildChatModelOptions(
        chatModelSource,
        providerItems,
        cloudModels,
        installedCliProviderIds,
      ),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds],
  )
  const auxiliaryChatModels = useMemo(
    () =>
      buildChatModelOptions(
        auxiliaryChatSource,
        providerItems,
        cloudModels,
        installedCliProviderIds,
      ),
    [
      auxiliaryChatSource,
      providerItems,
      cloudModels,
      installedCliProviderIds,
    ],
  )
  const showChatCloudLogin = isCloudSource && !authLoggedIn
  const showAuxChatCloudLogin = isAuxCloudSource && !authLoggedIn
  const activeModelIds = isCloudSource ? modelCloudIds : modelLocalIds
  const activeAuxModelIds = isAuxCloudSource
    ? auxiliaryModelCloudIds
    : auxiliaryModelLocalIds
  const hasReasoningModel = useMemo(() => {
    if (!chatModels.length) return false
    const normalized = Array.from(
      new Set(activeModelIds.map((id) => id.trim()).filter(Boolean)),
    )
    if (normalized.length === 0) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }
    const selected = normalized
      .map((id) => chatModels.find((m) => m.id === id))
      .filter(Boolean)
    if (selected.length === 0) {
      return chatModels.some((m) => m.tags?.includes('reasoning'))
    }
    return selected.some((model) => model?.tags?.includes('reasoning'))
  }, [activeModelIds, chatModels])

  const getSavedSnapshot = useCallback(() => {
    if (!savedSnapshotRef.current) return null
    try {
      return JSON.parse(savedSnapshotRef.current) as FormSnapshot
    } catch {
      return null
    }
  }, [])

  // 逻辑：打开 Agent 所在文件夹。
  const handleOpenFolder = useCallback(() => {
    if (!agentPath) return
    const normalized = agentPath.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    const dirPath = lastSlash >= 0 ? normalized.slice(0, lastSlash) : normalized
    const dirUri = dirPath.startsWith('file://') ? dirPath : (/^[A-Za-z]:\//.test(dirPath) ? `file:///${dirPath}` : `file://${dirPath}`)

    const api = window.openloafElectron
    if (api?.openPath) {
      void api.openPath({ uri: dirUri }).then((res) => {
        if (!res?.ok) toast.error(res?.reason ?? '无法打开文件夹')
      })
      return
    }
    if (activeTabId) {
      pushStackItem(activeTabId, {
        id: `agent-folder:${agentPath}`,
        sourceKey: `agent-folder:${agentPath}`,
        component: 'folder-tree-preview',
        title: `Agent助手 · ${name || 'folder'}`,
        params: {
          rootUri: dirUri,
          currentUri: '',
          projectId: scope === 'project' ? projectId : undefined,
        },
      })
    }
  }, [agentPath, activeTabId, pushStackItem, name, scope, projectId])

  // 逻辑：加载能力组列表。
  const capGroupsQuery = useQuery(
    trpc.settings.getCapabilityGroups.queryOptions(),
  )
  const capGroups = (capGroupsQuery.data ?? []) as CapabilityGroup[]
  const visibleCapGroups = useMemo(
    () =>
      capGroups.filter(
        (group) =>
          !['image-generate', 'video-generate', 'agent'].includes(group.id),
      ),
    [capGroups],
  )
  const toolIdSet = useMemo(() => new Set(toolIds), [toolIds])
  const expandedGroupSet = useMemo(
    () => new Set(expandedGroupIds),
    [expandedGroupIds],
  )
  const expandInitRef = useRef(false)
  const isGroupEnabled = useCallback(
    (group: CapabilityGroup) => {
      const groupToolIds = group.tools?.length
        ? group.tools.map((tool) => tool.id)
        : group.toolIds
      return groupToolIds.some((toolId) => toolIdSet.has(toolId))
    },
    [toolIdSet],
  )
  const enabledCapGroups = useMemo(
    () => visibleCapGroups.filter((group) => isGroupEnabled(group)),
    [isGroupEnabled, visibleCapGroups],
  )
  const disabledCapGroups = useMemo(
    () => visibleCapGroups.filter((group) => !isGroupEnabled(group)),
    [isGroupEnabled, visibleCapGroups],
  )
  const capGroupToolMap = useMemo(
    () => new Map(capGroups.map((group) => [group.id, group.toolIds])),
    [capGroups],
  )
  const defaultToolIds = useMemo(() => {
    const collected: string[] = []
    for (const group of capGroups) {
      if (group.id === 'agent' && !isMasterAgent) continue
      collected.push(...group.toolIds)
    }
    // 中文注释：默认全组选中（主助手保留子 Agent 工具）。
    return Array.from(
      new Set(collected.map((id) => id.trim()).filter(Boolean)),
    )
  }, [capGroups, isMasterAgent])

  const canInitExpand = useMemo(
    () => capGroups.length > 0 && (!isNew || toolIds.length > 0),
    [capGroups.length, isNew, toolIds.length],
  )

  useEffect(() => {
    if (expandInitRef.current || !canInitExpand) return
    setExpandedGroupIds(enabledCapGroups.map((group) => group.id))
    expandInitRef.current = true
  }, [canInitExpand, enabledCapGroups])

  // 逻辑：加载技能列表用于关联选择。
  const skillsQuery = useQuery(
    trpc.settings.getSkills.queryOptions(projectId ? { projectId } : undefined),
  )
  const availableSkills = useMemo(
    () => (skillsQuery.data ?? []) as SkillSummary[],
    [skillsQuery.data],
  )

  // 逻辑：详情加载后回填表单并保存初始快照。
  useEffect(() => {
    if (!detailQuery.data) return
    if (savedSnapshotRef.current && isDirtyRef.current) return
    const d = detailQuery.data
    setName(d.name)
    setDescription(d.description)
    setIcon(d.icon)
    setModelLocalIds(Array.isArray(d.modelLocalIds) ? d.modelLocalIds : [])
    setModelCloudIds(Array.isArray(d.modelCloudIds) ? d.modelCloudIds : [])
    // 逻辑：主助手沿用全局来源，子助手根据已有模型推断来源。
    const fallbackChatSource = normalizeChatModelSource(basic.chatSource)
    const hasCloudModels = Array.isArray(d.modelCloudIds) && d.modelCloudIds.length > 0
    const hasLocalModels = Array.isArray(d.modelLocalIds) && d.modelLocalIds.length > 0
    const inferredChatSource = hasCloudModels && !hasLocalModels
      ? 'cloud'
      : hasLocalModels
        ? 'local'
        : fallbackChatSource
    setLocalChatSource(isMasterAgent ? fallbackChatSource : inferredChatSource)
    setAuxiliaryModelSource(
      normalizeChatModelSource(d.auxiliaryModelSource ?? basic.chatSource),
    )
    setAuxiliaryModelLocalIds(
      Array.isArray(d.auxiliaryModelLocalIds) ? d.auxiliaryModelLocalIds : [],
    )
    setAuxiliaryModelCloudIds(
      Array.isArray(d.auxiliaryModelCloudIds) ? d.auxiliaryModelCloudIds : [],
    )
    setImageModelIds(Array.isArray(d.imageModelIds) ? d.imageModelIds : [])
    setVideoModelIds(Array.isArray(d.videoModelIds) ? d.videoModelIds : [])
    setToolIds(Array.isArray(d.toolIds) ? d.toolIds : [])
    setSkills(d.skills)
    setAllowSubAgents(d.allowSubAgents)
    setMaxDepth(d.maxDepth)
    setSystemPrompt(d.systemPrompt)
    savedSnapshotRef.current = makeSnapshot({
      name: d.name,
      description: d.description,
      icon: d.icon,
      modelLocalIds: Array.isArray(d.modelLocalIds) ? d.modelLocalIds : [],
      modelCloudIds: Array.isArray(d.modelCloudIds) ? d.modelCloudIds : [],
      auxiliaryModelSource: normalizeChatModelSource(
        d.auxiliaryModelSource ?? basic.chatSource,
      ),
      auxiliaryModelLocalIds: Array.isArray(d.auxiliaryModelLocalIds)
        ? d.auxiliaryModelLocalIds
        : [],
      auxiliaryModelCloudIds: Array.isArray(d.auxiliaryModelCloudIds)
        ? d.auxiliaryModelCloudIds
        : [],
      imageModelIds: Array.isArray(d.imageModelIds) ? d.imageModelIds : [],
      videoModelIds: Array.isArray(d.videoModelIds) ? d.videoModelIds : [],
      toolIds: Array.isArray(d.toolIds) ? d.toolIds : [],
      skills: d.skills,
      allowSubAgents: d.allowSubAgents,
      maxDepth: d.maxDepth,
      systemPrompt: d.systemPrompt,
    })
    setDefaultSnapshot(makeSnapshot({
      name: d.name,
      description: d.description,
      icon: d.icon,
      modelLocalIds: Array.isArray(d.modelLocalIds) ? d.modelLocalIds : [],
      modelCloudIds: Array.isArray(d.modelCloudIds) ? d.modelCloudIds : [],
      auxiliaryModelSource: normalizeChatModelSource(
        d.auxiliaryModelSource ?? basic.chatSource,
      ),
      auxiliaryModelLocalIds: Array.isArray(d.auxiliaryModelLocalIds)
        ? d.auxiliaryModelLocalIds
        : [],
      auxiliaryModelCloudIds: Array.isArray(d.auxiliaryModelCloudIds)
        ? d.auxiliaryModelCloudIds
        : [],
      imageModelIds: Array.isArray(d.imageModelIds) ? d.imageModelIds : [],
      videoModelIds: Array.isArray(d.videoModelIds) ? d.videoModelIds : [],
      toolIds: Array.isArray(d.toolIds) ? d.toolIds : [],
      skills: d.skills,
      allowSubAgents: d.allowSubAgents,
      maxDepth: d.maxDepth,
      systemPrompt: d.systemPrompt,
    }))
  }, [basic.chatSource, detailQuery.data, isMasterAgent])

  // 逻辑：新建模式初始化空快照。
  useEffect(() => {
    if (!isNew) return
    if (savedSnapshotRef.current && isDirtyRef.current) return
    const baseToolIds =
      toolIds.length > 0 ? toolIds : defaultToolIds
    if (toolIds.length === 0 && baseToolIds.length > 0) {
      setToolIds(baseToolIds)
    }
    setAuxiliaryModelSource(normalizeChatModelSource(basic.chatSource))
    setLocalChatSource(normalizeChatModelSource(basic.chatSource))
    const snapshot = makeSnapshot({
      name: '', description: '', icon: 'bot', modelLocalIds: [], modelCloudIds: [],
      auxiliaryModelSource: normalizeChatModelSource(basic.chatSource),
      auxiliaryModelLocalIds: [],
      auxiliaryModelCloudIds: [],
      imageModelIds: [], videoModelIds: [],
      toolIds: baseToolIds, skills: [], allowSubAgents: false,
      maxDepth: 1, systemPrompt: '',
    })
    savedSnapshotRef.current = snapshot
    setDefaultSnapshot(snapshot)
  }, [basic.chatSource, defaultToolIds, isNew, toolIds])

  const currentSnapshot = makeSnapshot({
    name,
    description,
    icon,
    modelLocalIds,
    modelCloudIds,
    auxiliaryModelSource,
    auxiliaryModelLocalIds,
    auxiliaryModelCloudIds,
    imageModelIds,
    videoModelIds,
    toolIds,
    skills,
    allowSubAgents,
    maxDepth,
    systemPrompt,
  })
  isDirtyRef.current = currentSnapshot !== savedSnapshotRef.current
  const isDirty = isDirtyRef.current
  const canReset = defaultSnapshot !== '' && currentSnapshot !== defaultSnapshot

  /** Normalize id list for consistent comparisons. */
  const normalizeIds = useCallback((value: string[]) => {
    const normalized = value.map((id) => id.trim()).filter(Boolean)
    return Array.from(new Set(normalized))
  }, [])


  const handleResetToDefault = useCallback(() => {
    if (!defaultSnapshot) return
    const parsed = JSON.parse(defaultSnapshot) as FormSnapshot
    setName(parsed.name)
    setDescription(parsed.description)
    setIcon(parsed.icon)
    setModelLocalIds(parsed.modelLocalIds)
    setModelCloudIds(parsed.modelCloudIds)
    setAuxiliaryModelSource(parsed.auxiliaryModelSource)
    setAuxiliaryModelLocalIds(parsed.auxiliaryModelLocalIds)
    setAuxiliaryModelCloudIds(parsed.auxiliaryModelCloudIds)
    setImageModelIds(parsed.imageModelIds)
    setVideoModelIds(parsed.videoModelIds)
    setToolIds(parsed.toolIds)
    setSkills(parsed.skills)
    setAllowSubAgents(parsed.allowSubAgents)
    setMaxDepth(parsed.maxDepth)
    setSystemPrompt(parsed.systemPrompt)
  }, [defaultSnapshot])

  const saveMutation = useMutation(
    trpc.settings.saveAgent.mutationOptions({
      onSuccess: () => {
        if (!silentSaveRef.current) {
          toast.success(isNew ? '已创建 Agent助手' : '已保存 Agent助手')
        }
        const overrideSnapshot = pendingSnapshotOverrideRef.current
        if (overrideSnapshot) {
          savedSnapshotRef.current = overrideSnapshot
          pendingSnapshotOverrideRef.current = null
        } else {
          savedSnapshotRef.current = currentSnapshot
        }
        silentSaveRef.current = false
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        })
        // 逻辑：保存后刷新当前 Agent 详情，确保主助手与聊天输入同步。
        if (agentPath) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgentDetail.queryOptions({
              agentPath,
              scope,
            }).queryKey,
          })
        }
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgents.queryOptions({ projectId }).queryKey,
          })
        }
      },
      onError: (err) => {
        silentSaveRef.current = false
        pendingSnapshotOverrideRef.current = null
        toast.error(err.message)
      },
    }),
  )

  const deleteMutation = useMutation(
    trpc.settings.deleteAgent.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        })
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgents.queryOptions({ projectId }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgents.queryOptions({ projectId, scopeFilter: 'project' }).queryKey,
          })
        }
        toast.success('已删除 Agent助手')
        // 逻辑：删除后关闭当前 stack 面板。
        savedSnapshotRef.current = currentSnapshot
        if (activeTabId) {
          const runtime = getRuntimeByTabId(activeTabId)
          const stackItemId = runtime?.activeStackItemId
          if (stackItemId) removeStackItem(activeTabId, stackItemId)
        }
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  const handleDelete = useCallback(() => {
    if (!agentPath || isNew) return
    const confirmed = window.confirm(`确认删除 Agent助手「${name || '未命名'}」？此操作不可撤销。`)
    if (!confirmed) return
    const folderName = detailQuery.data?.folderName ?? ''
    const ignoreKey = folderName || ''
    deleteMutation.mutate({
      scope,
      projectId: scope === 'project' ? projectId : undefined,
      ignoreKey,
      agentPath,
    })
  }, [agentPath, isNew, name, scope, projectId, detailQuery.data?.folderName, deleteMutation])

  const syncMasterModels = useCallback(
    (patch: Partial<FormSnapshot>) => {
      if (!isMasterAgent || !agentPath || isNew) return
      const baseSnapshot =
        getSavedSnapshot() ?? {
          name,
          description,
          icon,
          modelLocalIds,
          modelCloudIds,
          auxiliaryModelSource,
          auxiliaryModelLocalIds,
          auxiliaryModelCloudIds,
          imageModelIds,
          videoModelIds,
          toolIds,
          skills,
          allowSubAgents,
          maxDepth,
          systemPrompt,
        }
      const nextSnapshot: FormSnapshot = {
        ...baseSnapshot,
        ...patch,
      }
      if (!nextSnapshot.name.trim()) return
      pendingSnapshotOverrideRef.current = makeSnapshot(nextSnapshot)
      silentSaveRef.current = true
      saveMutation.mutate({
        scope,
        projectId,
        agentPath,
        name: nextSnapshot.name.trim(),
        description: nextSnapshot.description.trim() || undefined,
        icon: nextSnapshot.icon.trim() || undefined,
        modelLocalIds: normalizeIds(nextSnapshot.modelLocalIds),
        modelCloudIds: normalizeIds(nextSnapshot.modelCloudIds),
        auxiliaryModelSource: nextSnapshot.auxiliaryModelSource,
        auxiliaryModelLocalIds: normalizeIds(nextSnapshot.auxiliaryModelLocalIds),
        auxiliaryModelCloudIds: normalizeIds(nextSnapshot.auxiliaryModelCloudIds),
        imageModelIds: normalizeIds(nextSnapshot.imageModelIds),
        videoModelIds: normalizeIds(nextSnapshot.videoModelIds),
        toolIds: normalizeIds(nextSnapshot.toolIds),
        skills: nextSnapshot.skills,
        allowSubAgents: nextSnapshot.allowSubAgents,
        maxDepth: nextSnapshot.maxDepth,
        systemPrompt: nextSnapshot.systemPrompt.trim() || undefined,
      })
    },
    [
      allowSubAgents,
      agentPath,
      auxiliaryModelCloudIds,
      auxiliaryModelLocalIds,
      auxiliaryModelSource,
      toolIds,
      description,
      getSavedSnapshot,
      icon,
      imageModelIds,
      isMasterAgent,
      isNew,
      maxDepth,
      modelCloudIds,
      modelLocalIds,
      name,
      normalizeIds,
      projectId,
      saveMutation,
      scope,
      skills,
      systemPrompt,
      videoModelIds,
    ],
  )

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.error('名称不能为空')
      return
    }
    const normalizedModelLocalIds = normalizeIds(modelLocalIds)
    const normalizedModelCloudIds = normalizeIds(modelCloudIds)
    const normalizedAuxLocalIds = normalizeIds(auxiliaryModelLocalIds)
    const normalizedAuxCloudIds = normalizeIds(auxiliaryModelCloudIds)
    const normalizedImageModelIds = normalizeIds(imageModelIds)
    const normalizedVideoModelIds = normalizeIds(videoModelIds)
    const normalizedToolIds = normalizeIds(toolIds)
    saveMutation.mutate({
      scope,
      projectId,
      agentPath: isNew ? undefined : agentPath,
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      modelLocalIds: normalizedModelLocalIds,
      modelCloudIds: normalizedModelCloudIds,
      auxiliaryModelSource,
      auxiliaryModelLocalIds: normalizedAuxLocalIds,
      auxiliaryModelCloudIds: normalizedAuxCloudIds,
      imageModelIds: normalizedImageModelIds,
      videoModelIds: normalizedVideoModelIds,
      toolIds: normalizedToolIds,
      skills,
      allowSubAgents,
      maxDepth,
      systemPrompt: systemPrompt.trim() || undefined,
    })
  }, [
    name,
    description,
    icon,
    modelLocalIds,
    modelCloudIds,
    auxiliaryModelSource,
    auxiliaryModelLocalIds,
    auxiliaryModelCloudIds,
    imageModelIds,
    videoModelIds,
    toolIds,
    skills,
    allowSubAgents,
    maxDepth,
    systemPrompt,
    scope,
    projectId,
    agentPath,
    isNew,
    saveMutation,
    normalizeIds,
  ])

  const handleToggleGroup = useCallback(
    (groupId: string, checked: boolean) => {
      const groupToolIds = capGroupToolMap.get(groupId) ?? []
      setToolIds((prev) => {
        if (checked) {
          // 中文注释：开启能力组时合并该组所有工具。
          return normalizeIds([...prev, ...groupToolIds])
        }
        // 中文注释：关闭能力组时移除该组所有工具。
        return prev.filter((id) => !groupToolIds.includes(id))
      })
      setExpandedGroupIds((prev) => {
        if (checked) {
          return prev.includes(groupId) ? prev : [...prev, groupId]
        }
        return prev.filter((id) => id !== groupId)
      })
    },
    [capGroupToolMap, normalizeIds],
  )

  const handleToggleTool = useCallback(
    (toolId: string, checked: boolean) => {
      setToolIds((prev) => {
        if (checked) return normalizeIds([...prev, toolId])
        return prev.filter((id) => id !== toolId)
      })
    },
    [normalizeIds],
  )

  const handleToggleSkill = useCallback((skillName: string, checked: boolean) => {
    setSkills((prev) =>
      checked ? [...prev, skillName] : prev.filter((s) => s !== skillName),
    )
  }, [])

  /** Render capability group with tool toggles. */
  const renderCapGroupCard = useCallback(
    (group: CapabilityGroup) => {
      const capIcon = CAP_ICON_MAP[group.id]
      const CapIcon = capIcon?.icon ?? Blocks
      const capIconClass = capIcon?.className ?? 'text-muted-foreground'
      const bgClass = CAP_BG_MAP[group.id] ?? 'bg-muted/30'
      const tools = group.tools?.length
        ? group.tools
        : group.toolIds.map((id) => ({
            id,
            label: id,
            description: '',
          }))
      const groupToolIds = tools.map((tool) => tool.id)
      const selectedCount = groupToolIds.filter((id) => toolIdSet.has(id)).length
      const isExpanded = expandedGroupSet.has(group.id)
      return (
        <div
          key={group.id}
          className={`relative flex flex-col rounded-2xl p-3 transition-colors ${bgClass}`}
        >
          <div className="flex items-center gap-2">
            <CapIcon className={`h-4 w-4 shrink-0 ${capIconClass}`} />
            <span className="text-xs font-medium">{group.label}</span>
            <span className="text-[10px] text-muted-foreground">
              {selectedCount}/{groupToolIds.length}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Switch
                checked={isGroupEnabled(group)}
                onCheckedChange={(checked) =>
                  handleToggleGroup(group.id, Boolean(checked))
                }
              />
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
                onClick={() =>
                  setExpandedGroupIds((prev) =>
                    prev.includes(group.id)
                      ? prev.filter((id) => id !== group.id)
                      : [...prev, group.id],
                  )
                }
                aria-expanded={isExpanded}
                aria-label={isExpanded ? '收起能力组' : '展开能力组'}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground line-clamp-2">
            {group.description}
          </p>
          {isExpanded && tools.length > 0 ? (
            <div className="mt-2 space-y-1">
              {tools.map((tool) => {
                const checked = toolIdSet.has(tool.id)
                return (
                  <label
                    key={tool.id}
                    className="flex items-start gap-2 rounded-md px-2 py-1 text-[11px] leading-tight hover:bg-background/60"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        handleToggleTool(tool.id, Boolean(next))
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{tool.label}</div>
                      {tool.description ? (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                          {tool.description}
                        </p>
                      ) : null}
                    </div>
                  </label>
                )
              })}
            </div>
          ) : null}
        </div>
      )
    },
    [
      expandedGroupSet,
      handleToggleGroup,
      handleToggleTool,
      isGroupEnabled,
      toolIdSet,
    ],
  )

  // 逻辑：主助手思考模式与基础设置保持一致。
  useEffect(() => {
    if (!isMasterAgent) return
    setThinkingMode(basic.chatThinkingMode === 'deep' ? 'deep' : 'fast')
  }, [basic.chatThinkingMode, isMasterAgent])

  const handleThinkingModeChange = useCallback(
    (mode: ThinkingMode) => {
      setThinkingMode(mode)
      if (!isMasterAgent) return
      void setBasic({ chatThinkingMode: mode })
    },
    [isMasterAgent, setBasic],
  )

  // 逻辑：主助手写入全局来源，子助手仅更新本地来源。
  const handleChatSourceSelect = useCallback(
    (next: 'local' | 'cloud') => {
      if (isMasterAgent) {
        void setBasic({ chatSource: next })
        return
      }
      setLocalChatSource(next)
    },
    [isMasterAgent, setBasic],
  )

  // 逻辑：登录成功后自动关闭登录弹窗。
  useEffect(() => {
    if (authLoggedIn && loginOpen) {
      setLoginOpen(false)
    }
  }, [authLoggedIn, loginOpen])

  const hasImageGenerate = toolIds.includes('image-generate')
  const hasVideoGenerate = toolIds.includes('video-generate')

  // 逻辑：向 PanelFrame 的 StackHeader 注入保存按钮和关闭拦截。
  useEffect(() => {
    if (!panelSlot) return
    panelSlot.setSlot({
      rightSlotBeforeClose: (
        <>
          {agentPath && !isNew ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleteMutation.isPending} aria-label="删除 Agent助手">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">删除 Agent助手</TooltipContent>
            </Tooltip>
          ) : null}
          {agentPath ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleOpenFolder} aria-label="打开文件夹">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">打开 Agent助手 文件夹</TooltipContent>
            </Tooltip>
          ) : null}
          {isDirty ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              disabled={!name.trim() || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
            </Button>
          ) : null}
        </>
      ),
      onBeforeClose: () => {
        if (!isDirty) return true
        return window.confirm('有未保存的修改，确定要关闭吗？')
      },
    })
    return () => panelSlot.setSlot(null)
  }, [panelSlot, isDirty, handleSave, handleOpenFolder, handleDelete, agentPath, isNew, name, saveMutation.isPending, deleteMutation.isPending])

  if (!isNew && detailQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <div className="flex-1 overflow-auto">
        <div className="space-y-4 p-4">
          {/* Apple 风格基本信息区 */}
          <div className="flex flex-col items-center gap-2 pt-2 pb-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40">
              <Bot className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent助手 名称"
              className="mx-auto max-w-[220px] border-0 bg-transparent text-center text-base font-semibold shadow-none focus-visible:ring-0"
            />
          </div>

          {/* 模型 + 子Agent助手 分组卡片 */}
          <OpenLoafSettingsCard divided>
            <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-sky-500" />
                对话模型
                {isMasterAgent ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                      主助手是默认对话 Agent助手，此处模型与聊天输入区同步，可在聊天输入区直接调整。
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {hasReasoningModel ? (
                  <ThinkingModeSelector
                    value={thinkingMode}
                    onChange={handleThinkingModeChange}
                  />
                ) : null}
                <ChatModelSelect
                  models={chatModels}
                  value={activeModelIds}
                    showCloudLogin={showChatCloudLogin}
                    onChange={(nextIds) => {
                      if (isCloudSource) {
                        setModelCloudIds(nextIds)
                        if (isMasterAgent) {
                          syncMasterModels({ modelCloudIds: nextIds })
                        }
                        return
                      }
                      setModelLocalIds(nextIds)
                      if (isMasterAgent) {
                        syncMasterModels({ modelLocalIds: nextIds })
                      }
                    }}
                    onOpenLogin={() => setLoginOpen(true)}
                    emptyText="暂无对话模型"
                  />
                <div className="flex shrink-0 items-center rounded-full border border-border/70 bg-muted/40">
                  <FilterTab
                    text="本地"
                    selected={!isCloudSource}
                    onSelect={() => handleChatSourceSelect('local')}
                    icon={<HardDrive className="h-3 w-3 text-amber-500" />}
                    layoutId="agent-chat-source"
                  />
                  <FilterTab
                    text="云端"
                    selected={isCloudSource}
                    onSelect={() => handleChatSourceSelect('cloud')}
                    icon={<Cloud className="h-3 w-3 text-sky-500" />}
                    layoutId="agent-chat-source"
                  />
                </div>
              </div>
            </div>
            {isMasterAgent ? (
              <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  辅助模型
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      用于生成建议、补全与优化等辅助内容，不影响主对话输出。
                    </TooltipContent>
                  </Tooltip>
                </span>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <ChatModelSelect
                    models={auxiliaryChatModels}
                    value={activeAuxModelIds}
                    showCloudLogin={showAuxChatCloudLogin}
                    onChange={(nextIds) => {
                      if (isAuxCloudSource) {
                        setAuxiliaryModelCloudIds(nextIds)
                        return
                      }
                      setAuxiliaryModelLocalIds(nextIds)
                    }}
                    onOpenLogin={() => setLoginOpen(true)}
                    emptyText="暂无对话模型"
                  />
                  <div className="flex shrink-0 items-center rounded-full border border-border/70 bg-muted/40">
                    <FilterTab
                      text="本地"
                      selected={!isAuxCloudSource}
                      onSelect={() => setAuxiliaryModelSource('local')}
                      icon={<HardDrive className="h-3 w-3 text-amber-500" />}
                      layoutId="agent-aux-source"
                    />
                    <FilterTab
                      text="云端"
                      selected={isAuxCloudSource}
                      onSelect={() => setAuxiliaryModelSource('cloud')}
                      icon={<Cloud className="h-3 w-3 text-sky-500" />}
                      layoutId="agent-aux-source"
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {isMasterAgent ? (
              <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-violet-500" />
                  子Agent助手最大并行数量
                </span>
                <div className="ml-auto flex items-center rounded-full border border-border/70 bg-muted/40">
                  {[2, 3, 4, 5].map((count) => (
                    <FilterTab
                      key={count}
                      text={`${count}`}
                      selected={maxDepth === count}
                      onSelect={() => {
                        setAllowSubAgents(true)
                        setMaxDepth(count)
                      }}
                      layoutId="agent-subagent-parallel"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Edit3 className="h-4 w-4 text-amber-500" />
                  备注
                </span>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="可选备注信息"
                  className="ml-auto w-full flex-1 min-w-[260px] max-w-[640px] border-0 bg-transparent text-right text-sm text-muted-foreground shadow-none focus-visible:ring-0"
                />
              </div>
            )}
          </OpenLoafSettingsCard>

          <OpenLoafSettingsCard divided>
            <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Image className="h-4 w-4 text-pink-500" />
                图片生成
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {hasImageGenerate ? (
                  authLoggedIn ? (
                    <MediaModelSelect
                      models={imageModels}
                      value={imageModelIds}
                      authLoggedIn={authLoggedIn}
                      onChange={(nextIds) => {
                        setImageModelIds(nextIds)
                        if (isMasterAgent) {
                          syncMasterModels({ imageModelIds: nextIds })
                        }
                      }}
                      onOpenLogin={() => setLoginOpen(true)}
                      emptyText="暂无图像模型"
                    />
                  ) : (
                    <Button size="sm" onClick={() => setLoginOpen(true)}>
                      登录OpenLoaf账户
                    </Button>
                  )
                ) : null}
                <Switch
                  checked={hasImageGenerate}
                  onCheckedChange={(checked) =>
                    handleToggleTool('image-generate', Boolean(checked))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Video className="h-4 w-4 text-purple-500" />
                视频生成
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {hasVideoGenerate ? (
                  authLoggedIn ? (
                    <MediaModelSelect
                      models={videoModels}
                      value={videoModelIds}
                      authLoggedIn={authLoggedIn}
                      onChange={(nextIds) => {
                        setVideoModelIds(nextIds)
                        if (isMasterAgent) {
                          syncMasterModels({ videoModelIds: nextIds })
                        }
                      }}
                      onOpenLogin={() => setLoginOpen(true)}
                      emptyText="暂无视频模型"
                    />
                  ) : (
                    <Button size="sm" onClick={() => setLoginOpen(true)}>
                      登录OpenLoaf账户
                    </Button>
                  )
                ) : null}
                <Switch
                  checked={hasVideoGenerate}
                  onCheckedChange={(checked) =>
                    handleToggleTool('video-generate', Boolean(checked))
                  }
                />
              </div>
            </div>
          </OpenLoafSettingsCard>

          {/* Tabs: 能力组 / 技能 / 提示词 */}
          <Tabs defaultValue="capabilities">
            <div className="sticky top-0 z-10 bg-background pb-2">
              <div className="text-sm font-medium">配置</div>
              <div className="flex items-center justify-between gap-2">
                <TabsList className="mt-1.5 h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                  <TabsTrigger
                    value="capabilities"
                    className="h-6 rounded-full px-2.5 text-xs whitespace-nowrap"
                  >
                    <Blocks className="mr-1 h-3 w-3 text-blue-500" />
                    能力组
                  </TabsTrigger>
                  <TabsTrigger
                    value="skills"
                    className="h-6 rounded-full px-2.5 text-xs whitespace-nowrap"
                  >
                    <Sparkles className="mr-1 h-3 w-3 text-purple-500" />
                    技能
                  </TabsTrigger>
                  <TabsTrigger
                    value="prompt"
                    className="h-6 rounded-full px-2.5 text-xs whitespace-nowrap"
                  >
                    <ScrollText className="mr-1 h-3 w-3 text-amber-500" />
                    系统提示词
                  </TabsTrigger>
                </TabsList>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={handleResetToDefault}
                  disabled={!canReset}
                >
                  重置
                </Button>
              </div>
            </div>
              <TabsContent value="capabilities" className="mt-0">
                <div className="space-y-3 py-3">
                  <div className="grid grid-cols-2 gap-3">
                    {enabledCapGroups.map(renderCapGroupCard)}
                  </div>
                  {enabledCapGroups.length > 0 && disabledCapGroups.length > 0 ? (
                    <div className="border-t border-border/60" />
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    {disabledCapGroups.map(renderCapGroupCard)}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="skills" className="mt-0">
                <div className="py-3">
                  {availableSkills.length > 0 ? (
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))]">
                      {availableSkills.map((skill) => {
                        const isSelected = skills.includes(skill.name)
                        return (
                          <label
                            key={skill.ignoreKey || skill.path || skill.name}
                            className="flex cursor-pointer flex-col rounded-[22px] bg-zinc-100 p-3.5 transition-colors hover:bg-zinc-200/75 dark:bg-zinc-800 dark:hover:bg-zinc-700/85"
                          >
                            <div className="flex items-start gap-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  handleToggleSkill(skill.name, Boolean(checked))
                                }
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{skill.name}</div>
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                  {skill.description?.trim() || skill.name}
                                </p>
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无可用技能</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="prompt" className="mt-0">
                <div className="py-3">
                  <OpenLoafSettingsCard padding="xy">
                    <Textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Markdown 格式的系统提示词..."
                      rows={16}
                      className="border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                    />
                  </OpenLoafSettingsCard>
                </div>
              </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
})
