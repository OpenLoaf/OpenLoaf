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

import TaskBoardPage from './TaskBoardPage'

/** Scheduled tasks page (shown in sidebar tab or opened from chat). */
export default function ScheduledTasksPage({ projectId }: { projectId?: string }) {
  return <TaskBoardPage projectId={projectId} />
}
