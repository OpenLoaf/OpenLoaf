'use client'

import { SkillsSettingsPanel } from '@/components/setting/skills/SkillsSettingsPanel'

type ProjectSkillsSettingsProps = {
  projectId?: string
}

/** Project skills settings panel — wraps the shared SkillsSettingsPanel. */
export function ProjectSkillsSettings({ projectId }: ProjectSkillsSettingsProps) {
  return <SkillsSettingsPanel projectId={projectId} />
}
