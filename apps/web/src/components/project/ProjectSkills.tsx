import { memo } from "react";

interface ProjectSkillsProps {
  isLoading: boolean;
  pageId?: string;
}

interface ProjectSkillsHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Project skills header. */
const ProjectSkillsHeader = memo(function ProjectSkillsHeader({
  isLoading,
  pageTitle,
}: ProjectSkillsHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">技能</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

const ProjectSkills = memo(function ProjectSkills({
  isLoading,
  pageId,
}: ProjectSkillsProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3">
    </div>
  );
});

export { ProjectSkillsHeader };
export default ProjectSkills;
