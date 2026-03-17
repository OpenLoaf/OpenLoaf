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

import { FolderOpen, ArrowRight } from 'lucide-react'
import { useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@openloaf/ui/button'
import { useSidebarNavigation } from '@/hooks/use-sidebar-navigation'
import { trpc } from '@/utils/trpc'

type TempProjectNotificationProps = {
  projectId: string
  projectRoot: string
}

export default function TempProjectNotification({
  projectId,
  projectRoot,
}: TempProjectNotificationProps) {
  const { openProject } = useSidebarNavigation()

  const promoteMutation = useMutation(
    trpc.project.promoteTempProject.mutationOptions(),
  )

  const handleOpen = useCallback(() => {
    openProject({
      projectId,
      title: '临时项目',
      rootUri: projectRoot,
    })
  }, [openProject, projectId, projectRoot])

  const handlePromote = useCallback(() => {
    promoteMutation.mutate({ projectId })
  }, [promoteMutation, projectId])

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <FolderOpen className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="text-amber-800 dark:text-amber-200">
        文件已保存到临时项目
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleOpen}
        >
          打开项目
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handlePromote}
          disabled={promoteMutation.isPending}
        >
          {promoteMutation.isPending ? '转换中...' : '转为正式项目'}
          {!promoteMutation.isPending && <ArrowRight className="ml-1 size-3" />}
        </Button>
      </div>
    </div>
  )
}
