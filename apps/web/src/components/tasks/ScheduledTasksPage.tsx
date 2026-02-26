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
import { ScheduledTaskList } from './ScheduledTaskList'

/** Workspace-level scheduled tasks page (shown in sidebar tab). */
export default function ScheduledTasksPage() {
  const { workspace } = useWorkspace()
  if (!workspace) return null

  return (
    <div className="h-full w-full overflow-auto p-4">
      <ScheduledTaskList
        workspaceId={workspace.id}
        showProjectColumn
      />
    </div>
  )
}
