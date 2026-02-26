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

import { AgentManagement } from '@/components/setting/menus/agent/AgentManagement'

type ProjectAgentsPageProps = {
  projectId?: string
}

/** Project-level agent management page (shown in project tab). */
export default function ProjectAgentsPage({
  projectId,
}: ProjectAgentsPageProps) {
  return (
    <div className="h-full w-full overflow-auto p-2">
      <AgentManagement projectId={projectId} />
    </div>
  )
}
