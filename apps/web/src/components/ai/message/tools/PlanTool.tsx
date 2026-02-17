"use client";

import type { PlanItem } from "@tenas-ai/api/types/tools/runtime";
import {
  normalizeToolInput,
} from "./shared/tool-utils";
import type { AnyToolPart } from "./shared/tool-utils";
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
  const isStreaming = part.state === "input-streaming" || part.state === "input-available";
  const description =
    typeof input?.explanation === "string" && input.explanation.trim()
      ? input.explanation.trim()
      : "执行计划";
  if (!hasError && plan.length === 0) return null;

  return (
    <Plan
      defaultOpen
      isStreaming={isStreaming}
      className={className}
    >
      <PlanHeader>
        <div>
          <PlanTitle>执行计划</PlanTitle>
          <PlanDescription>{description}</PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent>
        {hasError ? (
          <div className="text-destructive text-sm">{String(part.errorText ?? "")}</div>
        ) : (
          <PlanStepList plan={plan} />
        )}
      </PlanContent>
    </Plan>
  );
}
