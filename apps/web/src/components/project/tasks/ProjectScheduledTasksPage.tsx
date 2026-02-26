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

import { useWorkspace } from '@/components/workspace/workspaceContext'
import { ScheduledTaskList } from '@/components/tasks/ScheduledTaskList'

type ProjectScheduledTasksPageProps = {
  projectId?: string
}

/** Project-level scheduled tasks page (shown in project tab). */
export default function ProjectScheduledTasksPage({
  projectId,
}: ProjectScheduledTasksPageProps) {
  const { workspace } = useWorkspace()
  if (!workspace) return null

  return (
    <div className="h-full w-full overflow-auto p-2">
      <ScheduledTaskList
        workspaceId={workspace.id}
        projectId={projectId}
      />
    </div>
  )
}
