'use client'

import { AgentManagement } from '@/components/setting/menus/agent/AgentManagement'

type ProjectAgentSettingsProps = {
  projectId?: string
}

/** Project agent settings panel — wraps the shared AgentManagement. */
export function ProjectAgentSettings({ projectId }: ProjectAgentSettingsProps) {
  return <AgentManagement projectId={projectId} />
}
