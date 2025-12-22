interface ProjectTasksProps {
  isLoading: boolean;
  pageId?: string;
}

export default function ProjectTasks({ isLoading, pageId }: ProjectTasksProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Project / 任务</div>
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
}
