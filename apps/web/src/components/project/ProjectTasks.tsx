import { Skeleton } from "@/components/ui/skeleton";

interface ProjectTasksProps {
  isLoading: boolean;
  pageId?: string;
}

export default function ProjectTasks({ isLoading, pageId }: ProjectTasksProps) {
  if (isLoading) {
    return (
      <div className="h-full space-y-3 mt-3">
        <Skeleton className="h-10 w-[32%]" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Project / 任务</div>
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
}
