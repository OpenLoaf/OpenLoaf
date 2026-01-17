import { memo } from "react";
import { SkillsSettingsPanel } from "@/components/setting/skills/SkillsSettingsPanel";

type ProjectSkillSettingsProps = {
  /** Project id for skills lookup. */
  projectId?: string;
  /** Project root uri (reserved). */
  rootUri?: string;
};

/** Project skill settings page. */
const ProjectSkillSettings = memo(function ProjectSkillSettings({
  projectId,
}: ProjectSkillSettingsProps) {
  return <SkillsSettingsPanel projectId={projectId} />;
});

export { ProjectSkillSettings };
