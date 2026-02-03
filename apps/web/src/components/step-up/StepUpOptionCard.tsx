import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type StepUpOptionCardProps = ComponentProps<"button"> & {
  /** Card title text. */
  title: string;
  /** Card description text. */
  description: string;
  /** Whether this option is selected. */
  selected: boolean;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional corner badge label. */
  cornerBadge?: string;
};

/** Render a large, minimal option card for step-up choices. */
export function StepUpOptionCard({
  title,
  description,
  selected,
  onClick,
  icon,
  className,
  cornerBadge,
  ...props
}: StepUpOptionCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      {...props}
      className={cn(
        "relative flex min-h-[140px] w-full items-center gap-8 overflow-hidden rounded-2xl border bg-background/80 p-8 text-left transition",
        "transition-transform duration-200 ease-out",
        "hover:border-primary/40 hover:bg-background",
        selected && "border-primary/50 ring-2 ring-primary/15 scale-100",
        className,
      )}
    >
      {cornerBadge ? (
        <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 overflow-hidden">
          <span className="absolute right-[-44px] top-[18px] rotate-45 bg-foreground px-12 py-1 text-[11px] font-semibold tracking-[0.25em] text-background">
            {cornerBadge}
          </span>
        </div>
      ) : null}
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/70">
          {icon}
        </div>
      ) : null}
      <div className="flex-1 space-y-1">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-base text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}
