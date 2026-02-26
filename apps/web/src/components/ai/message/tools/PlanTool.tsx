"use client";

import type { PlanItem } from "@openloaf/api/types/tools/runtime";
import {
  isToolStreaming,
  normalizeToolInput,
} from "./shared/tool-utils";
import type { AnyToolPart } from "./shared/tool-utils";
import { cn } from "@/lib/utils";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import PlanStepList from "./shared/PlanStepList";

/** Render update-plan tool message. */
export default function PlanTool({ part, className }: { part: AnyToolPart; className?: string }) {
  const normalizedInput = normalizeToolInput(part.input);
  const input = normalizedInput as { explanation?: string; plan?: PlanItem[] } | null;
  const plan = Array.isArray(input?.plan) ? input?.plan : [];
  const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const isStreaming = isToolStreaming(part);
  const description =
    typeof input?.explanation === "string" && input.explanation.trim()
      ? input.explanation.trim()
      : "执行计划";
  if (!hasError && plan.length === 0) return null;

  return (
    <Plan
      defaultOpen
      isStreaming={isStreaming}
      className={cn("text-xs", className)}
    >
      <PlanHeader className="p-3 pb-2">
        <div>
          <PlanTitle>执行计划</PlanTitle>
          <PlanDescription>{description}</PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger className="size-6" />
        </PlanAction>
      </PlanHeader>
      <PlanContent className="px-3 pb-3 pt-0">
        {hasError ? (
          <div className="text-destructive text-xs">{String(part.errorText ?? "")}</div>
        ) : (
          <PlanStepList plan={plan} />
        )}
      </PlanContent>
    </Plan>
  );
}
