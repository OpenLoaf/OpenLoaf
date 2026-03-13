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

import { lazy, memo, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Brain } from 'lucide-react'
import { OpenLoafSettingsGroup } from '@openloaf/ui/openloaf/OpenLoafSettingsGroup'
import { trpc } from '@/utils/trpc'

const FolderTreePreview = lazy(
  () => import('@/components/project/filesystem/FolderTreePreview'),
)

type MemoryEditorProps = {
  scope: 'user' | 'project'
  projectId?: string
}

/** Memory settings panel — embeds folder-tree-preview for memory directory. */
const MemoryEditor = memo(function MemoryEditor({ scope, projectId }: MemoryEditorProps) {
  const { t } = useTranslation(['settings'])

  const dirUriQuery = useQuery({
    ...trpc.settings.getMemoryDirUri.queryOptions({ scope, projectId }),
  })

  const { dirUri, indexUri } = dirUriQuery.data ?? {}

  return (
    <OpenLoafSettingsGroup
      title={t('settings:memory.title')}
      subtitle={scope === 'project' ? t('settings:memory.subtitleProject') : t('settings:memory.subtitle')}
      icon={<Brain className="h-4 w-4 text-ol-green" />}
      showBorder={false}
    >
      <div className="h-[500px] overflow-hidden rounded-xl border border-border/60">
        {dirUriQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t('settings:memory.loading')}
          </div>
        ) : dirUri ? (
          <Suspense fallback={null}>
            <FolderTreePreview
              rootUri={dirUri}
              currentUri={indexUri || dirUri}
              currentEntryKind="file"
              projectId={scope === 'project' ? projectId : undefined}
              projectTitle={t('settings:memory.title')}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t('settings:memory.empty')}
          </div>
        )}
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
