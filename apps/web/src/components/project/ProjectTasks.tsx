import { memo } from "react";

interface ProjectTasksProps {
  isLoading: boolean;
  pageId?: string;
}

interface ProjectTasksHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Project tasks header. */
const ProjectTasksHeader = memo(function ProjectTasksHeader({
  isLoading,
  pageTitle,
}: ProjectTasksHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">任务</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

const ProjectTasks = memo(function ProjectTasks({
  isLoading,
  pageId,
}: ProjectTasksProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3">
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
});

export { ProjectTasksHeader };
export default ProjectTasks;
