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

import { AgentManagement } from '@/components/setting/menus/agent/AgentManagement'

type ProjectAgentSettingsProps = {
  projectId?: string
}

/** Project agent settings panel — wraps the shared AgentManagement. */
export function ProjectAgentSettings({ projectId }: ProjectAgentSettingsProps) {
  return <AgentManagement projectId={projectId} />
}
