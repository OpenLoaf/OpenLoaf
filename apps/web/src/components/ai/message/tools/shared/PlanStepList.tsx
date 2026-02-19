"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { PlanItem } from "@tenas-ai/api/types/tools/runtime";
import { CheckCircle2, Circle, CircleDashed, Loader2 } from "lucide-react";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";

const PLAN_STATUS_META: Record<
  PlanItem["status"],
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badgeClassName: string;
    iconClassName: string;
  }
> = {
  pending: {
    label: "待办",
    Icon: CircleDashed,
    badgeClassName: "bg-muted text-muted-foreground",
    iconClassName: "text-muted-foreground",
  },
  in_progress: {
    label: "进行中",
    Icon: Loader2,
    badgeClassName: "bg-primary/10 text-primary",
    iconClassName: "text-primary animate-spin",
  },
  completed: {
    label: "已完成",
    Icon: CheckCircle2,
    badgeClassName: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
};

type PlanStepListProps = {
  plan: PlanItem[];
  className?: string;
};

export default function PlanStepList({ plan, className }: PlanStepListProps) {
  const completedCount = plan.filter((item) => item.status === "completed").length;

  return (
    <Task defaultOpen className={cn("space-y-0", className)}>
      <TaskTrigger
        title={`计划进度 ${completedCount}/${plan.length}`}
        className="mb-1 text-xs text-muted-foreground"
      />
      <TaskContent className="mt-2 space-y-2 border-l-0 pl-0">
        {plan.map((item, index) => {
          const meta = PLAN_STATUS_META[item.status];
          const Icon = meta.Icon ?? Circle;
          return (
            <TaskItem
              key={item.step}
              className="px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClassName)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      meta.badgeClassName,
                    )}
                  >
                    {meta.label}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground break-words [overflow-wrap:anywhere]">
                    {item.step}
                  </p>
                </div>
              </div>
            </TaskItem>
          );
        })}
      </TaskContent>
    </Task>
  );
}
