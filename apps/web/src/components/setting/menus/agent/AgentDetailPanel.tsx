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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useMutation, useQuery } from '@tanstack/react-query'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { queryClient, trpc } from '@/utils/trpc'
import { useStackPanelSlot } from '@/hooks/use-stack-panel-slot'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import { Textarea } from '@openloaf/ui/textarea'
import { Checkbox } from '@openloaf/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@openloaf/ui/tabs'
import { OpenLoafSettingsCard } from '@openloaf/ui/openloaf/OpenLoafSettingsCard'
import { FilterTab } from '@openloaf/ui/filter-tab'
import {
  Blocks,
  Bot,
  Edit3,
  Eye,
  FolderCog,
  FolderOpen,
  Gauge,
  Globe,
  PencilLine,
  Save,
  ScrollText,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Streamdown, defaultRemarkPlugins, type StreamdownProps } from 'streamdown'
import { code } from '@streamdown/code'
import { toast } from 'sonner'

import '@/components/file/style/streamdown-viewer.css'
import { useLayoutState } from '@/hooks/use-layout-state'
import { Tooltip, TooltipContent, TooltipTrigger } from '@openloaf/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

/** Streamdown 代码高亮主题。 */
const PROMPT_SHIKI_THEME: NonNullable<StreamdownProps['shikiTheme']> = [
  'github-light',
  'github-dark-high-contrast',
]

/** Streamdown remark 插件列表。 */
const PROMPT_REMARK_PLUGINS = Object.values(defaultRemarkPlugins)

type AgentDetailPanelProps = {
  agentPath?: string
  scope?: 'project' | 'global'
  projectId?: string
  isNew?: boolean
  isSystem?: boolean
  tabId?: string
  panelKey?: string
}

/**
 * 已知系统 Agent folderName 集合（与后端 systemAgentDefinitions.SYSTEM_AGENT_ORDER 保持一致）。
 * 用作前端只读判断的兜底：即使父组件传入的 isSystem prop 因 server 未重启暂时为 false，
 * 只要 detailQuery 加载后的 folderName 命中此集合，面板依旧进入只读模式。
 */
const KNOWN_SYSTEM_FOLDERS: ReadonlySet<string> = new Set([
  'master',
  'general-purpose',
  'explore',
])

type SkillScope = 'builtin' | 'project' | 'global'

type SkillSummary = {
  name: string
  originalName: string
  description: string
  path: string
  folderName: string
  ignoreKey: string
  scope: SkillScope
  isEnabled: boolean
  isDeletable: boolean
  ownerProjectId?: string
  ownerProjectTitle?: string
  colorIndex?: number | null
  icon?: string
  /** Tool IDs declared in SKILL.md frontmatter — 目前仅声明，不参与运行时 toolset。 */
  tools?: string[]
}

const REMOVED_MEDIA_TOOL_IDS = new Set([
  'image-generate',
  'video-generate',
  'list-media-models',
])

type CapabilityTool = { id: string; label: string; description: string }
type CapabilityGroup = {
  id: string
  label: string
  description: string
  icon: string
  toolIds: string[]
  tools: CapabilityTool[]
}

// 逻辑：按 lucide-react 的 kebab-case 名字动态解析图标。能力组 icon 由后端下发，
// 前端不再维护硬编码映射——新增能力组只需要后端加一条数据即可。
const LUCIDE_ICON_CACHE = new Map<string, LucideIcon>()
function resolveLucideIcon(name: string): LucideIcon | null {
  if (!name) return null
  const cached = LUCIDE_ICON_CACHE.get(name)
  if (cached) return cached
  const importer = (
    dynamicIconImports as Record<string, () => Promise<{ default: LucideIcon }>>
  )[name]
  if (!importer) return null
  const Component = dynamic(importer, { ssr: false }) as unknown as LucideIcon
  LUCIDE_ICON_CACHE.set(name, Component)
  return Component
}

function normalizeAgentToolIds(value: string[]): string[] {
  const normalized = value.map((id) => id.trim()).filter(Boolean)
  return Array.from(new Set(normalized)).filter(
    (id) => !REMOVED_MEDIA_TOOL_IDS.has(id),
  )
}

type FormSnapshot = {
  name: string
  description: string
  icon: string
  toolIds: string[]
  skills: string[]
  allowSubAgents: boolean
  maxDepth: number
  systemPrompt: string
}

function makeSnapshot(s: FormSnapshot): string {
  return JSON.stringify(s)
}

/** 与专门技能页对齐的卡片渐变配色。 */
const SKILL_CARD_GRADIENTS = [
  'from-teal-100 to-cyan-50 dark:from-teal-900/40 dark:to-cyan-900/30',
  'from-violet-100 to-fuchsia-50 dark:from-violet-900/40 dark:to-fuchsia-900/30',
  'from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/30',
  'from-sky-100 to-blue-50 dark:from-sky-900/40 dark:to-blue-900/30',
  'from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/30',
  'from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/30',
  'from-indigo-100 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/30',
  'from-lime-100 to-yellow-50 dark:from-lime-900/40 dark:to-yellow-900/30',
]

const SKILL_ACCENT_BORDER_COLORS = [
  'border-l-teal-300 dark:border-l-teal-600',
  'border-l-violet-300 dark:border-l-violet-600',
  'border-l-amber-300 dark:border-l-amber-600',
  'border-l-sky-300 dark:border-l-sky-600',
  'border-l-rose-300 dark:border-l-rose-600',
  'border-l-emerald-300 dark:border-l-emerald-600',
  'border-l-indigo-300 dark:border-l-indigo-600',
  'border-l-lime-300 dark:border-l-lime-600',
]

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

type SkillGroup = {
  key: string
  label: string
  icon: typeof Globe
  skills: SkillSummary[]
}

/** Agent detail / edit panel. */
export const AgentDetailPanel = memo(function AgentDetailPanel({
  agentPath,
  scope = 'global',
  projectId,
  isNew = false,
  isSystem = false,
}: AgentDetailPanelProps) {
  // 系统 Agent 整体只读：名称/描述/技能/提示词全部禁止修改，stack header 不渲染保存/删除按钮。
  // 额外加载 ai 命名空间以解析 core tool 的中文标签（ai:toolNames.Bash → "终端命令"）。
  const { t } = useTranslation(['settings', 'common', 'ai'])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('bot')
  const [toolIds, setToolIds] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [allowSubAgents, setAllowSubAgents] = useState(false)
  const [maxDepth, setMaxDepth] = useState(1)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [promptPreview, setPromptPreview] = useState(true)
  const [activeConfigTab, setActiveConfigTab] = useState('skills')
  const [defaultSnapshot, setDefaultSnapshot] = useState('')

  // 逻辑：保存初始快照用于脏检测。
  const savedSnapshotRef = useRef('')
  const pendingSnapshotOverrideRef = useRef<string | null>(null)
  const silentSaveRef = useRef(false)
  const isDirtyRef = useRef(false)

  const panelSlot = useStackPanelSlot()
  const removeStackItem = useLayoutState((s) => s.removeStackItem)

  // 逻辑：编辑模式下加载 Agent 详情。
  const detailQuery = useQuery({
    ...trpc.settings.getAgentDetail.queryOptions(
      agentPath && scope
        ? { agentPath, scope }
        : { agentPath: '', scope: 'global' },
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

  // 兜底判断系统 Agent：prop `isSystem` 依赖 server 返回，为避免 server 未重启导致漏判，
  // 只要 detailQuery 加载后的 folderName 命中 KNOWN_SYSTEM_FOLDERS，或者 agentPath 是
  // `builtin://` 虚拟路径，面板都强制进入只读模式。
  const isReadOnly = useMemo(() => {
    if (isSystem) return true
    const folderName = detailQuery.data?.folderName ?? ''
    if (folderName && KNOWN_SYSTEM_FOLDERS.has(folderName)) return true
    if (agentPath && agentPath.startsWith('builtin://')) return true
    return false
  }, [isSystem, detailQuery.data?.folderName, agentPath])

  const getSavedSnapshot = useCallback(() => {
    if (!savedSnapshotRef.current) return null
    try {
      return JSON.parse(savedSnapshotRef.current) as FormSnapshot
    } catch {
      return null
    }
  }, [])

  // 逻辑：打开 Agent 所在文件夹（Electron 外壳首选，Web 兜底推 folder-tree-preview）。
  const pushStackItem = useLayoutState((s) => s.pushStackItem)
  const handleOpenFolder = useCallback(() => {
    if (!agentPath) return
    const normalized = agentPath.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    const dirPath = lastSlash >= 0 ? normalized.slice(0, lastSlash) : normalized
    const dirUri = dirPath.startsWith('file://')
      ? dirPath
      : /^[A-Za-z]:\//.test(dirPath)
        ? `file:///${dirPath}`
        : `file://${dirPath}`

    const api = window.openloafElectron
    if (api?.openPath) {
      void api.openPath({ uri: dirUri }).then((res) => {
        if (!res?.ok) toast.error(res?.reason ?? t('settings:agent.panel.openFolderFailed'))
      })
      return
    }
    pushStackItem({
      id: `agent-folder:${agentPath}`,
      sourceKey: `agent-folder:${agentPath}`,
      component: 'folder-tree-preview',
      title: t('settings:agent.tabTitle', { name: name || 'folder' }),
      params: {
        rootUri: dirUri,
        currentUri: '',
        projectId: scope === 'project' ? projectId : undefined,
      },
    })
  }, [agentPath, pushStackItem, name, scope, projectId, t])

  // 逻辑：加载技能列表用于关联选择，与专门技能页共用 trpc 查询。
  const skillsQuery = useQuery(
    trpc.settings.getSkills.queryOptions(projectId ? { projectId } : undefined),
  )
  const availableSkills = useMemo(
    () => (skillsQuery.data ?? []) as SkillSummary[],
    [skillsQuery.data],
  )

  // 逻辑：加载能力组，用于把 agent 的 toolIds 汇总展示为能力徽章（与智能体卡片一致）。
  const capGroupsQuery = useQuery(trpc.settings.getCapabilityGroups.queryOptions())
  const capGroups = useMemo(
    () => (capGroupsQuery.data ?? []) as CapabilityGroup[],
    [capGroupsQuery.data],
  )
  // 逻辑：工具 ID → 人类可读 label 映射。capability group 里已带 label，拍平成字典，
  // 给 core 单兵工具（如 ToolSearch / LoadSkill）的 chip 展示用。
  const toolLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of capGroups) {
      for (const tool of group.tools ?? []) {
        map.set(tool.id, tool.label || tool.id)
      }
    }
    return map
  }, [capGroups])

  // 逻辑：core 与 deferred 切分——
  // coreToolIds 由后端按 folderName 给出（master/channel/general-purpose/explore 各自一套 XXX_CORE_TOOL_IDS），
  // 它是 Agent 运行时恒定加载的工具集，跟 agent.toolIds 是否显式列出 core 无关——
  // builtin Agent 的 toolIds 里只存 deferred 清单，core 是 factory 层隐式追加的。
  // 所以 "已加载工具" = coreToolIds 全量，"懒加载工具" = agent.toolIds \ coreToolIds。
  const runtimeCoreToolIds = useMemo(
    () => (detailQuery.data?.coreToolIds ?? []) as string[],
    [detailQuery.data?.coreToolIds],
  )
  const coreToolIdSet = useMemo(() => new Set(runtimeCoreToolIds), [runtimeCoreToolIds])
  const deferredToolIds = useMemo(
    () => toolIds.filter((id) => !coreToolIdSet.has(id)),
    [toolIds, coreToolIdSet],
  )

  // 逻辑：core 工具通常是单兵、低粒度（Read/Edit/Bash/ToolSearch...），用 per-tool chip 展示更直观。
  // label lookup 优先级：ai:toolNames.<id> i18n → capGroups 里的 tool.label → 原始 id。
  // 这样能覆盖 capGroups 之外的系统工具（ToolSearch / LoadSkill / MemorySave 等）。
  const coreToolsForDisplay = useMemo(
    () =>
      runtimeCoreToolIds.map((id) => ({
        id,
        label: t(`ai:toolNames.${id}`, { defaultValue: toolLabelMap.get(id) ?? id }),
      })),
    [runtimeCoreToolIds, toolLabelMap, t],
  )

  // 逻辑：deferred 工具按 capability group 汇总——tooltip 展示该组里真正被当前 agent 懒加载的工具。
  const deferredGroups = useMemo(() => {
    if (!deferredToolIds.length || capGroups.length === 0) return []
    const deferredSet = new Set(deferredToolIds)
    return capGroups
      .map((group) => {
        const ids = group.tools?.length ? group.tools.map((t) => t.id) : group.toolIds
        const loaded = (group.tools ?? []).filter((t) => deferredSet.has(t.id))
        const hit = ids.some((id) => deferredSet.has(id))
        return hit ? { group, loadedTools: loaded } : null
      })
      .filter((x): x is { group: CapabilityGroup; loadedTools: CapabilityTool[] } => !!x)
  }, [capGroups, deferredToolIds])

  // 逻辑：按 scope 分组并排序 — project 在前（包含 ownerProject 子分组），然后 global，最后 builtin。
  const skillGroups = useMemo((): SkillGroup[] => {
    const projectSkills = availableSkills.filter((s) => s.scope === 'project')
    const globalSkills = availableSkills.filter((s) => s.scope === 'global')
    const builtinSkills = availableSkills.filter((s) => s.scope === 'builtin')
    const groups: SkillGroup[] = []

    if (projectSkills.length > 0) {
      // 在项目视图内合并为一个 project 组；在全局视图内若按 owner 分子组更清晰，
      // 但 agent 编辑只是勾选，合并展示即可。
      const byProject = new Map<string, SkillSummary[]>()
      const order: string[] = []
      for (const skill of projectSkills) {
        const pid = skill.ownerProjectId || '_default'
        if (!byProject.has(pid)) {
          byProject.set(pid, [])
          order.push(pid)
        }
        byProject.get(pid)!.push(skill)
      }
      for (const pid of order) {
        const list = byProject.get(pid)!
        const title =
          list[0]?.ownerProjectTitle ||
          t('settings:skills.scopeProject', { defaultValue: '项目技能' })
        groups.push({
          key: `project:${pid}`,
          label: title,
          icon: FolderCog,
          skills: list,
        })
      }
    }

    if (globalSkills.length > 0) {
      groups.push({
        key: 'global',
        label: t('settings:skills.scopeGlobal', { defaultValue: '全局技能' }),
        icon: Globe,
        skills: globalSkills,
      })
    }

    if (builtinSkills.length > 0) {
      groups.push({
        key: 'builtin',
        label: t('settings:skills.scopeBuiltin', { defaultValue: '内置技能' }),
        icon: Wand2,
        skills: builtinSkills,
      })
    }

    return groups
  }, [availableSkills, t])

  // 逻辑：详情加载后回填表单并保存初始快照。
  useEffect(() => {
    if (!detailQuery.data) return
    if (savedSnapshotRef.current && isDirtyRef.current) return
    const d = detailQuery.data
    setName(d.name)
    setDescription(d.description)
    setIcon(d.icon)
    const sanitizedToolIds = Array.isArray(d.toolIds)
      ? normalizeAgentToolIds(d.toolIds)
      : []
    setToolIds(sanitizedToolIds)
    // 逻辑：主助手默认全选技能 — 如果 config 中 skills 为空数组，初始化为所有可用技能。
    const resolvedSkills =
      isMasterAgent &&
      Array.isArray(d.skills) &&
      d.skills.length === 0 &&
      availableSkills.length > 0
        ? availableSkills.map((s) => s.name)
        : d.skills
    setSkills(resolvedSkills)
    setAllowSubAgents(d.allowSubAgents)
    setMaxDepth(d.maxDepth)
    setSystemPrompt(d.systemPrompt)
    const snapshot = makeSnapshot({
      name: d.name,
      description: d.description,
      icon: d.icon,
      toolIds: sanitizedToolIds,
      skills: resolvedSkills,
      allowSubAgents: d.allowSubAgents,
      maxDepth: d.maxDepth,
      systemPrompt: d.systemPrompt,
    })
    savedSnapshotRef.current = snapshot
    setDefaultSnapshot(snapshot)
  }, [availableSkills, detailQuery.data, isMasterAgent])

  // 逻辑：新建模式初始化空快照。
  useEffect(() => {
    if (!isNew) return
    if (savedSnapshotRef.current && isDirtyRef.current) return
    const snapshot = makeSnapshot({
      name: '',
      description: '',
      icon: 'bot',
      toolIds: [],
      skills: [],
      allowSubAgents: false,
      maxDepth: 1,
      systemPrompt: '',
    })
    savedSnapshotRef.current = snapshot
    setDefaultSnapshot(snapshot)
  }, [isNew])

  const currentSnapshot = makeSnapshot({
    name,
    description,
    icon,
    toolIds,
    skills,
    allowSubAgents,
    maxDepth,
    systemPrompt,
  })
  isDirtyRef.current = currentSnapshot !== savedSnapshotRef.current
  const isDirty = isDirtyRef.current
  const canReset = defaultSnapshot !== '' && currentSnapshot !== defaultSnapshot

  const handleResetToDefault = useCallback(() => {
    if (!defaultSnapshot) return
    const parsed = JSON.parse(defaultSnapshot) as FormSnapshot
    setName(parsed.name)
    setDescription(parsed.description)
    setIcon(parsed.icon)
    setToolIds(normalizeAgentToolIds(parsed.toolIds))
    setSkills(parsed.skills)
    setAllowSubAgents(parsed.allowSubAgents)
    setMaxDepth(parsed.maxDepth)
    setSystemPrompt(parsed.systemPrompt)
  }, [defaultSnapshot])

  const saveMutation = useMutation(
    trpc.settings.saveAgent.mutationOptions({
      onSuccess: () => {
        if (!silentSaveRef.current) {
          toast.success(
            isNew ? t('settings:agent.panel.created') : t('settings:agent.panel.saved'),
          )
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
            queryKey: trpc.settings.getAgents.queryOptions({
              projectId,
              scopeFilter: 'project',
            }).queryKey,
          })
        }
        toast.success(t('settings:agent.panel.deletedSuccess'))
        savedSnapshotRef.current = currentSnapshot
        const stackItemId = useLayoutState.getState().activeStackItemId
        if (stackItemId) removeStackItem(stackItemId)
      },
      onError: (err) => toast.error(err.message),
    }),
  )

  const handleDelete = useCallback(() => {
    if (!agentPath || isNew) return
    const confirmed = window.confirm(
      t('settings:agent.deleteConfirm', { name: name || t('common:untitled') }),
    )
    if (!confirmed) return
    const folderName = detailQuery.data?.folderName ?? ''
    const ignoreKey = folderName || ''
    deleteMutation.mutate({
      scope,
      projectId: scope === 'project' ? projectId : undefined,
      ignoreKey,
      agentPath,
    })
  }, [
    agentPath,
    isNew,
    name,
    scope,
    projectId,
    detailQuery.data?.folderName,
    deleteMutation,
    t,
  ])

  // Master silent-save：修改 toolIds / skills / prompt 后立即持久化，
  // 让主助手编辑即时生效于 chat，不依赖用户点保存。
  const syncMasterAgent = useCallback(
    (patch: Partial<FormSnapshot>) => {
      if (!isMasterAgent || !agentPath || isNew) return
      const baseSnapshot =
        getSavedSnapshot() ?? {
          name,
          description,
          icon,
          toolIds,
          skills,
          allowSubAgents,
          maxDepth,
          systemPrompt,
        }
      const nextSnapshot: FormSnapshot = { ...baseSnapshot, ...patch }
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
        toolIds: normalizeAgentToolIds(nextSnapshot.toolIds),
        skills: nextSnapshot.skills,
        allowSubAgents: nextSnapshot.allowSubAgents,
        maxDepth: nextSnapshot.maxDepth,
        systemPrompt: nextSnapshot.systemPrompt.trim() || undefined,
      })
    },
    [
      agentPath,
      allowSubAgents,
      description,
      getSavedSnapshot,
      icon,
      isMasterAgent,
      isNew,
      maxDepth,
      name,
      projectId,
      saveMutation,
      scope,
      skills,
      systemPrompt,
      toolIds,
    ],
  )

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.error(t('settings:agent.panel.nameRequired'))
      return
    }
    saveMutation.mutate({
      scope,
      projectId,
      agentPath: isNew ? undefined : agentPath,
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      toolIds: normalizeAgentToolIds(toolIds),
      skills,
      allowSubAgents,
      maxDepth,
      systemPrompt: systemPrompt.trim() || undefined,
    })
  }, [
    name,
    description,
    icon,
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
    t,
  ])

  const handleToggleSkill = useCallback(
    (skillName: string, checked: boolean) => {
      setSkills((prev) => {
        const next = checked ? [...prev, skillName] : prev.filter((s) => s !== skillName)
        if (isMasterAgent) syncMasterAgent({ skills: next })
        return next
      })
    },
    [isMasterAgent, syncMasterAgent],
  )

  const handleToggleAllSkills = useCallback(() => {
    const allNames = availableSkills.map((s) => s.name)
    const allSelected = allNames.every((n) => skills.includes(n))
    const next = allSelected ? [] : allNames
    setSkills(next)
    if (isMasterAgent) syncMasterAgent({ skills: next })
  }, [availableSkills, skills, isMasterAgent, syncMasterAgent])

  const handleRequestClose = useCallback((): boolean => {
    if (!isDirty) return true
    return window.confirm(t('settings:agent.panel.unsaved'))
  }, [isDirty, t])

  // Stack 模式：向 PanelFrame 的 StackHeader 注入操作按钮与关闭拦截。
  // 系统 Agent（isReadOnly）不渲染删除/保存按钮 — 仅保留"打开目录"供用户查看源文件。
  useEffect(() => {
    if (!panelSlot) return
    panelSlot.setSlot({
      rightSlotBeforeClose: (
        <>
          {agentPath && !isNew && !isReadOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  aria-label={t('settings:agent.panel.deleteTooltip')}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('settings:agent.panel.deleteTooltip')}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {agentPath && !isReadOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleOpenFolder}
                  aria-label={t('settings:agent.panel.openFolderLabel')}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('settings:agent.panel.openFolderTooltip')}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {isDirty && !isReadOnly ? (
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
      onBeforeClose: handleRequestClose,
    })
    return () => panelSlot.setSlot(null)
  }, [
    panelSlot,
    isDirty,
    isReadOnly,
    handleSave,
    handleOpenFolder,
    handleDelete,
    handleRequestClose,
    agentPath,
    isNew,
    name,
    saveMutation.isPending,
    deleteMutation.isPending,
    t,
  ])

  if (!isNew && detailQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('settings:agent.panel.loadingDetail')}
      </div>
    )
  }

  const allSkillsSelected =
    availableSkills.length > 0 && availableSkills.every((s) => skills.includes(s.name))

  // 只读模式下显示国际化后的名称与描述（从 agentTemplates i18n 查）；
  // 可编辑模式保留原始 AGENT.md 值，避免把译文写回磁盘造成漂移。
  const templateFolderName = detailQuery.data?.folderName ?? ''
  const displayName = isReadOnly
    ? t(`settings:agentTemplates.${templateFolderName}.name`, { defaultValue: name })
    : name
  const displayDescription = isReadOnly
    ? t(`settings:agentTemplates.${templateFolderName}.description`, {
        defaultValue: description,
      })
    : description

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="space-y-4 p-4">
          {/* 基本信息区 */}
          <div className="flex flex-col items-center gap-2 pt-2 pb-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Bot className="h-7 w-7 text-foreground" />
            </div>
            <Input
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings:agent.panel.namePlaceholder')}
              readOnly={isReadOnly}
              className="mx-auto max-w-[260px] border-0 bg-transparent text-center text-base font-semibold shadow-none focus-visible:ring-0"
            />
            {isReadOnly ? (
              <span className="rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('settings:agent.systemReadOnly', {
                  defaultValue: '系统 Agent · 只读',
                })}
              </span>
            ) : null}
          </div>

          {/* 子 Agent 并发数（master）/ 备注（非 master） */}
          <OpenLoafSettingsCard divided>
            {isMasterAgent ? (
              <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-foreground" />
                  {t('settings:agent.panel.maxSubagents')}
                </span>
                <div
                  className={cn(
                    'ml-auto flex items-center rounded-3xl border border-border/70 bg-muted/40',
                    isReadOnly && 'pointer-events-none opacity-60',
                  )}
                >
                  {[2, 3, 4, 5].map((count) => (
                    <FilterTab
                      key={count}
                      text={`${count}`}
                      selected={maxDepth === count}
                      onSelect={() => {
                        if (isReadOnly) return
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
                  <Edit3 className="h-4 w-4 text-foreground" />
                  {t('settings:agent.panel.notes')}
                </span>
                <Input
                  value={displayDescription}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('settings:agent.panel.notesPlaceholder')}
                  readOnly={isReadOnly}
                  className="ml-auto w-full flex-1 min-w-[260px] max-w-[640px] border-0 bg-transparent text-right text-sm text-muted-foreground shadow-none focus-visible:ring-0"
                />
              </div>
            )}
          </OpenLoafSettingsCard>

          {/* 已加载工具 — Agent 真正常驻的 core 工具（单兵 chip，含 ToolSearch / LoadSkill / MemorySave 等系统工具） */}
          {coreToolsForDisplay.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Blocks className="h-4 w-4 text-foreground" />
                {t('settings:agent.panel.toolsLabel', { defaultValue: '已加载工具' })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {coreToolsForDisplay.map((tool) => (
                  <span
                    key={tool.id}
                    className="inline-flex items-center gap-1 rounded-3xl bg-secondary px-2 py-0.5 text-[11px] cursor-default"
                    title={tool.id}
                  >
                    <Blocks className="h-3 w-3 text-foreground" />
                    {tool.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* 懒加载工具组 — agent.toolIds 里 core 之外的部分，按 capability group 展示（ToolSearch pull mode 运行时按需激活） */}
          {deferredGroups.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-foreground" />
                {t('settings:agent.panel.lazyToolsLabel', {
                  defaultValue: '懒加载工具组',
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {deferredGroups.map(({ group, loadedTools }) => {
                  const CapIcon = resolveLucideIcon(group.icon) ?? Blocks
                  return (
                    <Tooltip key={group.id}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-3xl bg-secondary px-2 py-0.5 text-[11px] cursor-default">
                          <CapIcon className="h-3 w-3 text-foreground" />
                          {group.label || group.id}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[280px]">
                        {loadedTools.length > 0 ? (
                          <ul className="space-y-0.5 text-xs">
                            {loadedTools.map((tool) => (
                              <li key={tool.id}>{tool.label || tool.id}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs">{group.label || group.id}</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Tabs: 技能 / 提示词 */}
          <Tabs value={activeConfigTab} onValueChange={setActiveConfigTab}>
            <div className="sticky top-0 z-10 bg-background">
              <div className="text-sm font-medium">{t('settings:agent.panel.configLabel')}</div>
              <div className="flex items-center justify-between gap-2">
                <TabsList className="mt-1.5 h-8 w-max rounded-3xl border border-border/70 bg-muted/40 p-1">
                  <TabsTrigger
                    value="skills"
                    className="h-6 rounded-3xl px-2.5 text-xs whitespace-nowrap"
                  >
                    <Sparkles className="mr-1 h-3 w-3 text-foreground" />
                    {t('settings:agent.panel.skillsTab')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="prompt"
                    className="h-6 rounded-3xl px-2.5 text-xs whitespace-nowrap"
                  >
                    <ScrollText className="mr-1 h-3 w-3 text-foreground" />
                    {t('settings:agent.panel.promptTab')}
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-1">
                  {activeConfigTab === 'prompt' && !isReadOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-3xl px-3 text-xs bg-secondary text-secondary-foreground hover:bg-accent"
                      onClick={() => setPromptPreview((v) => !v)}
                    >
                      {promptPreview ? (
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Eye className="mr-1 h-3.5 w-3.5" />
                      )}
                      {promptPreview
                        ? t('settings:agent.panel.promptEdit')
                        : t('settings:agent.panel.promptPreview')}
                    </Button>
                  ) : null}
                  {!isReadOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-3xl px-3 text-xs"
                      onClick={handleResetToDefault}
                      disabled={!canReset}
                    >
                      {t('settings:agent.panel.resetBtn')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <TabsContent value="skills" className="mt-0">
              <div className="py-3">
                {skillsQuery.isLoading ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[86px] animate-pulse rounded-[22px] bg-muted/40"
                      />
                    ))}
                  </div>
                ) : availableSkills.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('settings:agent.panel.noSkills')}
                  </p>
                ) : (
                  <>
                    {!isReadOnly ? (
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={handleToggleAllSkills}
                        >
                          {allSkillsSelected
                            ? t('settings:agent.panel.selectNone')
                            : t('settings:agent.panel.selectAll')}
                        </button>
                      </div>
                    ) : null}
                    <div className="space-y-5">
                      {skillGroups.map((group) => (
                        <div key={group.key}>
                          {skillGroups.length > 1 ? (
                            <div className="mb-2 flex items-center gap-1.5 px-1">
                              <group.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                              <h3 className="flex-1 text-xs font-medium text-muted-foreground/70">
                                {group.label}
                                <span className="ml-1.5 tabular-nums">
                                  ({group.skills.length})
                                </span>
                              </h3>
                            </div>
                          ) : null}
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3">
                            {group.skills.map((skill) => {
                              const isSelected = skills.includes(skill.name)
                              const colorIdx =
                                skill.colorIndex != null
                                  ? skill.colorIndex % SKILL_CARD_GRADIENTS.length
                                  : hashCode(
                                      skill.ignoreKey || skill.path || skill.name,
                                    ) % SKILL_CARD_GRADIENTS.length
                              return (
                                <label
                                  key={
                                    skill.ignoreKey ||
                                    skill.path ||
                                    `${skill.scope}:${skill.name}`
                                  }
                                  className={cn(
                                    'group relative flex cursor-pointer flex-col overflow-hidden rounded-[22px] border-l-[3px] border border-border/70 shadow-none transition-all duration-200 hover:shadow-none hover:border-foreground/40',
                                    SKILL_ACCENT_BORDER_COLORS[colorIdx],
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'px-3.5 pt-3 pb-2 bg-gradient-to-r',
                                      SKILL_CARD_GRADIENTS[colorIdx],
                                    )}
                                  >
                                    <div className="flex min-w-0 items-start justify-between gap-2">
                                      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium text-foreground">
                                        {skill.icon ? (
                                          <span className="shrink-0 text-sm leading-none">
                                            {skill.icon}
                                          </span>
                                        ) : null}
                                        <span className="truncate">{skill.name}</span>
                                      </div>
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) =>
                                          handleToggleSkill(skill.name, Boolean(checked))
                                        }
                                        disabled={isReadOnly}
                                        className="mt-0.5 shrink-0"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-1 flex-col bg-background/50 px-3.5 pb-3 pt-1.5 dark:bg-background/30">
                                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                      {skill.description?.trim() || skill.name}
                                    </p>
                                    <span className="mt-2 truncate text-[11px] text-muted-foreground/60">
                                      {skill.folderName}
                                    </span>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="prompt" className="mt-0">
              <div className="py-3">
                {promptPreview || isReadOnly ? (
                  <OpenLoafSettingsCard padding="none">
                    <div className="min-h-[400px] overflow-auto p-4">
                      <Streamdown
                        mode="static"
                        className="streamdown-viewer space-y-3"
                        remarkPlugins={PROMPT_REMARK_PLUGINS}
                        plugins={{ code }}
                        shikiTheme={PROMPT_SHIKI_THEME}
                      >
                        {systemPrompt || t('settings:agent.panel.promptPlaceholder')}
                      </Streamdown>
                    </div>
                  </OpenLoafSettingsCard>
                ) : (
                  <OpenLoafSettingsCard padding="none">
                    <Textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder={t('settings:agent.panel.promptPlaceholder')}
                      rows={16}
                      readOnly={isReadOnly}
                      className="min-h-[400px] resize-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                      style={{
                        height: `${Math.max(400, (systemPrompt.split('\n').length + 2) * 18)}px`,
                      }}
                    />
                  </OpenLoafSettingsCard>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
})
