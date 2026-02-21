'use client'

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
