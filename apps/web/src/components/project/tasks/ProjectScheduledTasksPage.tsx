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

import TaskBoardPage from '@/components/tasks/TaskBoardPage'

type ProjectScheduledTasksPageProps = {
  projectId?: string
}

/** Project-level scheduled tasks page — renders the same kanban board as workspace. */
export default function ProjectScheduledTasksPage({
  projectId,
}: ProjectScheduledTasksPageProps) {
  return <TaskBoardPage projectId={projectId} />
}
