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
import { TenasSettingsGroup } from '@tenas-ai/ui/tenas/TenasSettingsGroup'
import { TenasSettingsCard } from '@tenas-ai/ui/tenas/TenasSettingsCard'
import {
  Bot,
  Blocks,
  Calendar,
  Code,
  FileSearch,
  FilePen,
  FolderOpen,
  Globe,
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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import { useTabs } from '@/hooks/use-tabs'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tenas-ai/ui/tooltip'

/** 能力组 ID → 彩色图标映射 */
const CAP_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  browser: { icon: Globe, className: 'text-blue-500' },
  'file-read': { icon: FileSearch, className: 'text-emerald-500' },
  'file-write': { icon: FilePen, className: 'text-green-600' },
  shell: { icon: Terminal, className: 'text-slate-500' },
  email: { icon: Mail, className: 'text-red-500' },
  calendar: { icon: Calendar, className: 'text-orange-500' },
  media: { icon: Image, className: 'text-pink-500' },
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
  media: 'bg-pink-50 dark:bg-pink-950/40',
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
  capabilities: string[]
  skills: string[]
  allowSubAgents: boolean
  maxDepth: number
  systemPrompt: string
}

function makeSnapshot(s: FormSnapshot): string {
  return JSON.stringify(s)
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
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [allowSubAgents, setAllowSubAgents] = useState(false)
  const [maxDepth, setMaxDepth] = useState(1)
  const [systemPrompt, setSystemPrompt] = useState('')

  // 逻辑：保存初始快照用于脏检测。
  const savedSnapshotRef = useRef('')

  const panelSlot = useStackPanelSlot()
  const { workspace } = useWorkspace()
  const activeTabId = useTabs((s) => s.activeTabId)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)

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

  // 逻辑：详情加载后回填表单并保存初始快照。
  useEffect(() => {
    if (!detailQuery.data) return
    const d = detailQuery.data
    setName(d.name)
    setDescription(d.description)
    setIcon(d.icon)
    setModel(d.model)
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
      capabilities: d.capabilities,
      skills: d.skills,
      allowSubAgents: d.allowSubAgents,
      maxDepth: d.maxDepth,
      systemPrompt: d.systemPrompt,
    })
  }, [detailQuery.data])

  // 逻辑：新建模式初始化空快照。
  useEffect(() => {
    if (isNew) {
      savedSnapshotRef.current = makeSnapshot({
        name: '', description: '', icon: 'bot', model: '',
        capabilities: [], skills: [], allowSubAgents: false,
        maxDepth: 1, systemPrompt: '',
      })
    }
  }, [isNew])

  const currentSnapshot = makeSnapshot({
    name, description, icon, model, capabilities,
    skills, allowSubAgents, maxDepth, systemPrompt,
  })
  const isDirty = currentSnapshot !== savedSnapshotRef.current

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
      capabilities,
      skills,
      allowSubAgents,
      maxDepth,
      systemPrompt: systemPrompt.trim() || undefined,
    })
  }, [
    name, description, icon, model, capabilities, skills,
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
              readOnly={isSystem}
              className="mx-auto max-w-[220px] border-0 bg-transparent text-center text-base font-semibold shadow-none focus-visible:ring-0"
            />
          </div>

          {/* 模型 + 子Agent 分组卡片 */}
          <TenasSettingsCard divided>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-sm font-medium">模型</span>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Auto（自动选择）"
                className="ml-auto max-w-[200px] border-0 bg-transparent text-right text-sm text-muted-foreground shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-sm font-medium">子Agent</span>
              <div className="ml-auto flex items-center gap-2">
                {allowSubAgents ? (
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value) || 1)}
                    className="w-14 border-0 bg-transparent text-right text-xs text-muted-foreground shadow-none focus-visible:ring-0"
                    title="最大深度"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">允许创建</span>
                )}
                <Switch
                  checked={allowSubAgents}
                  onCheckedChange={setAllowSubAgents}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-sm font-medium">备注</span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选备注信息"
                className="ml-auto max-w-[200px] border-0 bg-transparent text-right text-sm text-muted-foreground shadow-none focus-visible:ring-0"
              />
            </div>
          </TenasSettingsCard>

          {/* Tabs: 能力组 / 技能 / 提示词 */}
          <Tabs defaultValue="capabilities">
            <div className="sticky top-0 z-10 bg-background pb-2">
              <div className="text-sm font-medium">配置</div>
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
            </div>
              <TabsContent value="capabilities" className="mt-0">
                <div className="grid grid-cols-2 gap-3 py-3">
                  {capGroups.map((group) => {
                    const capIcon = CAP_ICON_MAP[group.id]
                    const CapIcon = capIcon?.icon ?? Blocks
                    const capIconClass = capIcon?.className ?? 'text-muted-foreground'
                    const bgClass = CAP_BG_MAP[group.id] ?? 'bg-muted/30'
                    const isActive = capabilities.includes(group.id)
                    return (
                      <div
                        key={group.id}
                        className={`relative flex flex-col rounded-2xl p-3 transition-colors ${bgClass}`}
                      >
                        <div className="flex items-center gap-2">
                          <CapIcon className={`h-4 w-4 shrink-0 ${capIconClass}`} />
                          <span className="text-xs font-medium">{group.label}</span>
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) =>
                              handleToggleCapability(group.id, Boolean(checked))
                            }
                            disabled={isSystem}
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