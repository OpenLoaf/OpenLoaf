import { memo, useState } from "react";

import { Calendar } from "@/components/ui/calendar";

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

/** Project tasks panel. */
const ProjectTasks = memo(function ProjectTasks({
  isLoading,
  pageId,
}: ProjectTasksProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="w-full rounded-xl border border-border/60 bg-background/80 p-3"
          />
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">任务列表</div>
            <div className="text-xs text-muted-foreground">本周 · 12 项</div>
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`task-row-${index}`}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 px-3 py-2"
              >
                <div className="space-y-2">
                  <div className="h-2 w-36 rounded-full bg-muted" />
                  <div className="h-2 w-24 rounded-full bg-muted/70" />
                </div>
                <div className="h-6 w-6 rounded-full border border-dashed border-border/60" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">任务历史</div>
          <div className="text-xs text-muted-foreground">最近 7 天</div>
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`history-row-${index}`}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3"
            >
              <div className="mt-1 h-2 w-2 rounded-full bg-muted-foreground/60" />
              <div className="flex-1 space-y-2">
                <div className="h-2 w-44 rounded-full bg-muted" />
                <div className="h-2 w-28 rounded-full bg-muted/70" />
              </div>
              <div className="text-[11px] text-muted-foreground">09:30</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});

export { ProjectTasksHeader };
export default ProjectTasks;
