import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Render a minimal, large input for step-up forms. */
export function StepUpBasicInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-2xl border border-input bg-transparent px-4 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "outline-none focus:border-ring focus:ring-2 focus:ring-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    />
  );
}
