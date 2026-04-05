/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { PlanItem } from "@openloaf/api/types/tools/runtime";
import { CheckCircle2, Circle, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";

/** i18n key for each status label + visual config. */
const PLAN_STATUS_META: Record<
  PlanItem["status"],
  {
    /** i18n key under "ai" namespace (e.g. "plan.statusPending"). */
    labelKey: string;
    Icon: React.ComponentType<{ className?: string }>;
    badgeClassName: string;
    iconClassName: string;
  }
> = {
  pending: {
    labelKey: "plan.statusPending",
    Icon: CircleDashed,
    badgeClassName: "bg-muted text-muted-foreground",
    iconClassName: "text-muted-foreground",
  },
  in_progress: {
    labelKey: "plan.statusInProgress",
    Icon: Loader2,
    badgeClassName: "bg-primary/10 text-primary",
    iconClassName: "text-primary animate-spin",
  },
  completed: {
    labelKey: "plan.statusCompleted",
    Icon: CheckCircle2,
    badgeClassName: "bg-secondary text-foreground",
    iconClassName: "text-foreground",
  },
  failed: {
    labelKey: "plan.statusFailed",
    Icon: XCircle,
    badgeClassName: "bg-destructive/10 text-destructive",
    iconClassName: "text-destructive",
  },
};

type PlanStepListProps = {
  plan: PlanItem[];
  className?: string;
};

export default function PlanStepList({ plan, className }: PlanStepListProps) {
  const { t: tAi } = useTranslation("ai");
  const completedCount = plan.filter((item) => item.status === "completed").length;

  return (
    <Task defaultOpen className={cn("space-y-0", className)}>
      <TaskTrigger
        title={tAi("plan.progress", { completed: completedCount, total: plan.length })}
        className="mb-1 text-xs text-muted-foreground"
      />
      <TaskContent className="mt-2 space-y-2 border-l-0 pl-0">
        {plan.map((item, index) => {
          const meta = PLAN_STATUS_META[item.status];
          const Icon = meta.Icon ?? Circle;
          return (
            <TaskItem
              key={`step-${index}`}
              className="px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClassName)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-3xl px-1.5 py-0.5 text-[10px] font-medium",
                      meta.badgeClassName,
                    )}
                  >
                    {tAi(meta.labelKey)}
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
