"use client";

import type { ReactNode } from "react";

type StepUpStepShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Render a stable step layout with fixed header placement. */
export function StepUpStepShell({ title, subtitle, children, footer }: StepUpStepShellProps) {
  return (
    <div className="grid min-h-[380px] grid-rows-[96px_1fr_auto] gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-center">
        <div className="text-3xl font-semibold">{title}</div>
        {subtitle ? (
          <div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      <div>{children}</div>
      {footer ? <div className="flex justify-center">{footer}</div> : null}
    </div>
  );
}
