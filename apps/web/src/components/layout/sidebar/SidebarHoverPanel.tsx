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

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient, skipToken } from '@tanstack/react-query'
import { Edit2, Loader2, MoreHorizontal, Palette, Pin, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@openloaf/ui/hover-card'
import { Button } from '@openloaf/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@openloaf/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@openloaf/ui/dialog'
import { Input } from '@openloaf/ui/input'
import { trpc } from '@/utils/trpc'
import { useProjects } from '@/hooks/use-projects'
import { useSidebarNavigation } from '@/hooks/use-sidebar-navigation'
import type { ProjectNode } from '@openloaf/api/services/projectTreeService'

interface SidebarHoverPanelProps {
  type: 'all-chats' | 'project-chats'
  projectId?: string
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

interface HistoryItem {
  id: string
  title: string
  createdAt: string | Date
  updatedAt: string | Date
  isPin: boolean
  projectId: string | null
  kind: 'chat' | 'board'
  folderUri?: string
}

interface HistoryGroup {
  key: string
  labelKey: string
  items: HistoryItem[]
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function groupItemsByTime(items: HistoryItem[]): HistoryGroup[] {
  const now = new Date()
  const todayStart = startOfDay(now).getTime()
  const oneDay = 24 * 60 * 60 * 1000

  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  const pinned: HistoryItem[] = []
  const today: HistoryItem[] = []
  const yesterday: HistoryItem[] = []
  const within7: HistoryItem[] = []
  const within30: HistoryItem[] = []
  const byMonth = new Map<string, HistoryItem[]>()

  for (const item of sorted) {
    if (item.isPin) {
      pinned.push(item)
      continue
    }
    const t = new Date(item.updatedAt)
    const diffDays = Math.floor((todayStart - startOfDay(t).getTime()) / oneDay)
    if (diffDays === 0) today.push(item)
    else if (diffDays === 1) yesterday.push(item)
    else if (diffDays < 7) within7.push(item)
    else if (diffDays < 30) within30.push(item)
    else {
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
      const list = byMonth.get(key) ?? []
      list.push(item)
      byMonth.set(key, list)
    }
  }

  const groups: HistoryGroup[] = []
  if (pinned.length)
    groups.push({ key: 'pinned', labelKey: 'session.groupLabel.pinned', items: pinned })
  if (today.length)
    groups.push({ key: 'today', labelKey: 'session.groupLabel.today', items: today })
  if (yesterday.length)
    groups.push({ key: 'yesterday', labelKey: 'session.groupLabel.yesterday', items: yesterday })
  if (within7.length)
    groups.push({ key: 'within7', labelKey: 'session.groupLabel.within7', items: within7 })
  if (within30.length)
    groups.push({ key: 'within30', labelKey: 'session.groupLabel.within30', items: within30 })

  for (const [key, list] of byMonth) {
    groups.push({ key, labelKey: key, items: list })
  }

  return groups
}

const PROJECT_LABEL_COLORS = [
  { bg: 'bg-ol-blue-bg', text: 'text-ol-blue' },
  { bg: 'bg-ol-purple-bg', text: 'text-ol-purple' },
  { bg: 'bg-ol-amber-bg', text: 'text-ol-amber' },
  { bg: 'bg-ol-green-bg', text: 'text-ol-green' },
  { bg: 'bg-ol-red-bg', text: 'text-ol-red' },
  { bg: 'bg-ol-purple-bg', text: 'text-ol-purple' },
  { bg: 'bg-ol-green-bg', text: 'text-ol-green' },
  { bg: 'bg-ol-amber-bg', text: 'text-ol-amber' },
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getProjectColor(projectId: string) {
  return PROJECT_LABEL_COLORS[hashString(projectId) % PROJECT_LABEL_COLORS.length]
}

function buildProjectNameMap(projects?: ProjectNode[]): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (items?: ProjectNode[]) => {
    items?.forEach((item) => {
      if (item.projectId) map.set(item.projectId, item.title)
      if (item.children?.length) walk(item.children)
    })
  }
  walk(projects)
  return map
}

function buildProjectRootUriMap(projects?: ProjectNode[]): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (items?: ProjectNode[]) => {
    items?.forEach((item) => {
      if (item.projectId) map.set(item.projectId, item.rootUri)
      if (item.children?.length) walk(item.children)
    })
  }
  walk(projects)
  return map
}

export function SidebarHoverPanel({
  type,
  projectId,
  children,
  side = 'right',
  align = 'start',
}: SidebarHoverPanelProps) {
  const { t } = useTranslation('nav')
  const { t: tAi } = useTranslation('ai')
  const { t: tCommon } = useTranslation('common')
  const nav = useSidebarNavigation()
  const { data: projects } = useProjects()
  const projectNameMap = useMemo(() => buildProjectNameMap(projects), [projects])
  const projectRootUriMap = useMemo(() => buildProjectRootUriMap(projects), [projects])
  const queryClient = useQueryClient()

  // --- Controlled HoverCard: lock when menu/dialog is open ---
  const [hoverOpen, setHoverOpen] = useState(false)
  const lockCountRef = useRef(0)

  const lockHover = useCallback(() => {
    lockCountRef.current++
  }, [])
  const unlockHover = useCallback(() => {
    lockCountRef.current = Math.max(0, lockCountRef.current - 1)
    // If nothing is locking, allow the hover card to detect mouse leave naturally.
    // We don't force-close here because the mouse may still be inside the card.
  }, [])

  const handleHoverOpenChange = useCallback((open: boolean) => {
    if (!open && lockCountRef.current > 0) return
    setHoverOpen(open)
  }, [])

  // --- Rename dialog state (for boards) ---
  const [renameTarget, setRenameTarget] = useState<{
    kind: 'chat' | 'board'
    id: string
    title: string
    nextTitle: string
  } | null>(null)
  const [aiNaming, setAiNaming] = useState(false)

  // --- Data queries ---
  const chatQueryInput =
    type === 'all-chats'
      ? { limit: 50 }
      : type === 'project-chats' && projectId
        ? { projectId, limit: 50 }
        : null

  const chatQueryOpts = trpc.chat.listSidebarSessions.queryOptions(
    chatQueryInput ?? (skipToken as any),
  )
  const { data: chats, isLoading: chatsLoading } = useQuery({
    ...chatQueryOpts,
    staleTime: 30_000,
  })

  const boardQueryOpts = trpc.board.list.queryOptions(
    type === 'all-chats' ? {} : (skipToken as any),
  )
  const { data: boards, isLoading: boardsLoading } = useQuery({
    ...boardQueryOpts,
    staleTime: 30_000,
  })

  const isLoading = chatsLoading || (type === 'all-chats' && boardsLoading)

  // --- Mutations ---
  const chatUpdateMutation = useMutation(
    trpc.chat.updateSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.chat.listSidebarSessions.queryKey() })
      },
    }),
  )
  const chatDeleteMutation = useMutation(
    trpc.chat.deleteSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.chat.listSidebarSessions.queryKey() })
      },
    }),
  )
  const boardUpdateMutation = useMutation(
    trpc.board.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.board.list.queryKey() })
        setRenameTarget(null)
      },
    }),
  )
  const boardDeleteMutation = useMutation(
    trpc.board.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.board.list.queryKey() })
      },
    }),
  )

  // --- Merge chats + boards ---
  const groups = useMemo(() => {
    const items: HistoryItem[] = []
    for (const chat of (chats ?? []) as any[]) {
      items.push({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        isPin: chat.isPin ?? false,
        projectId: chat.projectId ?? null,
        kind: 'chat',
      })
    }
    if (type === 'all-chats') {
      for (const board of boards ?? []) {
        items.push({
          id: board.id,
          title: board.title,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          isPin: board.isPin ?? false,
          projectId: board.projectId ?? null,
          kind: 'board',
          folderUri: board.folderUri,
        })
      }
    }
    return groupItemsByTime(items)
  }, [chats, boards, type])

  // --- Click handlers ---
  const handleChatClick = useCallback(
    (chatId: string, chatTitle: string) => {
      nav.openChat(chatId, chatTitle)
    },
    [nav],
  )

  const handleBoardClick = useCallback(
    (item: HistoryItem) => {
      const targetProjectId = item.projectId ?? projectId ?? null
      const targetRootUri = targetProjectId
        ? projectRootUriMap.get(targetProjectId)
        : undefined
      if (!targetProjectId || !targetRootUri || !item.folderUri) return
      nav.openBoard({
        boardId: item.id,
        title: item.title || t('canvasList.untitled'),
        folderUri: item.folderUri,
        rootUri: targetRootUri,
        projectId: targetProjectId,
      })
    },
    [nav, projectId, projectRootUriMap, t],
  )

  const handleItemClick = useCallback(
    (item: HistoryItem) => {
      if (item.kind === 'board') {
        handleBoardClick(item)
      } else {
        handleChatClick(item.id, item.title)
      }
    },
    [handleChatClick, handleBoardClick],
  )

  // --- Action handlers ---
  const handleRename = useCallback(
    (item: HistoryItem) => {
      if (item.kind === 'chat') {
        const newTitle = prompt(t('chatHistoryList.renamePrompt'), item.title)
        if (newTitle && newTitle.trim() !== item.title) {
          chatUpdateMutation.mutate({
            sessionId: item.id,
            title: newTitle.trim(),
            isUserRename: true,
          })
        }
      } else {
        lockHover()
        setRenameTarget({ kind: 'board', id: item.id, title: item.title, nextTitle: item.title })
      }
    },
    [t, chatUpdateMutation, lockHover],
  )

  const handlePin = useCallback(
    (item: HistoryItem) => {
      const nextIsPin = !item.isPin
      const onSuccess = () => {
        toast.success(
          nextIsPin ? tAi('session.pinSuccess') : tAi('session.unpinSuccess'),
        )
      }
      const onError = (err: any) => {
        toast.error(err?.message ?? tAi('session.pinFailed'))
      }
      if (item.kind === 'chat') {
        chatUpdateMutation.mutate(
          { sessionId: item.id, isPin: nextIsPin },
          { onSuccess, onError },
        )
      } else {
        boardUpdateMutation.mutate(
          { boardId: item.id, isPin: nextIsPin },
          { onSuccess, onError },
        )
      }
    },
    [chatUpdateMutation, boardUpdateMutation, tAi],
  )

  const handleDelete = useCallback(
    (item: HistoryItem) => {
      if (item.kind === 'chat') {
        if (confirm(t('chatHistoryList.confirmDelete'))) {
          chatDeleteMutation.mutate({ sessionId: item.id })
        }
      } else {
        if (confirm(t('canvasList.confirmDelete'))) {
          boardDeleteMutation.mutate({ boardId: item.id })
        }
      }
    },
    [t, chatDeleteMutation, boardDeleteMutation],
  )

  // --- Board rename dialog ---
  const handleBoardRenameSave = useCallback(() => {
    if (!renameTarget || !renameTarget.nextTitle.trim()) return
    boardUpdateMutation.mutate({
      boardId: renameTarget.id,
      title: renameTarget.nextTitle.trim(),
    })
  }, [renameTarget, boardUpdateMutation])

  const inferBoardNameMutation = useMutation(
    trpc.settings.inferBoardName.mutationOptions(),
  )

  const handleAiName = useCallback(async () => {
    if (!renameTarget) return
    setAiNaming(true)
    try {
      const board = boards?.find((b) => b.id === renameTarget.id)
      if (!board) return
      const result = await inferBoardNameMutation.mutateAsync({
        boardFolderUri: board.folderUri,
      })
      if (result.title) {
        setRenameTarget((prev) => (prev ? { ...prev, nextTitle: result.title } : prev))
      } else {
        toast.error(t('canvasList.aiNameEmpty'))
      }
    } catch {
      toast.error(t('canvasList.aiNameFailed'))
    } finally {
      setAiNaming(false)
    }
  }, [renameTarget, boards, t])

  const handleRenameDialogClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setRenameTarget(null)
        unlockHover()
      }
    },
    [unlockHover],
  )

  // --- Render ---
  const title =
    type === 'all-chats' ? t('header.chatHistory') : t('hoverPanel.projectChats')

  const emptyText =
    type === 'all-chats' ? t('hoverPanel.noHistory') : t('hoverPanel.noChats')

  return (
    <>
      <HoverCard open={hoverOpen} onOpenChange={handleHoverOpenChange} openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>{children}</HoverCardTrigger>
        <HoverCardContent
          side={side}
          sideOffset={16}
          align={align}
          className="w-80 max-h-[40rem] flex flex-col rounded-lg border border-border bg-popover p-0 shadow-lg"
        >
          <div className="shrink-0 px-3 py-2.5 text-xs font-semibold text-foreground/80 border-b border-border">
            {title}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">...</div>
            ) : groups.length === 0 ? (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                {emptyText}
              </div>
            ) : (
              <div className="py-1">
                {groups.map((group) => (
                  <div key={group.key}>
                    <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground/70">
                      {tAi(group.labelKey, { defaultValue: group.labelKey })}
                    </div>
                    {group.items.map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className="group/history-item flex w-full items-center gap-1 px-2 py-0.5 text-sm hover:bg-accent transition-colors duration-150"
                      >
                        <button
                          type="button"
                          className="flex flex-1 min-w-0 items-center gap-2 py-1 text-left"
                          onClick={() => handleItemClick(item)}
                        >
                          {item.kind === 'board' ? (
                            <Palette className="h-3.5 w-3.5 shrink-0 text-ol-green/70" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-ol-purple/70" />
                          )}
                          {type === 'all-chats' &&
                            item.projectId &&
                            projectNameMap.get(item.projectId) && (
                              <span
                                className={`shrink-0 max-w-20 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none ${getProjectColor(item.projectId).bg} ${getProjectColor(item.projectId).text}`}
                              >
                                {projectNameMap.get(item.projectId)}
                              </span>
                            )}
                          <span className="flex-1 truncate min-w-0 text-foreground/90">
                            {item.title}
                          </span>
                        </button>
                        <DropdownMenu
                          onOpenChange={(open) => {
                            if (open) lockHover()
                            else unlockHover()
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 group-hover/history-item:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={4}>
                            <DropdownMenuItem
                              onClick={() => handleRename(item)}
                            >
                              <Edit2 className="mr-2 h-4 w-4" />
                              {t('chatHistoryList.contextMenu.rename')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handlePin(item)}
                            >
                              <Pin className="mr-2 h-4 w-4" />
                              {tAi(item.isPin ? 'session.unpin' : 'session.pin')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('chatHistoryList.contextMenu.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Board rename dialog (rendered outside HoverCard to avoid portal issues) */}
      <Dialog open={!!renameTarget} onOpenChange={handleRenameDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('canvasList.renameTitle')}</DialogTitle>
            <DialogDescription>{t('canvasList.renameDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              value={renameTarget?.nextTitle ?? ''}
              onChange={(e) =>
                setRenameTarget((prev) =>
                  prev ? { ...prev, nextTitle: e.target.value } : prev,
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBoardRenameSave()
              }}
              className="flex-1"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <Button
              variant="outline"
              size="icon"
              title={t('canvasList.aiName')}
              disabled={aiNaming}
              onClick={handleAiName}
            >
              {aiNaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tCommon('cancel')}</Button>
            </DialogClose>
            <Button onClick={handleBoardRenameSave}>{tCommon('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
