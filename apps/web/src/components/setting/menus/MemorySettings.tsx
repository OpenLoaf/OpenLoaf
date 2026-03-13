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

import { memo, useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Brain, Eye, PencilLine, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Streamdown, defaultRemarkPlugins } from 'streamdown'
import { Button } from '@openloaf/ui/button'
import { Textarea } from '@openloaf/ui/textarea'
import { OpenLoafSettingsCard } from '@openloaf/ui/openloaf/OpenLoafSettingsCard'
import { OpenLoafSettingsGroup } from '@openloaf/ui/openloaf/OpenLoafSettingsGroup'
import { trpc } from '@/utils/trpc'

const MEMORY_MAX_LINES = 200

const REMARK_PLUGINS = Object.values(defaultRemarkPlugins)

type MemoryEditorProps = {
  scope: 'user' | 'project'
  projectId?: string
}

/** Shared memory editor used in both global and project settings. */
const MemoryEditor = memo(function MemoryEditor({ scope, projectId }: MemoryEditorProps) {
  const { t } = useTranslation(['settings'])
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const [synced, setSynced] = useState(false)

  const memoryQuery = useQuery({
    ...trpc.settings.getMemory.queryOptions({ scope, projectId }),
  })

  useEffect(() => {
    if (memoryQuery.data && !synced) {
      setContent(memoryQuery.data.content)
      setPreview(Boolean(memoryQuery.data.content))
      setSynced(true)
    }
  }, [memoryQuery.data, synced])

  const saveMutation = useMutation({
    ...trpc.settings.saveMemory.mutationOptions(),
    onSuccess: () => {
      toast.success(t('settings:memory.saved'))
      memoryQuery.refetch()
    },
  })

  const handleSave = useCallback(() => {
    saveMutation.mutate({ scope, content, projectId })
  }, [scope, content, projectId, saveMutation])

  const lineCount = content ? content.split('\n').length : 0
  const isDirty = content !== (memoryQuery.data?.content ?? '')
  const nearLimit = lineCount > MEMORY_MAX_LINES * 0.8

  return (
    <OpenLoafSettingsGroup
      title={t('settings:memory.title')}
      subtitle={scope === 'project' ? t('settings:memory.subtitleProject') : t('settings:memory.subtitle')}
      icon={<Brain className="h-4 w-4 text-ol-green" />}
      showBorder={false}
    >
      <div className="space-y-2">
        {/* toolbar */}
        <div className="flex items-center justify-between">
          <span className={`text-xs tabular-nums ${nearLimit ? 'text-ol-amber' : 'text-muted-foreground'}`}>
            {lineCount}/{MEMORY_MAX_LINES}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-3 text-xs bg-ol-green-bg text-ol-green hover:bg-ol-green-bg-hover hover:text-ol-green"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? <PencilLine className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {preview ? t('settings:memory.edit') : t('settings:memory.preview')}
          </Button>
        </div>

        {/* content */}
        {memoryQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">{t('settings:memory.loading')}</p>
        ) : preview ? (
          <OpenLoafSettingsCard padding="none">
            <div className="min-h-[300px] overflow-auto p-4">
              <Streamdown mode="static" className="streamdown-viewer space-y-3" remarkPlugins={REMARK_PLUGINS}>
                {content || t('settings:memory.empty')}
              </Streamdown>
            </div>
          </OpenLoafSettingsCard>
        ) : (
          <OpenLoafSettingsCard padding="none">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('settings:memory.placeholder')}
              rows={16}
              className="min-h-[300px] resize-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
              style={{ height: `${Math.max(300, (lineCount + 2) * 18)}px` }}
            />
          </OpenLoafSettingsCard>
        )}

        {/* save button — only in edit mode */}
        {!preview ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-7 rounded-full px-4 text-xs bg-ol-green text-white hover:bg-ol-green"
              onClick={handleSave}
              disabled={saveMutation.isPending || !isDirty}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              {saveMutation.isPending ? t('settings:memory.saving') : t('settings:memory.save')}
            </Button>
          </div>
        ) : null}
      </div>
    </OpenLoafSettingsGroup>
  )
})

/** Global memory settings page (scope=user). */
export function MemorySettings() {
  return <MemoryEditor scope="user" />
}

/** Project memory settings page (scope=project). */
export function ProjectMemorySettings({ projectId }: { projectId?: string; rootUri?: string }) {
  return <MemoryEditor scope="project" projectId={projectId} />
}
