'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient, trpc } from '@/utils/trpc'
import { useStackPanelSlot } from '@/hooks/use-stack-panel-slot'
import { Button } from '@tenas-ai/ui/button'
import { Input } from '@tenas-ai/ui/input'
import { Textarea } from '@tenas-ai/ui/textarea'
import { Switch } from '@tenas-ai/ui/switch'
import { Checkbox } from '@tenas-ai/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tenas-ai/ui/tabs'
import { TenasSettingsCard } from '@tenas-ai/ui/tenas/TenasSettingsCard'
import { FilterTab } from '@tenas-ai/ui/filter-tab'
import {
  Bot,
  Blocks,
  Calendar,
  Check,
  Cloud,
  Code,
  FileSearch,
  FilePen,
  FolderOpen,
  Globe,
  HardDrive,
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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTabs } from '@/hooks/use-tabs'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tenas-ai/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@tenas-ai/ui/popover'
import { SaasLoginDialog } from '@/components/auth/SaasLoginDialog'
import { useSaasAuth } from '@/hooks/use-saas-auth'
import { useMediaModels } from '@/hooks/use-media-models'
import { useSettingsValues } from '@/hooks/use-settings'
import { useBasicConfig } from '@/hooks/use-basic-config'
import { useCloudModels } from '@/hooks/use-cloud-models'
import { useInstalledCliProviderIds } from '@/hooks/use-cli-tools-installed'
import {
  buildChatModelOptions,
  normalizeChatModelSource,
} from '@/lib/provider-models'
import { getModelLabel } from '@/lib/model-registry'
import { ModelCheckboxItem } from '@/components/ai/input/model-preferences/ModelCheckboxItem'
import { ModelIcon } from '@/components/setting/menus/provider/ModelIcon'
import type { AiModel } from '@tenas-saas/sdk'
import type { ProviderModelOption } from '@/lib/provider-models'

/** 能力组 ID → 彩色图标映射 */
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  browser: { icon: Globe, className: 'text-blue-500' },
  'file-read': { icon: FileSearch, className: 'text-emerald-500' },
  'file-write': { icon: FilePen, className: 'text-green-600' },
  shell: { icon: Terminal, className: 'text-slate-500' },
  email: { icon: Mail, className: 'text-red-500' },
  calendar: { icon: Calendar, className: 'text-orange-500' },
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
  model: string
  /** Selected image model id (empty = Auto). */
  imageModelId: string
  /** Selected video model id (empty = Auto). */
  videoModelId: string
  capabilities: string[]
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
  /** Current selected model id (empty = Auto). */
  value: string
  /** Disable selector interaction. */
  disabled?: boolean
  /** Auth state for SaaS models. */
  authLoggedIn: boolean
  /** Change handler. */
  onChange: (nextId: string) => void
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
  const selectedLabel = useMemo(() => {
    if (!value) return 'Auto'
    const matched = models.find((m) => m.id === value)
    return matched?.name ?? value
  }, [models, value])

  const handleSelect = useCallback((nextId: string) => {
    onChange(nextId)
    setOpen(false)
  }, [onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="h-8 min-w-[200px] justify-between rounded-full border border-border/60 bg-background/80 px-3 text-xs"
        >
          <span className="truncate">{selectedLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-xl border-border bg-background/90 p-2 shadow-xl backdrop-blur"
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
              登录Tenas账户，使用云端模型
            </Button>
            <div className="text-xs text-muted-foreground">使用云端模型</div>
          </div>
        ) : models.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
              onClick={() => handleSelect('')}
            >
              <span className="flex-1 truncate">Auto</span>
              {value === '' ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
            </button>
            {models.map((model) => (
              <button
                key={`${model.providerId ?? 'unknown'}-${model.id}`}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
                onClick={() => handleSelect(model.id)}
              >
                <span className="flex-1 truncate">
                  {model.name ?? model.id}
                </span>
                {value === model.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <span className="h-3.5 w-3.5" />
                )}
              </button>
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
  /** Current selected model id (empty = Auto). */
  value: string
  /** Disable selector interaction. */
  disabled?: boolean
  /** Whether cloud source requires login. */
  showCloudLogin: boolean
  /** Change handler. */
  onChange: (nextId: string) => void
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
  const selectedOption = useMemo(
    () => models.find((m) => m.id === value),
    [models, value],
  )
  const selectedLabel = useMemo(() => {
    if (!value) return 'Auto'
    if (!selectedOption) return value
    return selectedOption.modelDefinition
      ? getModelLabel(selectedOption.modelDefinition)
      : selectedOption.modelId
  }, [selectedOption, value])

  const handleSelect = useCallback((nextId: string) => {
    onChange(nextId)
    setOpen(false)
  }, [onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="h-8 w-auto max-w-full justify-between rounded-full border border-border/60 bg-background/80 px-3 text-xs"
        >
          <span className="flex min-w-0 items-center gap-2">
            {value ? (
              <ModelIcon
                icon={
                  selectedOption?.modelDefinition?.familyId ??
                  selectedOption?.modelDefinition?.icon ??
                  selectedOption?.providerId
                }
                model={selectedOption?.modelId}
                size={14}
                className="h-3.5 w-3.5 shrink-0"
              />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="truncate">{selectedLabel}</span>
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
              登录Tenas账户，使用云端模型
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
              onClick={() => handleSelect('')}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span className="flex-1 truncate">Auto</span>
              {value === '' ? (
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
                  checked={value === option.id}
                  onToggle={() => handleSelect(option.id)}
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
  const [model, setModel] = useState('')
  const [imageModelId, setImageModelId] = useState('')
  const [videoModelId, setVideoModelId] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [allowSubAgents, setAllowSubAgents] = useState(false)
  const [maxDepth, setMaxDepth] = useState(1)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [defaultSnapshot, setDefaultSnapshot] = useState('')

  // 逻辑：保存初始快照用于脏检测。
  const savedSnapshotRef = useRef('')

  const panelSlot = useStackPanelSlot()
  const activeTabId = useTabs((s) => s.activeTabId)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const { loggedIn: authLoggedIn } = useSaasAuth()
  const { imageModels, videoModels } = useMediaModels()
  const { providerItems } = useSettingsValues()
  const { basic, setBasic } = useBasicConfig()
  const { models: cloudModels } = useCloudModels()
  const installedCliProviderIds = useInstalledCliProviderIds()
  const chatModelSource = normalizeChatModelSource(basic.chatSource)
  const isCloudSource = chatModelSource === 'cloud'
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
  const showChatCloudLogin = isCloudSource && !authLoggedIn

  // 逻辑：打开 Agent 所在文件夹。
  const handleOpenFolder = useCallback(() => {
    if (!agentPath) return
    const normalized = agentPath.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    const dirPath = lastSlash >= 0 ? normalized.slice(0, lastSlash) : normalized
    const dirUri = dirPath.startsWith('file://') ? dirPath : (/^[A-Za-z]:\//.test(dirPath) ? `file:///${dirPath}` : `file://${dirPath}`)

    const api = window.tenasElectron
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
        title: `Agent · ${name || 'folder'}`,
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
  const enabledCapGroups = useMemo(
    () => visibleCapGroups.filter((group) => capabilities.includes(group.id)),
    [capabilities, visibleCapGroups],
  )
  const disabledCapGroups = useMemo(
    () => visibleCapGroups.filter((group) => !capabilities.includes(group.id)),
    [capabilities, visibleCapGroups],
  )

  // 逻辑：加载技能列表用于关联选择。
  const skillsQuery = useQuery(
    trpc.settings.getSkills.queryOptions(projectId ? { projectId } : undefined),
  )
  const availableSkills = useMemo(
    () => (skillsQuery.data ?? []) as SkillSummary[],
    [skillsQuery.data],
  )

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
      return folderName === 'master' && detailQuery.data?.scope === 'workspace'
    }
    if (!agentPath) return false
    const normalized = agentPath.replace(/\\/g, '/')
    return normalized.includes('/.tenas/agents/master/')
  }, [agentPath, detailQuery.data, isNew])

  // 逻辑：详情加载后回填表单并保存初始快照。
  useEffect(() => {
    if (!detailQuery.data) return
    const d = detailQuery.data
    setName(d.name)
    setDescription(d.description)
    setIcon(d.icon)
    setModel(d.model)
    setImageModelId(d.imageModelId ?? '')
    setVideoModelId(d.videoModelId ?? '')
    setCapabilities(d.capabilities)
    setSkills(d.skills)
    setAllowSubAgents(d.allowSubAgents)
    setMaxDepth(d.maxDepth)
    setSystemPrompt(d.systemPrompt)
    savedSnapshotRef.current = makeSnapshot({
      name: d.name,
      description: d.description,
      icon: d.icon,
      model: d.model,
      imageModelId: d.imageModelId ?? '',
      videoModelId: d.videoModelId ?? '',
      capabilities: d.capabilities,
      skills: d.skills,
      allowSubAgents: d.allowSubAgents,
      maxDepth: d.maxDepth,
      systemPrompt: d.systemPrompt,
    })
    setDefaultSnapshot(makeSnapshot({
      name: d.name,
      description: d.description,
      icon: d.icon,
      model: d.model,
      imageModelId: d.imageModelId ?? '',
      videoModelId: d.videoModelId ?? '',
      capabilities: d.capabilities,
      skills: d.skills,
      allowSubAgents: d.allowSubAgents,
      maxDepth: d.maxDepth,
      systemPrompt: d.systemPrompt,
    }))
  }, [detailQuery.data])

  // 逻辑：新建模式初始化空快照。
  useEffect(() => {
    if (isNew) {
      setCapabilities((prev) =>
        prev.length > 0
          ? prev
          : ['image-generate', 'video-generate'],
      )
      const snapshot = makeSnapshot({
        name: '', description: '', icon: 'bot', model: '',
        imageModelId: '', videoModelId: '',
        capabilities: ['image-generate', 'video-generate'], skills: [], allowSubAgents: false,
        maxDepth: 1, systemPrompt: '',
      })
      savedSnapshotRef.current = snapshot
      setDefaultSnapshot(snapshot)
    }
  }, [isNew])

  const currentSnapshot = makeSnapshot({
    name, description, icon, model, imageModelId, videoModelId, capabilities,
    skills, allowSubAgents, maxDepth, systemPrompt,
  })
  const isDirty = currentSnapshot !== savedSnapshotRef.current
  const canReset = defaultSnapshot !== '' && currentSnapshot !== defaultSnapshot

  const handleResetToDefault = useCallback(() => {
    if (!defaultSnapshot) return
    const parsed = JSON.parse(defaultSnapshot) as FormSnapshot
    setName(parsed.name)
    setDescription(parsed.description)
    setIcon(parsed.icon)
    setModel(parsed.model)
    setImageModelId(parsed.imageModelId)
    setVideoModelId(parsed.videoModelId)
    setCapabilities(parsed.capabilities)
    setSkills(parsed.skills)
    setAllowSubAgents(parsed.allowSubAgents)
    setMaxDepth(parsed.maxDepth)
    setSystemPrompt(parsed.systemPrompt)
  }, [defaultSnapshot])

  const saveMutation = useMutation(
    trpc.settings.saveAgent.mutationOptions({
      onSuccess: () => {
        toast.success(isNew ? '已创建 Agent' : '已保存 Agent')
        savedSnapshotRef.current = currentSnapshot
        queryClient.invalidateQueries({
          queryKey: trpc.settings.getAgents.queryOptions().queryKey,
        })
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getAgents.queryOptions({ projectId }).queryKey,
          })
        }
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.error('名称不能为空')
      return
    }
    saveMutation.mutate({
      scope,
      projectId,
      agentPath: isNew ? undefined : agentPath,
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      model: model.trim() || undefined,
      imageModelId: imageModelId.trim() || undefined,
      videoModelId: videoModelId.trim() || undefined,
      capabilities,
      skills,
      allowSubAgents,
      maxDepth,
      systemPrompt: systemPrompt.trim() || undefined,
    })
  }, [
    name, description, icon, model, imageModelId, videoModelId, capabilities, skills,
    allowSubAgents, maxDepth, systemPrompt, scope, projectId,
    agentPath, isNew, saveMutation,
  ])

  const handleToggleCapability = useCallback((capId: string, checked: boolean) => {
    setCapabilities((prev) =>
      checked ? [...prev, capId] : prev.filter((c) => c !== capId),
    )
  }, [])

  const handleToggleSkill = useCallback((skillName: string, checked: boolean) => {
    setSkills((prev) =>
      checked ? [...prev, skillName] : prev.filter((s) => s !== skillName),
    )
  }, [])

  // 逻辑：登录成功后自动关闭登录弹窗。
  useEffect(() => {
    if (authLoggedIn && loginOpen) {
      setLoginOpen(false)
    }
  }, [authLoggedIn, loginOpen])

  const hasImageGenerate = capabilities.includes('image-generate')
  const hasVideoGenerate = capabilities.includes('video-generate')

  // 逻辑：向 PanelFrame 的 StackHeader 注入保存按钮和关闭拦截。
  useEffect(() => {
    if (!panelSlot) return
    panelSlot.setSlot({
      rightSlotBeforeClose: (
        <>
          {agentPath ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleOpenFolder} aria-label="打开文件夹">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">打开 Agent 文件夹</TooltipContent>
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
  }, [panelSlot, isDirty, handleSave, handleOpenFolder, agentPath, name, saveMutation.isPending])

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
              placeholder="Agent 名称"
              className="mx-auto max-w-[220px] border-0 bg-transparent text-center text-base font-semibold shadow-none focus-visible:ring-0"
            />
          </div>

          {/* 模型 + 子Agent 分组卡片 */}
          <TenasSettingsCard divided>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-sm font-medium">模型</span>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <ChatModelSelect
                  models={chatModels}
                  value={model}
                  showCloudLogin={showChatCloudLogin}
                  onChange={setModel}
                  onOpenLogin={() => setLoginOpen(true)}
                  emptyText="暂无对话模型"
                />
                <div className="flex shrink-0 items-center rounded-full border border-border/70 bg-muted/40">
                  <FilterTab
                    text="本地"
                    selected={!isCloudSource}
                    onSelect={() => void setBasic({ chatSource: 'local' })}
                    icon={<HardDrive className="h-3 w-3 text-amber-500" />}
                    layoutId="agent-chat-source"
                  />
                  <FilterTab
                    text="云端"
                    selected={isCloudSource}
                    onSelect={() => void setBasic({ chatSource: 'cloud' })}
                    icon={<Cloud className="h-3 w-3 text-sky-500" />}
                    layoutId="agent-chat-source"
                  />
                </div>
              </div>
            </div>
            {isMasterAgent ? (
              <div className="flex items-center gap-3 py-2.5">
                <span className="text-sm font-medium">子Agent最大并行数量</span>
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
                <span className="text-sm font-medium">备注</span>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="可选备注信息"
                  className="ml-auto w-full max-w-[420px] border-0 bg-transparent text-right text-sm text-muted-foreground shadow-none focus-visible:ring-0"
                />
              </div>
            )}
          </TenasSettingsCard>

          <TenasSettingsCard divided>
            <div className="flex items-center gap-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Image className="h-4 w-4 text-pink-500" />
                图片生成
              </div>
              <div className="ml-auto flex items-center gap-2">
                {hasImageGenerate ? (
                  authLoggedIn ? (
                    <MediaModelSelect
                      models={imageModels}
                      value={imageModelId}
                      authLoggedIn={authLoggedIn}
                      onChange={setImageModelId}
                      onOpenLogin={() => setLoginOpen(true)}
                      emptyText="暂无图像模型"
                    />
                  ) : (
                    <Button size="sm" onClick={() => setLoginOpen(true)}>
                      登录Tenas账户
                    </Button>
                  )
                ) : null}
                <Switch
                  checked={hasImageGenerate}
                  onCheckedChange={(checked) =>
                    handleToggleCapability('image-generate', Boolean(checked))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Video className="h-4 w-4 text-purple-500" />
                视频生成
              </div>
              <div className="ml-auto flex items-center gap-2">
                {hasVideoGenerate ? (
                  authLoggedIn ? (
                    <MediaModelSelect
                      models={videoModels}
                      value={videoModelId}
                      authLoggedIn={authLoggedIn}
                      onChange={setVideoModelId}
                      onOpenLogin={() => setLoginOpen(true)}
                      emptyText="暂无视频模型"
                    />
                  ) : (
                    <Button size="sm" onClick={() => setLoginOpen(true)}>
                      登录Tenas账户
                    </Button>
                  )
                ) : null}
                <Switch
                  checked={hasVideoGenerate}
                  onCheckedChange={(checked) =>
                    handleToggleCapability('video-generate', Boolean(checked))
                  }
                />
              </div>
            </div>
          </TenasSettingsCard>

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
                <div className="py-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {enabledCapGroups.map((group) => {
                      const capIcon = CAP_ICON_MAP[group.id]
                      const CapIcon = capIcon?.icon ?? Blocks
                      const capIconClass = capIcon?.className ?? 'text-muted-foreground'
                      const bgClass = CAP_BG_MAP[group.id] ?? 'bg-muted/30'
                      return (
                        <div
                          key={group.id}
                          className={`relative flex flex-col rounded-2xl p-3 transition-colors ${bgClass}`}
                        >
                          <div className="flex items-center gap-2">
                            <CapIcon className={`h-4 w-4 shrink-0 ${capIconClass}`} />
                            <span className="text-xs font-medium">{group.label}</span>
                            <Switch
                              checked
                              onCheckedChange={(checked) =>
                                handleToggleCapability(group.id, Boolean(checked))
                              }
                              className="ml-auto"
                            />
                          </div>
                          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground line-clamp-2">
                            {group.description}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  {enabledCapGroups.length > 0 && disabledCapGroups.length > 0 ? (
                    <div className="border-t border-border/60" />
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    {disabledCapGroups.map((group) => {
                      const capIcon = CAP_ICON_MAP[group.id]
                      const CapIcon = capIcon?.icon ?? Blocks
                      const capIconClass = capIcon?.className ?? 'text-muted-foreground'
                      const bgClass = CAP_BG_MAP[group.id] ?? 'bg-muted/30'
                      return (
                        <div
                          key={group.id}
                          className={`relative flex flex-col rounded-2xl p-3 transition-colors ${bgClass}`}
                        >
                          <div className="flex items-center gap-2">
                            <CapIcon className={`h-4 w-4 shrink-0 ${capIconClass}`} />
                            <span className="text-xs font-medium">{group.label}</span>
                            <Switch
                              checked={false}
                              onCheckedChange={(checked) =>
                                handleToggleCapability(group.id, Boolean(checked))
                              }
                              className="ml-auto"
                            />
                          </div>
                          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground line-clamp-2">
                            {group.description}
                          </p>
                        </div>
                      )
                    })}
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
                  <TenasSettingsCard padding="xy">
                    <Textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Markdown 格式的系统提示词..."
                      rows={16}
                      className="border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                    />
                  </TenasSettingsCard>
                </div>
              </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
})
