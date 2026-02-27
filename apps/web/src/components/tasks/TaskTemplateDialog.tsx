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

import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import { Label } from '@openloaf/ui/label'
import { Textarea } from '@openloaf/ui/textarea'
import { Badge } from '@openloaf/ui/badge'
import { cn } from '@/lib/utils'
import { FileText, Plus, Trash2 } from 'lucide-react'

type TaskTemplate = {
  id: string
  name: string
  description?: string
  agentName?: string
  priority?: string
  tags?: string[]
  triggerMode?: string
  createdAt: string
}

export function TaskTemplateDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}) {
  const queryClient = useQueryClient()
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null)
  const [overrideName, setOverrideName] = useState('')
  const [overrideDesc, setOverrideDesc] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState<string>('medium')

  const { data: templates = [], isLoading } = useQuery(
    trpc.scheduledTask.listTemplates.queryOptions({ workspaceId }),
  )

  const createFromTemplateMutation = useMutation(
    trpc.scheduledTask.createFromTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [['scheduledTask']] })
        onOpenChange(false)
        resetState()
      },
    }),
  )

  const createTemplateMutation = useMutation(
    trpc.scheduledTask.createTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [['scheduledTask']] })
        setShowCreateForm(false)
        setNewName('')
        setNewDesc('')
        setNewPriority('medium')
      },
    }),
  )

  const deleteTemplateMutation = useMutation(
    trpc.scheduledTask.deleteTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [['scheduledTask']] })
        if (selectedTemplate) setSelectedTemplate(null)
      },
    }),
  )

  const resetState = useCallback(() => {
    setSelectedTemplate(null)
    setOverrideName('')
    setOverrideDesc('')
    setShowCreateForm(false)
  }, [])

  const handleSelectTemplate = useCallback((template: TaskTemplate) => {
    setSelectedTemplate(template)
    setOverrideName(template.name)
    setOverrideDesc(template.description ?? '')
  }, [])

  const handleCreateFromTemplate = useCallback(() => {
    if (!selectedTemplate) return
    createFromTemplateMutation.mutate({
      workspaceId,
      templateId: selectedTemplate.id,
      name: overrideName || undefined,
      description: overrideDesc || undefined,
    })
  }, [selectedTemplate, workspaceId, overrideName, overrideDesc, createFromTemplateMutation])

  const handleCreateTemplate = useCallback(() => {
    if (!newName.trim()) return
    createTemplateMutation.mutate({
      workspaceId,
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      priority: newPriority as 'urgent' | 'high' | 'medium' | 'low',
    })
  }, [newName, newDesc, newPriority, workspaceId, createTemplateMutation])

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetState() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {selectedTemplate ? '从模板创建任务' : '任务模板'}
          </DialogTitle>
        </DialogHeader>

        {selectedTemplate ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>任务名称</Label>
              <Input
                value={overrideName}
                onChange={(e) => setOverrideName(e.target.value)}
                placeholder="输入任务名称"
              />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={overrideDesc}
                onChange={(e) => setOverrideDesc(e.target.value)}
                placeholder="输入任务描述（可选）"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                返回
              </Button>
              <Button
                onClick={handleCreateFromTemplate}
                disabled={createFromTemplateMutation.isPending}
              >
                创建任务
              </Button>
            </DialogFooter>
          </div>
        ) : showCreateForm ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>模板名称</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="输入模板名称"
              />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="输入模板描述（可选）"
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                取消
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!newName.trim() || createTemplateMutation.isPending}
              >
                保存模板
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
                加载中...
              </div>
            ) : (templates as TaskTemplate[]).length === 0 ? (
              <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
                暂无模板
              </div>
            ) : (
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {(templates as TaskTemplate[]).map((tpl) => (
                  <div
                    key={tpl.id}
                    className="group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                    onClick={() => handleSelectTemplate(tpl)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tpl.name}</div>
                      {tpl.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {tpl.description}
                        </div>
                      )}
                    </div>
                    {tpl.priority && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {tpl.priority}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTemplateMutation.mutate({ id: tpl.id, workspaceId })
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateForm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                新建模板
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
